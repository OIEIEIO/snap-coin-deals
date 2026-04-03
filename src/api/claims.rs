// -----------------------------------------------------------------------------
// File: src/api/claims.rs
// Tree: snap-coin-deals/src/api/claims.rs
// Description: Deal claim recording, listing, verification, and redemption
// Version: 0.1.1
// Comments: Fixed borrow-after-move on tracing::info line — clone id fields
//           before struct build so logging has valid references
//           A claim is created when a member claims a deal
//           redeemed flag flips to true when business marks it used
//           snap_tx is populated when the chain opcode fires — empty until then
//           claimed_at is UTC timestamp
//           one member can only claim a deal once
//           calls deals::increment_claim_count on successful claim
// -----------------------------------------------------------------------------

#![allow(dead_code)]
#![allow(unused)]

use axum::{extract::State, http::StatusCode, Json};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::fs;
use crate::app_state::AppState;
use crate::api::deals::increment_claim_count;

const CLAIMS_FILE: &str = "config/claims.json";

// -----------------------------------------------------------------------------
// Data model
// -----------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claim {
    pub id:                 String,
    pub member_id:          String,
    pub deal_id:            String,
    pub business_id:        String,
    pub cad_value_redeemed: f64,
    pub snap_tx:            String,
    pub claimed_at:         String,
    pub redeemed:           bool,
}

// -----------------------------------------------------------------------------
// Request / Response types
// -----------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
pub struct CreateClaimRequest {
    pub id:          String,
    pub member_id:   String,
    pub deal_id:     String,
    pub business_id: String,
    pub cad_value:   f64,
}

#[derive(Debug, Serialize)]
pub struct CreateClaimResponse {
    pub success: bool,
    pub id:      String,
    pub message: String,
}

#[derive(Debug, Deserialize)]
pub struct RedeemClaimRequest {
    pub id:          String,
    pub business_id: String,
}

#[derive(Debug, Serialize)]
pub struct RedeemClaimResponse {
    pub success: bool,
    pub id:      String,
    pub message: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateSnapTxRequest {
    pub id:      String,
    pub snap_tx: String,
}

#[derive(Debug, Deserialize)]
pub struct ListByMemberRequest {
    pub member_id: String,
}

#[derive(Debug, Deserialize)]
pub struct ListByBusinessRequest {
    pub business_id: String,
}

#[derive(Debug, Serialize)]
pub struct ClaimsListResponse {
    pub claims:         Vec<Claim>,
    pub total:          usize,
    pub total_redeemed: usize,
    pub total_value:    f64,
}

#[derive(Debug, Deserialize)]
pub struct VerifyClaimRequest {
    pub member_id: String,
    pub deal_id:   String,
}

#[derive(Debug, Serialize)]
pub struct VerifyClaimResponse {
    pub claimed:    bool,
    pub redeemed:   bool,
    pub claim_id:   String,
    pub claimed_at: String,
    pub message:    String,
}

// -----------------------------------------------------------------------------
// File helpers
// -----------------------------------------------------------------------------

fn load_claims() -> Result<Vec<Claim>, StatusCode> {
    let raw = fs::read_to_string(CLAIMS_FILE)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if raw.trim().is_empty() || raw.trim() == "[]" {
        return Ok(vec![]);
    }

    serde_json::from_str(&raw)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

fn save_claims(claims: &Vec<Claim>) -> Result<(), StatusCode> {
    let json = serde_json::to_string_pretty(claims)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    fs::write(CLAIMS_FILE, json)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

fn now_utc() -> String {
    chrono::Utc::now().to_rfc3339()
}

// -----------------------------------------------------------------------------
// POST /api/claims/create
// Member claims a deal
// Checks: no duplicate claim by same member on same deal
// Calls increment_claim_count — returns 409 if deal is full
// snap_tx is empty at this point — populated later via /api/claims/update-tx
// -----------------------------------------------------------------------------

pub async fn create_claim(
    State(_state): State<Arc<AppState>>,
    Json(req): Json<CreateClaimRequest>,
) -> Result<Json<CreateClaimResponse>, StatusCode> {
    let mut claims = load_claims()?;

    // one claim per member per deal
    if claims.iter().any(|c| c.member_id == req.member_id && c.deal_id == req.deal_id) {
        return Ok(Json(CreateClaimResponse {
            success: false,
            id:      req.id,
            message: "already claimed this deal".to_string(),
        }));
    }

    // increment deal counter — returns 409 if claims_max reached
    increment_claim_count(&req.deal_id)?;

    // clone fields needed for logging before they move into the struct
    let log_id        = req.id.clone();
    let log_member_id = req.member_id.clone();
    let log_deal_id   = req.deal_id.clone();

    let claim = Claim {
        id:                 req.id,
        member_id:          req.member_id,
        deal_id:            req.deal_id,
        business_id:        req.business_id,
        cad_value_redeemed: req.cad_value,
        snap_tx:            String::new(),
        claimed_at:         now_utc(),
        redeemed:           false,
    };

    claims.push(claim);
    save_claims(&claims)?;

    tracing::info!("claim created: {} member {} deal {}", log_id, log_member_id, log_deal_id);

    Ok(Json(CreateClaimResponse {
        success: true,
        id:      log_id,
        message: "claim recorded — present to business for redemption".to_string(),
    }))
}

// -----------------------------------------------------------------------------
// POST /api/claims/redeem
// Business marks a claim as redeemed at point of service
// Only the owning business can redeem their own claims
// -----------------------------------------------------------------------------

pub async fn redeem_claim(
    State(_state): State<Arc<AppState>>,
    Json(req): Json<RedeemClaimRequest>,
) -> Result<Json<RedeemClaimResponse>, StatusCode> {
    let mut claims = load_claims()?;

    match claims.iter_mut().find(|c| c.id == req.id && c.business_id == req.business_id) {
        Some(c) => {
            if c.redeemed {
                return Ok(Json(RedeemClaimResponse {
                    success: false,
                    id:      req.id,
                    message: "claim already redeemed".to_string(),
                }));
            }
            c.redeemed = true;
            save_claims(&claims)?;
            tracing::info!("claim redeemed: {}", req.id);
            Ok(Json(RedeemClaimResponse {
                success: true,
                id:      req.id,
                message: "claim redeemed successfully".to_string(),
            }))
        }
        None => Err(StatusCode::NOT_FOUND),
    }
}

// -----------------------------------------------------------------------------
// POST /api/claims/update-tx
// Attach chain transaction id to a claim after opcode fires
// Called by the platform after SNAP opcode is confirmed on chain
// -----------------------------------------------------------------------------

pub async fn update_snap_tx(
    State(_state): State<Arc<AppState>>,
    Json(req): Json<UpdateSnapTxRequest>,
) -> Result<StatusCode, StatusCode> {
    let mut claims = load_claims()?;

    match claims.iter_mut().find(|c| c.id == req.id) {
        Some(c) => {
            c.snap_tx = req.snap_tx;
            save_claims(&claims)?;
            tracing::info!("claim snap_tx updated: {}", req.id);
            Ok(StatusCode::OK)
        }
        None => Err(StatusCode::NOT_FOUND),
    }
}

// -----------------------------------------------------------------------------
// POST /api/claims/verify
// Check if a member has already claimed a specific deal
// Used by UI before showing the claim button
// -----------------------------------------------------------------------------

pub async fn verify_claim(
    State(_state): State<Arc<AppState>>,
    Json(req): Json<VerifyClaimRequest>,
) -> Result<Json<VerifyClaimResponse>, StatusCode> {
    let claims = load_claims()?;

    match claims.iter().find(|c| c.member_id == req.member_id && c.deal_id == req.deal_id) {
        Some(c) => Ok(Json(VerifyClaimResponse {
            claimed:    true,
            redeemed:   c.redeemed,
            claim_id:   c.id.clone(),
            claimed_at: c.claimed_at.clone(),
            message:    if c.redeemed { "claimed and redeemed".to_string() }
                        else          { "claimed — not yet redeemed".to_string() },
        })),
        None => Ok(Json(VerifyClaimResponse {
            claimed:    false,
            redeemed:   false,
            claim_id:   String::new(),
            claimed_at: String::new(),
            message:    "not yet claimed".to_string(),
        })),
    }
}

// -----------------------------------------------------------------------------
// POST /api/claims/by-member
// Member views their own claim history and savings
// -----------------------------------------------------------------------------

pub async fn list_claims_by_member(
    State(_state): State<Arc<AppState>>,
    Json(req): Json<ListByMemberRequest>,
) -> Result<Json<ClaimsListResponse>, StatusCode> {
    let claims = load_claims()?;

    let filtered: Vec<Claim> = claims
        .into_iter()
        .filter(|c| c.member_id == req.member_id)
        .collect();

    let total          = filtered.len();
    let total_redeemed = filtered.iter().filter(|c| c.redeemed).count();
    let total_value    = filtered.iter().map(|c| c.cad_value_redeemed).sum();

    Ok(Json(ClaimsListResponse {
        claims: filtered,
        total,
        total_redeemed,
        total_value,
    }))
}

// -----------------------------------------------------------------------------
// POST /api/claims/by-business
// Business views all claims against their deals
// -----------------------------------------------------------------------------

pub async fn list_claims_by_business(
    State(_state): State<Arc<AppState>>,
    Json(req): Json<ListByBusinessRequest>,
) -> Result<Json<ClaimsListResponse>, StatusCode> {
    let claims = load_claims()?;

    let filtered: Vec<Claim> = claims
        .into_iter()
        .filter(|c| c.business_id == req.business_id)
        .collect();

    let total          = filtered.len();
    let total_redeemed = filtered.iter().filter(|c| c.redeemed).count();
    let total_value    = filtered.iter().map(|c| c.cad_value_redeemed).sum();

    Ok(Json(ClaimsListResponse {
        claims: filtered,
        total,
        total_redeemed,
        total_value,
    }))
}

// -----------------------------------------------------------------------------
// File: src/api/claims.rs
// Tree: snap-coin-deals/src/api/claims.rs
// Created: 2026-04-02 | Updated: 2026-04-02 | Version: 0.1.1
// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------
// File: src/api/deals.rs
// Tree: snap-coin-deals/src/api/deals.rs
// Description: Deal posting, listing, lookup, expiry, and cancellation
// Version: 0.1.0
// Comments: Deals belong to a business via business_id
//           cad_value and snap_value are 1:1 — 1 SNAP = 1 CAD
//           claims_max = 0 means unlimited claims
//           expires_at is UTC timestamp string — empty string means no expiry
//           active flag — false hides deal from members
//           posted_at is set on creation
// -----------------------------------------------------------------------------

#![allow(dead_code)]
#![allow(unused)]

use axum::{extract::State, http::StatusCode, Json};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::fs;
use crate::app_state::AppState;

const DEALS_FILE: &str = "config/deals.json";

// -----------------------------------------------------------------------------
// Data model
// -----------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Deal {
    pub id:           String,
    pub business_id:  String,
    pub title:        String,
    pub description:  String,
    pub cad_value:    f64,
    pub snap_value:   f64,
    pub expires_at:   String,
    pub claims_max:   u32,
    pub claims_count: u32,
    pub posted_at:    String,
    pub active:       bool,
}

// -----------------------------------------------------------------------------
// Request / Response types
// -----------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
pub struct PostDealRequest {
    pub id:          String,
    pub business_id: String,
    pub title:       String,
    pub description: String,
    pub cad_value:   f64,
    pub expires_at:  Option<String>,
    pub claims_max:  Option<u32>,
}

#[derive(Debug, Serialize)]
pub struct PostDealResponse {
    pub success:    bool,
    pub id:         String,
    pub snap_value: f64,
    pub message:    String,
}

#[derive(Debug, Deserialize)]
pub struct GetDealRequest {
    pub id: String,
}

#[derive(Debug, Serialize)]
pub struct DealResponse {
    pub found:   bool,
    pub deal:    Option<Deal>,
    pub message: String,
}

#[derive(Debug, Deserialize)]
pub struct ListByBusinessRequest {
    pub business_id: String,
}

#[derive(Debug, Serialize)]
pub struct DealsListResponse {
    pub deals:       Vec<Deal>,
    pub total:       usize,
    pub total_value: f64,
}

#[derive(Debug, Deserialize)]
pub struct CancelDealRequest {
    pub id:          String,
    pub business_id: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateDealRequest {
    pub id:          String,
    pub business_id: String,
    pub title:       Option<String>,
    pub description: Option<String>,
    pub cad_value:   Option<f64>,
    pub expires_at:  Option<String>,
    pub claims_max:  Option<u32>,
}

// -----------------------------------------------------------------------------
// File helpers
// -----------------------------------------------------------------------------

fn load_deals() -> Result<Vec<Deal>, StatusCode> {
    let raw = fs::read_to_string(DEALS_FILE)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if raw.trim().is_empty() || raw.trim() == "[]" {
        return Ok(vec![]);
    }

    serde_json::from_str(&raw)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

fn save_deals(deals: &Vec<Deal>) -> Result<(), StatusCode> {
    let json = serde_json::to_string_pretty(deals)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    fs::write(DEALS_FILE, json)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

fn now_utc() -> String {
    chrono::Utc::now().to_rfc3339()
}

fn total_value(deals: &[Deal]) -> f64 {
    deals.iter().map(|d| d.cad_value).sum()
}

// -----------------------------------------------------------------------------
// POST /api/deals/post
// Business posts a new deal
// snap_value mirrors cad_value — 1:1 peg
// -----------------------------------------------------------------------------

pub async fn post_deal(
    State(_state): State<Arc<AppState>>,
    Json(req): Json<PostDealRequest>,
) -> Result<Json<PostDealResponse>, StatusCode> {
    let mut deals = load_deals()?;

    // no duplicate deal ids
    if deals.iter().any(|d| d.id == req.id) {
        return Ok(Json(PostDealResponse {
            success:    false,
            id:         req.id,
            snap_value: 0.0,
            message:    "deal id already exists".to_string(),
        }));
    }

    if req.cad_value <= 0.0 {
        return Ok(Json(PostDealResponse {
            success:    false,
            id:         req.id,
            snap_value: 0.0,
            message:    "cad_value must be greater than zero".to_string(),
        }));
    }

    let deal = Deal {
        id:           req.id.clone(),
        business_id:  req.business_id,
        title:        req.title,
        description:  req.description,
        cad_value:    req.cad_value,
        snap_value:   req.cad_value,   // 1:1 peg
        expires_at:   req.expires_at.unwrap_or_default(),
        claims_max:   req.claims_max.unwrap_or(0),
        claims_count: 0,
        posted_at:    now_utc(),
        active:       true,
    };

    let snap_value = deal.snap_value;

    deals.push(deal);
    save_deals(&deals)?;

    tracing::info!("deal posted: {} ${:.2} CAD", req.id, req.cad_value);

    Ok(Json(PostDealResponse {
        success:    true,
        id:         req.id,
        snap_value,
        message:    "deal posted successfully".to_string(),
    }))
}

// -----------------------------------------------------------------------------
// GET /api/deals
// Members see all active deals across all businesses
// -----------------------------------------------------------------------------

pub async fn list_deals(
    State(_state): State<Arc<AppState>>,
) -> Result<Json<DealsListResponse>, StatusCode> {
    let deals = load_deals()?;

    let active: Vec<Deal> = deals
        .into_iter()
        .filter(|d| d.active)
        .collect();

    let total_val = total_value(&active);
    let total     = active.len();

    Ok(Json(DealsListResponse {
        deals:       active,
        total,
        total_value: total_val,
    }))
}

// -----------------------------------------------------------------------------
// POST /api/deals/by-business
// List active deals for a specific business
// Used on the business dashboard and member business detail view
// -----------------------------------------------------------------------------

pub async fn list_deals_by_business(
    State(_state): State<Arc<AppState>>,
    Json(req): Json<ListByBusinessRequest>,
) -> Result<Json<DealsListResponse>, StatusCode> {
    let deals = load_deals()?;

    let filtered: Vec<Deal> = deals
        .into_iter()
        .filter(|d| d.business_id == req.business_id && d.active)
        .collect();

    let total_val = total_value(&filtered);
    let total     = filtered.len();

    Ok(Json(DealsListResponse {
        deals:       filtered,
        total,
        total_value: total_val,
    }))
}

// -----------------------------------------------------------------------------
// POST /api/deals/get
// Get a single deal by id
// -----------------------------------------------------------------------------

pub async fn get_deal(
    State(_state): State<Arc<AppState>>,
    Json(req): Json<GetDealRequest>,
) -> Result<Json<DealResponse>, StatusCode> {
    let deals = load_deals()?;

    match deals.into_iter().find(|d| d.id == req.id) {
        Some(d) => Ok(Json(DealResponse {
            found:   true,
            deal:    Some(d),
            message: "found".to_string(),
        })),
        None => Ok(Json(DealResponse {
            found:   false,
            deal:    None,
            message: "deal not found".to_string(),
        })),
    }
}

// -----------------------------------------------------------------------------
// POST /api/deals/update
// Business updates a deal — title, description, value, expiry, claims_max
// snap_value always mirrors cad_value on update
// -----------------------------------------------------------------------------

pub async fn update_deal(
    State(_state): State<Arc<AppState>>,
    Json(req): Json<UpdateDealRequest>,
) -> Result<StatusCode, StatusCode> {
    let mut deals = load_deals()?;

    match deals.iter_mut().find(|d| d.id == req.id && d.business_id == req.business_id) {
        Some(d) => {
            if let Some(title)       = req.title       { d.title       = title; }
            if let Some(description) = req.description { d.description = description; }
            if let Some(cad_value)   = req.cad_value   {
                d.cad_value  = cad_value;
                d.snap_value = cad_value;   // keep 1:1 peg
            }
            if let Some(expires_at)  = req.expires_at  { d.expires_at  = expires_at; }
            if let Some(claims_max)  = req.claims_max  { d.claims_max  = claims_max; }
            save_deals(&deals)?;
            tracing::info!("deal updated: {}", req.id);
            Ok(StatusCode::OK)
        }
        None => Err(StatusCode::NOT_FOUND),
    }
}

// -----------------------------------------------------------------------------
// POST /api/deals/cancel
// Business or admin cancels a deal — sets active to false
// claims_count is preserved for audit purposes
// -----------------------------------------------------------------------------

pub async fn cancel_deal(
    State(_state): State<Arc<AppState>>,
    Json(req): Json<CancelDealRequest>,
) -> Result<StatusCode, StatusCode> {
    let mut deals = load_deals()?;

    match deals.iter_mut().find(|d| d.id == req.id && d.business_id == req.business_id) {
        Some(d) => {
            d.active = false;
            save_deals(&deals)?;
            tracing::info!("deal cancelled: {}", req.id);
            Ok(StatusCode::OK)
        }
        None => Err(StatusCode::NOT_FOUND),
    }
}

// -----------------------------------------------------------------------------
// pub helper — called by claims.rs to increment claims_count
// -----------------------------------------------------------------------------

pub fn increment_claim_count(deal_id: &str) -> Result<(), StatusCode> {
    let mut deals = load_deals()?;

    match deals.iter_mut().find(|d| d.id == deal_id) {
        Some(d) => {
            // check claims_max — 0 means unlimited
            if d.claims_max > 0 && d.claims_count >= d.claims_max {
                return Err(StatusCode::CONFLICT);
            }
            d.claims_count += 1;
            // auto-deactivate if claims_max reached
            if d.claims_max > 0 && d.claims_count >= d.claims_max {
                d.active = false;
                tracing::info!("deal {} reached max claims — deactivated", deal_id);
            }
            save_deals(&deals)?;
            Ok(())
        }
        None => Err(StatusCode::NOT_FOUND),
    }
}

// -----------------------------------------------------------------------------
// File: src/api/deals.rs
// Tree: snap-coin-deals/src/api/deals.rs
// Created: 2026-04-02 | Version: 0.1.0
// -----------------------------------------------------------------------------
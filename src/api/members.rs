// -----------------------------------------------------------------------------
// File: src/api/members.rs
// Tree: snap-coin-deals/src/api/members.rs
// Description: Member registration, lookup, listing, and status endpoints
// Version: 0.1.0
// Comments: Members are created with a generated wallet and 100 SNAP starter
//           Role is always "member" — admin role handled in auth.rs
//           enrolled_at is UTC timestamp string
//           active flag used to suspend without deleting
// -----------------------------------------------------------------------------

#![allow(dead_code)]
#![allow(unused)]

use axum::{extract::State, http::StatusCode, Json};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::fs;
use crate::app_state::AppState;

const MEMBERS_FILE: &str = "config/members.json";
const STARTER_SNAP: f64  = 100.0;

// -----------------------------------------------------------------------------
// Data model
// -----------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Member {
    pub id:          String,
    pub wallet:      String,
    pub name:        String,
    pub role:        String,
    pub starter_snap: f64,
    pub enrolled_at: String,
    pub active:      bool,
}

// -----------------------------------------------------------------------------
// Request / Response types
// -----------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
pub struct EnrollMemberRequest {
    pub id:     String,
    pub name:   String,
    pub wallet: String,
}

#[derive(Debug, Serialize)]
pub struct EnrollMemberResponse {
    pub success:      bool,
    pub id:           String,
    pub wallet:       String,
    pub starter_snap: f64,
    pub message:      String,
}

#[derive(Debug, Deserialize)]
pub struct LookupMemberRequest {
    pub wallet: String,
}

#[derive(Debug, Serialize)]
pub struct MemberStatusResponse {
    pub found:       bool,
    pub active:      bool,
    pub name:        String,
    pub wallet:      String,
    pub enrolled_at: String,
    pub message:     String,
}

#[derive(Debug, Serialize)]
pub struct MembersListResponse {
    pub members: Vec<Member>,
    pub total:   usize,
}

#[derive(Debug, Deserialize)]
pub struct SuspendMemberRequest {
    pub id: String,
}

// -----------------------------------------------------------------------------
// File helpers
// -----------------------------------------------------------------------------

fn load_members() -> Result<Vec<Member>, StatusCode> {
    let raw = fs::read_to_string(MEMBERS_FILE)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if raw.trim().is_empty() || raw.trim() == "[]" {
        return Ok(vec![]);
    }

    serde_json::from_str(&raw)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

fn save_members(members: &Vec<Member>) -> Result<(), StatusCode> {
    let json = serde_json::to_string_pretty(members)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    fs::write(MEMBERS_FILE, json)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

fn now_utc() -> String {
    chrono::Utc::now().to_rfc3339()
}

// -----------------------------------------------------------------------------
// POST /api/members/enroll
// Registers a new member — wallet must be provided by caller
// Platform should send 100 SNAP to wallet after this returns success
// -----------------------------------------------------------------------------

pub async fn enroll_member(
    State(_state): State<Arc<AppState>>,
    Json(req): Json<EnrollMemberRequest>,
) -> Result<Json<EnrollMemberResponse>, StatusCode> {
    let mut members = load_members()?;

    // check for duplicate wallet
    if members.iter().any(|m| m.wallet == req.wallet) {
        return Ok(Json(EnrollMemberResponse {
            success:      false,
            id:           req.id,
            wallet:       req.wallet,
            starter_snap: 0.0,
            message:      "wallet already enrolled".to_string(),
        }));
    }

    let member = Member {
        id:           req.id.clone(),
        wallet:       req.wallet.clone(),
        name:         req.name,
        role:         "member".to_string(),
        starter_snap: STARTER_SNAP,
        enrolled_at:  now_utc(),
        active:       true,
    };

    members.push(member);
    save_members(&members)?;

    tracing::info!("member enrolled: {} {}", req.id, &req.wallet[..8]);

    Ok(Json(EnrollMemberResponse {
        success:      true,
        id:           req.id,
        wallet:       req.wallet,
        starter_snap: STARTER_SNAP,
        message:      "enrolled — send 100 SNAP to member wallet".to_string(),
    }))
}

// -----------------------------------------------------------------------------
// POST /api/members/lookup
// Business uses this to verify a member by wallet address
// Returns active status — green / red check at point of service
// -----------------------------------------------------------------------------

pub async fn lookup_member(
    State(_state): State<Arc<AppState>>,
    Json(req): Json<LookupMemberRequest>,
) -> Result<Json<MemberStatusResponse>, StatusCode> {
    let members = load_members()?;

    match members.iter().find(|m| m.wallet == req.wallet) {
        Some(m) => Ok(Json(MemberStatusResponse {
            found:       true,
            active:      m.active,
            name:        m.name.clone(),
            wallet:      m.wallet.clone(),
            enrolled_at: m.enrolled_at.clone(),
            message:     if m.active { "active member".to_string() }
                         else        { "member suspended".to_string() },
        })),
        None => Ok(Json(MemberStatusResponse {
            found:       false,
            active:      false,
            name:        String::new(),
            wallet:      req.wallet,
            enrolled_at: String::new(),
            message:     "not a member".to_string(),
        })),
    }
}

// -----------------------------------------------------------------------------
// GET /api/members
// Admin only — list all members
// -----------------------------------------------------------------------------

pub async fn list_members(
    State(_state): State<Arc<AppState>>,
) -> Result<Json<MembersListResponse>, StatusCode> {
    let members = load_members()?;
    let total   = members.len();

    Ok(Json(MembersListResponse { members, total }))
}

// -----------------------------------------------------------------------------
// POST /api/members/suspend
// Admin only — deactivates a member without deleting
// -----------------------------------------------------------------------------

pub async fn suspend_member(
    State(_state): State<Arc<AppState>>,
    Json(req): Json<SuspendMemberRequest>,
) -> Result<StatusCode, StatusCode> {
    let mut members = load_members()?;

    match members.iter_mut().find(|m| m.id == req.id) {
        Some(m) => {
            m.active = false;
            save_members(&members)?;
            tracing::info!("member suspended: {}", req.id);
            Ok(StatusCode::OK)
        }
        None => Err(StatusCode::NOT_FOUND),
    }
}

// -----------------------------------------------------------------------------
// File: src/api/members.rs
// Tree: snap-coin-deals/src/api/members.rs
// Created: 2026-04-02 | Version: 0.1.0
// -----------------------------------------------------------------------------
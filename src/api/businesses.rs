// -----------------------------------------------------------------------------
// File: src/api/businesses.rs
// Tree: snap-coin-deals/src/api/businesses.rs
// Description: Business enrollment, listing, lookup, and status endpoints
// Version: 0.1.0
// Comments: Businesses enroll with a wallet address — platform assigns them
//           category: food | retail | service | other
//           active flag used to suspend without deleting
//           enrolled_at is UTC timestamp string
//           role is always "business"
// -----------------------------------------------------------------------------

#![allow(dead_code)]
#![allow(unused)]

use axum::{extract::State, http::StatusCode, Json};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::fs;
use crate::app_state::AppState;

const BUSINESSES_FILE: &str = "config/businesses.json";

// -----------------------------------------------------------------------------
// Data model
// -----------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Business {
    pub id:          String,
    pub wallet:      String,
    pub name:        String,
    pub category:    String,
    pub description: String,
    pub role:        String,
    pub enrolled_at: String,
    pub active:      bool,
}

// -----------------------------------------------------------------------------
// Request / Response types
// -----------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
pub struct EnrollBusinessRequest {
    pub id:          String,
    pub wallet:      String,
    pub name:        String,
    pub category:    String,
    pub description: String,
}

#[derive(Debug, Serialize)]
pub struct EnrollBusinessResponse {
    pub success: bool,
    pub id:      String,
    pub wallet:  String,
    pub message: String,
}

#[derive(Debug, Deserialize)]
pub struct LookupBusinessRequest {
    pub wallet: String,
}

#[derive(Debug, Serialize)]
pub struct BusinessStatusResponse {
    pub found:       bool,
    pub active:      bool,
    pub id:          String,
    pub name:        String,
    pub category:    String,
    pub description: String,
    pub wallet:      String,
    pub enrolled_at: String,
    pub message:     String,
}

#[derive(Debug, Serialize)]
pub struct BusinessesListResponse {
    pub businesses: Vec<Business>,
    pub total:      usize,
}

#[derive(Debug, Deserialize)]
pub struct SuspendBusinessRequest {
    pub id: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateBusinessRequest {
    pub id:          String,
    pub name:        Option<String>,
    pub category:    Option<String>,
    pub description: Option<String>,
}

// -----------------------------------------------------------------------------
// File helpers
// -----------------------------------------------------------------------------

fn load_businesses() -> Result<Vec<Business>, StatusCode> {
    let raw = fs::read_to_string(BUSINESSES_FILE)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if raw.trim().is_empty() || raw.trim() == "[]" {
        return Ok(vec![]);
    }

    serde_json::from_str(&raw)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

fn save_businesses(businesses: &Vec<Business>) -> Result<(), StatusCode> {
    let json = serde_json::to_string_pretty(businesses)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    fs::write(BUSINESSES_FILE, json)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

fn now_utc() -> String {
    chrono::Utc::now().to_rfc3339()
}

// -----------------------------------------------------------------------------
// POST /api/businesses/enroll
// Registers a new business — wallet must be provided by caller
// Admin creates the wallet separately via /api/wallets/create
// -----------------------------------------------------------------------------

pub async fn enroll_business(
    State(_state): State<Arc<AppState>>,
    Json(req): Json<EnrollBusinessRequest>,
) -> Result<Json<EnrollBusinessResponse>, StatusCode> {
    let mut businesses = load_businesses()?;

    // check for duplicate wallet
    if businesses.iter().any(|b| b.wallet == req.wallet) {
        return Ok(Json(EnrollBusinessResponse {
            success: false,
            id:      req.id,
            wallet:  req.wallet,
            message: "wallet already enrolled as a business".to_string(),
        }));
    }

    // check for duplicate name
    if businesses.iter().any(|b| b.name.to_lowercase() == req.name.to_lowercase()) {
        return Ok(Json(EnrollBusinessResponse {
            success: false,
            id:      req.id,
            wallet:  req.wallet,
            message: "business name already registered".to_string(),
        }));
    }

    let business = Business {
        id:          req.id.clone(),
        wallet:      req.wallet.clone(),
        name:        req.name,
        category:    req.category,
        description: req.description,
        role:        "business".to_string(),
        enrolled_at: now_utc(),
        active:      true,
    };

    businesses.push(business);
    save_businesses(&businesses)?;

    tracing::info!("business enrolled: {} {}", req.id, &req.wallet[..8]);

    Ok(Json(EnrollBusinessResponse {
        success: true,
        id:      req.id,
        wallet:  req.wallet,
        message: "business enrolled successfully".to_string(),
    }))
}

// -----------------------------------------------------------------------------
// GET /api/businesses
// Public — all active businesses visible to members
// -----------------------------------------------------------------------------

pub async fn list_businesses(
    State(_state): State<Arc<AppState>>,
) -> Result<Json<BusinessesListResponse>, StatusCode> {
    let businesses = load_businesses()?;

    // members only see active businesses
    let active: Vec<Business> = businesses
        .into_iter()
        .filter(|b| b.active)
        .collect();

    let total = active.len();

    Ok(Json(BusinessesListResponse {
        businesses: active,
        total,
    }))
}

// -----------------------------------------------------------------------------
// GET /api/businesses/all
// Admin only — list all businesses including suspended
// -----------------------------------------------------------------------------

pub async fn list_businesses_all(
    State(_state): State<Arc<AppState>>,
) -> Result<Json<BusinessesListResponse>, StatusCode> {
    let businesses = load_businesses()?;
    let total      = businesses.len();

    Ok(Json(BusinessesListResponse { businesses, total }))
}

// -----------------------------------------------------------------------------
// POST /api/businesses/lookup
// Lookup a business by wallet address
// Used by members to see business details from a QR scan
// -----------------------------------------------------------------------------

pub async fn lookup_business(
    State(_state): State<Arc<AppState>>,
    Json(req): Json<LookupBusinessRequest>,
) -> Result<Json<BusinessStatusResponse>, StatusCode> {
    let businesses = load_businesses()?;

    match businesses.iter().find(|b| b.wallet == req.wallet) {
        Some(b) => Ok(Json(BusinessStatusResponse {
            found:       true,
            active:      b.active,
            id:          b.id.clone(),
            name:        b.name.clone(),
            category:    b.category.clone(),
            description: b.description.clone(),
            wallet:      b.wallet.clone(),
            enrolled_at: b.enrolled_at.clone(),
            message:     if b.active { "active business".to_string() }
                         else        { "business suspended".to_string() },
        })),
        None => Ok(Json(BusinessStatusResponse {
            found:       false,
            active:      false,
            id:          String::new(),
            name:        String::new(),
            category:    String::new(),
            description: String::new(),
            wallet:      req.wallet,
            enrolled_at: String::new(),
            message:     "business not found".to_string(),
        })),
    }
}

// -----------------------------------------------------------------------------
// POST /api/businesses/update
// Business owner or admin — update name, category, description
// -----------------------------------------------------------------------------

pub async fn update_business(
    State(_state): State<Arc<AppState>>,
    Json(req): Json<UpdateBusinessRequest>,
) -> Result<StatusCode, StatusCode> {
    let mut businesses = load_businesses()?;

    match businesses.iter_mut().find(|b| b.id == req.id) {
        Some(b) => {
            if let Some(name)        = req.name        { b.name        = name; }
            if let Some(category)    = req.category    { b.category    = category; }
            if let Some(description) = req.description { b.description = description; }
            save_businesses(&businesses)?;
            tracing::info!("business updated: {}", req.id);
            Ok(StatusCode::OK)
        }
        None => Err(StatusCode::NOT_FOUND),
    }
}

// -----------------------------------------------------------------------------
// POST /api/businesses/suspend
// Admin only — deactivates a business without deleting
// Suspended businesses are hidden from member listing
// -----------------------------------------------------------------------------

pub async fn suspend_business(
    State(_state): State<Arc<AppState>>,
    Json(req): Json<SuspendBusinessRequest>,
) -> Result<StatusCode, StatusCode> {
    let mut businesses = load_businesses()?;

    match businesses.iter_mut().find(|b| b.id == req.id) {
        Some(b) => {
            b.active = false;
            save_businesses(&businesses)?;
            tracing::info!("business suspended: {}", req.id);
            Ok(StatusCode::OK)
        }
        None => Err(StatusCode::NOT_FOUND),
    }
}

// -----------------------------------------------------------------------------
// File: src/api/businesses.rs
// Tree: snap-coin-deals/src/api/businesses.rs
// Created: 2026-04-02 | Version: 0.1.0
// -----------------------------------------------------------------------------
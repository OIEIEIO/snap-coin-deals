// -----------------------------------------------------------------------------
// File: src/api/businesses.rs
// Tree: snap-coin-deals/src/api/businesses.rs
// Description: Business enrollment, listing, lookup, and status endpoints
// Version: 0.2.0
// Comments: enroll_business now creates business wallet internally
//           BUSINESS_WALLET_PIN from .env encrypts all business wallet keys
//           ADMIN_WALLET_ID from .env is the target for onboarding SNAP send
//           onboarding_fee is the SNAP cost to onboard the business — set per business
//           backend creates wallet, saves business record, returns address
//           frontend sends onboarding_fee SNAP from admin wallet to business wallet
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
use snap_coin::crypto::keys::{Private, Public};
use crate::app_state::AppState;
use crate::wallet::store::{WalletEntry, WalletsFile};
use crate::wallet::pin::encrypt_key;

const BUSINESSES_FILE: &str = "config/businesses.json";
const WALLETS_FILE:    &str = "config/wallets.json";

// -----------------------------------------------------------------------------
// Data model
// -----------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Business {
    pub id:             String,
    pub wallet:         String,
    pub name:           String,
    pub category:       String,
    pub description:    String,
    pub onboarding_fee: f64,     // SNAP paid to onboard this business
    pub role:           String,
    pub enrolled_at:    String,
    pub active:         bool,
}

// -----------------------------------------------------------------------------
// Request / Response types
// -----------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
pub struct EnrollBusinessRequest {
    pub id:             String,
    pub name:           String,
    pub category:       String,
    pub description:    String,
    pub onboarding_fee: f64,
}

#[derive(Debug, Serialize)]
pub struct EnrollBusinessResponse {
    pub success:        bool,
    pub id:             String,
    pub wallet:         String,   // business wallet address — frontend sends onboarding_fee SNAP here
    pub onboarding_fee: f64,
    pub message:        String,
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
// Admin enrolls a new business — wallet created internally
// Returns business wallet address so frontend can send onboarding_fee SNAP to it
// -----------------------------------------------------------------------------

pub async fn enroll_business(
    State(_state): State<Arc<AppState>>,
    Json(req): Json<EnrollBusinessRequest>,
) -> Result<Json<EnrollBusinessResponse>, StatusCode> {
    let mut businesses = load_businesses()?;

    // check for duplicate name
    if businesses.iter().any(|b| b.name.to_lowercase() == req.name.to_lowercase()) {
        return Ok(Json(EnrollBusinessResponse {
            success:        false,
            id:             req.id,
            wallet:         String::new(),
            onboarding_fee: 0.0,
            message:        "business name already registered".to_string(),
        }));
    }

    if req.onboarding_fee < 0.0 {
        return Ok(Json(EnrollBusinessResponse {
            success:        false,
            id:             req.id,
            wallet:         String::new(),
            onboarding_fee: 0.0,
            message:        "onboarding_fee cannot be negative".to_string(),
        }));
    }

    // --- read env ---
    let business_wallet_pin = std::env::var("BUSINESS_WALLET_PIN")
        .map_err(|_| { tracing::error!("BUSINESS_WALLET_PIN not set"); StatusCode::INTERNAL_SERVER_ERROR })?;

    // --- generate business wallet keypair ---
    let private  = Private::new_random();
    let public   = private.to_public();
    let address  = public.dump_base36();
    let priv_b36 = private.dump_base36();

    let encrypted_key = encrypt_key(&priv_b36, &business_wallet_pin);

    // --- save business wallet to wallets.json ---
    let wallet_id = format!("biz_{}", req.id);

    let mut wallets = WalletsFile::load(WALLETS_FILE)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let order = wallets.next_order();

    wallets.add(wallet_id.clone(), WalletEntry {
        label:         format!("Business: {}", req.name),
        address:       address.clone(),
        encrypted_key,
        column:        Some("right".to_string()),
        order:         Some(order),
        locked:        true,
    });

    wallets.save(WALLETS_FILE)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // --- save business record ---
    let onboarding_fee = req.onboarding_fee;
    let biz_id         = req.id.clone();

    let business = Business {
        id:             req.id.clone(),
        wallet:         address.clone(),
        name:           req.name.clone(),
        category:       req.category,
        description:    req.description,
        onboarding_fee: req.onboarding_fee,
        role:           "business".to_string(),
        enrolled_at:    now_utc(),
        active:         true,
    };

    businesses.push(business);
    save_businesses(&businesses)?;

    tracing::info!(
        "business enrolled: {} onboarding_fee={} SNAP wallet={}",
        biz_id, onboarding_fee, &address[..8]
    );

    Ok(Json(EnrollBusinessResponse {
        success:        true,
        id:             req.id,
        wallet:         address,
        onboarding_fee,
        message:        "business enrolled — send onboarding_fee SNAP to business wallet".to_string(),
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

    let active: Vec<Business> = businesses
        .into_iter()
        .filter(|b| b.active)
        .collect();

    let total = active.len();

    Ok(Json(BusinessesListResponse { businesses: active, total }))
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
// Created: 2026-04-02 | Updated: 2026-04-04 | Version: 0.2.0
// -----------------------------------------------------------------------------
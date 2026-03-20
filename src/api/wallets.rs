// -----------------------------------------------------------------------------
// File: src/api/wallets.rs
// Project: snap-coin-msg
// Description: REST endpoints for wallet management - add, create, list
// Version: 0.2.0
// -----------------------------------------------------------------------------

use axum::{extract::State, http::StatusCode, Json};
use serde::{Deserialize, Serialize};
use snap_coin::crypto::keys::Private;
use std::sync::Arc;
use crate::app_state::AppState;
use crate::wallet::store::{WalletEntry, WalletsFile};
use crate::wallet::pin::encrypt_key;

#[derive(Debug, Serialize)]
pub struct WalletsResponse {
    pub wallets: Vec<WalletItem>,
}

#[derive(Debug, Serialize)]
pub struct WalletItem {
    pub id:       String,
    pub label:    String,
    pub address:  String,
    pub can_send: bool,
    pub column:   String,   // "left" or "right"
    pub order:    u32,
}

// --- ADD WALLET (import existing) ---

#[derive(Debug, Deserialize)]
pub struct AddWalletRequest {
    pub id:          String,
    pub label:       String,
    pub address:     String,
    pub private_key: Option<String>,
    pub pin:         Option<String>,
    pub column:      Option<String>,
}

// --- CREATE WALLET (generate new keypair) ---

#[derive(Debug, Deserialize)]
pub struct CreateWalletRequest {
    pub id:     String,
    pub label:  String,
    pub pin:    String,
    pub column: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct CreateWalletResponse {
    pub id:          String,
    pub label:       String,
    pub address:     String,
    pub private_key: String,   // shown once — user must save this
}

// --- MOVE WALLET COLUMN ---

#[derive(Debug, Deserialize)]
pub struct MoveWalletRequest {
    pub id:     String,
    pub column: String,   // "left" or "right"
}

pub async fn list_wallets(
    State(_state): State<Arc<AppState>>,
) -> Result<Json<WalletsResponse>, StatusCode> {
    let file = WalletsFile::load("config/wallets.json")
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let wallets = file
        .list()
        .iter()
        .map(|(id, w)| WalletItem {
            id:       id.to_string(),
            label:    w.label.clone(),
            address:  w.address.clone(),
            can_send: !w.encrypted_key.is_empty(),
            column:   w.column.clone().unwrap_or_else(|| "left".to_string()),
            order:    w.order.unwrap_or(0),
        })
        .collect();

    Ok(Json(WalletsResponse { wallets }))
}

pub async fn add_wallet(
    State(_state): State<Arc<AppState>>,
    Json(req): Json<AddWalletRequest>,
) -> Result<StatusCode, StatusCode> {
    let mut file = WalletsFile::load("config/wallets.json")
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let encrypted_key = match (&req.private_key, &req.pin) {
        (Some(key), Some(pin)) if !key.is_empty() => encrypt_key(key, pin),
        _ => String::new(),
    };

    let order = file.next_order();

    file.add(req.id, WalletEntry {
        label:         req.label,
        address:       req.address,
        encrypted_key,
        column:        Some(req.column.unwrap_or_else(|| "left".to_string())),
        order:         Some(order),
    });

    file.save("config/wallets.json")
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(StatusCode::CREATED)
}

pub async fn create_wallet(
    State(_state): State<Arc<AppState>>,
    Json(req): Json<CreateWalletRequest>,
) -> Result<Json<CreateWalletResponse>, StatusCode> {
    let mut file = WalletsFile::load("config/wallets.json")
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // generate new random keypair
    let private    = Private::new_random();
    let public     = private.to_public();
    let address    = public.dump_base36();
    let priv_b36   = private.dump_base36();

    let encrypted_key = encrypt_key(&priv_b36, &req.pin);
    let order         = file.next_order();

    file.add(req.id.clone(), WalletEntry {
        label:         req.label.clone(),
        address:       address.clone(),
        encrypted_key,
        column:        Some(req.column.unwrap_or_else(|| "left".to_string())),
        order:         Some(order),
    });

    file.save("config/wallets.json")
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    tracing::info!("wallet created: {} {}", req.label, &address[..8]);

    Ok(Json(CreateWalletResponse {
        id:          req.id,
        label:       req.label,
        address,
        private_key: priv_b36,   // shown once — frontend must display prominently
    }))
}

pub async fn move_wallet(
    State(_state): State<Arc<AppState>>,
    Json(req): Json<MoveWalletRequest>,
) -> Result<StatusCode, StatusCode> {
    let mut file = WalletsFile::load("config/wallets.json")
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    file.set_column(&req.id, &req.column)
        .map_err(|_| StatusCode::NOT_FOUND)?;

    file.save("config/wallets.json")
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(StatusCode::OK)
}

// -----------------------------------------------------------------------------
// File: src/api/wallets.rs
// Project: snap-coin-msg
// Created: 2026-03-19 | Updated: 2026-03-20
// -----------------------------------------------------------------------------
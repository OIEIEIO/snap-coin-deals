// -----------------------------------------------------------------------------
// File: src/api/wallets.rs
// Project: snap-coin-msg
// Description: REST endpoints for wallet management - add, create, list, send-snap
// Version: 0.3.0
// -----------------------------------------------------------------------------

use axum::{extract::State, http::StatusCode, Json};
use serde::{Deserialize, Serialize};
use snap_coin::crypto::keys::{Private, Public};
use std::sync::Arc;
use crate::app_state::AppState;
use crate::wallet::store::{WalletEntry, WalletsFile};
use crate::wallet::pin::{encrypt_key, decrypt_key};

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
    pub column:   String,
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
    pub column: String,
}

// --- SEND SNAP (plain transfer, no opcode) ---

#[derive(Debug, Deserialize)]
pub struct SendSnapRequest {
    pub from_wallet_id: String,
    pub to_address:     String,
    pub amount:         f64,
    pub pin:            String,
}

#[derive(Debug, Serialize)]
pub struct SendSnapResponse {
    pub status: String,
    pub amount: String,
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
        private_key: priv_b36,
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

pub async fn send_snap(
    State(state): State<Arc<AppState>>,
    Json(req): Json<SendSnapRequest>,
) -> Result<Json<SendSnapResponse>, StatusCode> {

    // load and decrypt wallet key
    let wallets = WalletsFile::load("config/wallets.json")
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let wallet = wallets.get(&req.from_wallet_id)
        .ok_or(StatusCode::NOT_FOUND)?;

    let private_key_str = decrypt_key(&wallet.encrypted_key, &req.pin)
        .map_err(|_| StatusCode::UNAUTHORIZED)?;

    let from_private = Private::new_from_base36(&private_key_str)
        .ok_or(StatusCode::UNAUTHORIZED)?;

    let to_public = Public::new_from_base36(&req.to_address)
        .ok_or(StatusCode::BAD_REQUEST)?;

    // convert decimal SNAP to 8-decimal atomic units
    let atomic = (req.amount * 100_000_000.0).round() as u64;
    if atomic == 0 {
        return Err(StatusCode::BAD_REQUEST);
    }

    state.outbound
        .submit_withdrawal(vec![(to_public, atomic)], from_private)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    tracing::info!("snap send: {} atomic units from {}", atomic, &wallet.address[..8]);

    Ok(Json(SendSnapResponse {
        status: "submitted".to_string(),
        amount: format!("{:.8}", req.amount),
    }))
}

// -----------------------------------------------------------------------------
// File: src/api/wallets.rs
// Project: snap-coin-msg
// Created: 2026-03-19 | Updated: 2026-03-20
// -----------------------------------------------------------------------------
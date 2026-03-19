// -----------------------------------------------------------------------------
// File: src/api/wallets.rs
// Project: snap-coin-msg
// Description: REST endpoints for wallet management
// Version: 0.1.0
// -----------------------------------------------------------------------------

use axum::{extract::State, http::StatusCode, Json};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use crate::app_state::AppState;
use crate::wallet::store::{WalletEntry, WalletsFile};
use crate::wallet::pin::{encrypt_key, verify_pin};

#[derive(Debug, Serialize)]
pub struct WalletsResponse {
    pub wallets: Vec<WalletItem>,
}

#[derive(Debug, Serialize)]
pub struct WalletItem {
    pub id: String,
    pub label: String,
    pub address: String,
}

#[derive(Debug, Deserialize)]
pub struct AddWalletRequest {
    pub id: String,
    pub label: String,
    pub address: String,
    pub private_key: String,
    pub pin: String,
}

#[derive(Debug, Deserialize)]
pub struct UnlockWalletRequest {
    pub id: String,
    pub pin: String,
}

#[derive(Debug, Serialize)]
pub struct UnlockWalletResponse {
    pub address: String,
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
            id: id.to_string(),
            label: w.label.clone(),
            address: w.address.clone(),
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

    let encrypted_key = encrypt_key(&req.private_key, &req.pin);

    file.add(req.id, WalletEntry {
        label: req.label,
        address: req.address,
        encrypted_key,
    });

    file.save("config/wallets.json")
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(StatusCode::CREATED)
}

pub async fn unlock_wallet(
    State(_state): State<Arc<AppState>>,
    Json(req): Json<UnlockWalletRequest>,
) -> Result<Json<UnlockWalletResponse>, StatusCode> {
    let file = WalletsFile::load("config/wallets.json")
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let entry = file.get(&req.id).ok_or(StatusCode::NOT_FOUND)?;

    if !verify_pin(&req.pin, &crate::wallet::pin::hash_pin(&req.pin)) {
        return Err(StatusCode::UNAUTHORIZED);
    }

    Ok(Json(UnlockWalletResponse {
        address: entry.address.clone(),
    }))
}

// -----------------------------------------------------------------------------
// File: src/api/wallets.rs
// Project: snap-coin-msg
// Created: 2026-03-19
// -----------------------------------------------------------------------------
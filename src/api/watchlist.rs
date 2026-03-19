// -----------------------------------------------------------------------------
// File: src/api/watchlist.rs
// Project: snap-coin-msg
// Description: REST endpoints for watchlist management
// Version: 0.1.0
// -----------------------------------------------------------------------------

use axum::{extract::State, http::StatusCode, Json};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use crate::app_state::AppState;
use crate::config::watchlist::{WatchedPair, WatchlistFile};

#[derive(Debug, Serialize)]
pub struct WatchlistResponse {
    pub pairs: Vec<WatchedPair>,
}

#[derive(Debug, Deserialize)]
pub struct AddWatchRequest {
    pub wallet_a: String,
    pub wallet_b: String,
    pub label: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct RemoveWatchRequest {
    pub wallet_a: String,
    pub wallet_b: String,
}

pub async fn list_watchlist(
    State(_state): State<Arc<AppState>>,
) -> Result<Json<WatchlistResponse>, StatusCode> {
    let file = WatchlistFile::load("config/watchlist.json")
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(WatchlistResponse { pairs: file.pairs }))
}

pub async fn add_watch(
    State(_state): State<Arc<AppState>>,
    Json(req): Json<AddWatchRequest>,
) -> Result<StatusCode, StatusCode> {
    let mut file = WatchlistFile::load("config/watchlist.json")
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    file.add(WatchedPair {
        wallet_a: req.wallet_a,
        wallet_b: req.wallet_b,
        label: req.label,
    });

    file.save("config/watchlist.json")
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(StatusCode::CREATED)
}

pub async fn remove_watch(
    State(_state): State<Arc<AppState>>,
    Json(req): Json<RemoveWatchRequest>,
) -> Result<StatusCode, StatusCode> {
    let mut file = WatchlistFile::load("config/watchlist.json")
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    file.remove(&req.wallet_a, &req.wallet_b);

    file.save("config/watchlist.json")
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(StatusCode::OK)
}

// -----------------------------------------------------------------------------
// File: src/api/watchlist.rs
// Project: snap-coin-msg
// Created: 2026-03-19
// -----------------------------------------------------------------------------
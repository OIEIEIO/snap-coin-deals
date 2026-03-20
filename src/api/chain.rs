// -----------------------------------------------------------------------------
// File: src/api/chain.rs
// Project: snap-coin-msg
// Description: Chain height and wallet balance endpoints
// Version: 0.1.0
// -----------------------------------------------------------------------------

use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::Serialize;
use snap_coin::crypto::keys::Public;
use snap_coin_pay::chain_interaction::ApiChainInteraction;
use snap_coin_pay::chain_interaction::ChainInteraction;
use snap_coin::blockchain_data_provider::BlockchainDataProvider;
use std::sync::Arc;
use crate::app_state::AppState;

#[derive(Debug, Serialize)]
pub struct HeightResponse {
    pub height: usize,
}

#[derive(Debug, Serialize)]
pub struct BalanceResponse {
    pub address: String,
    pub balance: u64,
    pub display: String,
}

pub async fn get_height(
    State(state): State<Arc<AppState>>,
) -> Result<Json<HeightResponse>, StatusCode> {
    let chain = ApiChainInteraction::new(state.node_addr)
        .await
        .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;

    let height = chain
        .get_height()
        .await
        .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;

    Ok(Json(HeightResponse { height }))
}

pub async fn get_balance(
    State(state): State<Arc<AppState>>,
    Path(address): Path<String>,
) -> Result<Json<BalanceResponse>, StatusCode> {
    let chain = ApiChainInteraction::new(state.node_addr)
        .await
        .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;

    let public = Public::new_from_base36(&address)
        .ok_or(StatusCode::BAD_REQUEST)?;

    let balance = chain
        .get_blockchain_data_provider()
        .get_balance(public)
        .await
        .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;

    let display = format!("{}.{:08}", balance / 100_000_000, balance % 100_000_000);

    Ok(Json(BalanceResponse {
        address,
        balance,
        display,
    }))
}

// -----------------------------------------------------------------------------
// File: src/api/chain.rs
// Project: snap-coin-msg
// Created: 2026-03-19
// -----------------------------------------------------------------------------
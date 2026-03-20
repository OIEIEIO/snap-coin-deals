// -----------------------------------------------------------------------------
// File: src/api/send.rs
// Project: snap-coin-msg
// Description: REST endpoint to compile and submit opcode message via snap-coin-pay
// Version: 0.3.0
// -----------------------------------------------------------------------------

use axum::{extract::State, http::StatusCode, Json};
use serde::{Deserialize, Serialize};
use snap_coin::crypto::keys::{Private, Public};
use snap_coin_opcode::Compiler;
use std::sync::Arc;
use crate::app_state::AppState;
use crate::wallet::pin::decrypt_key;
use crate::wallet::store::WalletsFile;

#[derive(Debug, Deserialize)]
pub struct SendRequest {
    pub tokens:         Vec<String>,
    pub from_wallet_id: String,
    pub to_address:     String,
    pub pin:            String,
}

#[derive(Debug, Serialize)]
pub struct SendResponse {
    pub status:      String,
    pub token_count: usize,
    pub amounts:     Vec<String>,
}

pub async fn send_message(
    State(state): State<Arc<AppState>>,
    Json(req): Json<SendRequest>,
) -> Result<Json<SendResponse>, StatusCode> {

    // load wallet
    let wallets = WalletsFile::load("config/wallets.json")
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let wallet = wallets.get(&req.from_wallet_id)
        .ok_or(StatusCode::NOT_FOUND)?;

    // decrypt private key with PIN
    let private_key_str = decrypt_key(&wallet.encrypted_key, &req.pin)
        .map_err(|_| StatusCode::UNAUTHORIZED)?;

    let from_private = Private::new_from_base36(&private_key_str)
        .ok_or(StatusCode::UNAUTHORIZED)?;

    // parse destination
    let to_public = Public::new_from_base36(&req.to_address)
        .ok_or(StatusCode::BAD_REQUEST)?;

    // compile tokens to amounts
    let compiler = Compiler::new(&state.dictionary);
    let token_refs: Vec<&str> = req.tokens.iter().map(|s| s.as_str()).collect();
    let compiled = compiler.compile(&token_refs)
        .map_err(|_| StatusCode::BAD_REQUEST)?;

    let amounts = compiled.amounts.clone();
    let token_count = compiled.tokens.len();

    // submit each opcode as individual transaction
    for amount in &amounts {
        state.outbound
            .submit_withdrawal(vec![(to_public.clone(), *amount)], from_private.clone())
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }

    let formatted: Vec<String> = amounts
        .iter()
        .map(|a| format!("0.{:08}", a))
        .collect();

    Ok(Json(SendResponse {
        status: "submitted".to_string(),
        token_count,
        amounts: formatted,
    }))
}

// -----------------------------------------------------------------------------
// File: src/api/send.rs
// Project: snap-coin-msg
// Created: 2026-03-19
// -----------------------------------------------------------------------------
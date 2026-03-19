// -----------------------------------------------------------------------------
// File: src/api/send.rs
// Project: snap-coin-msg
// Description: REST endpoint to compile and send opcode message
// Version: 0.1.0
// -----------------------------------------------------------------------------

use axum::{extract::State, http::StatusCode, Json};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use crate::app_state::AppState;

#[derive(Debug, Deserialize)]
pub struct SendRequest {
    pub tokens: Vec<String>,
    pub from_wallet_id: String,
    pub to_address: String,
    pub pin: String,
}

#[derive(Debug, Serialize)]
pub struct SendResponse {
    pub amounts: Vec<String>,
    pub token_count: usize,
}

pub async fn send_message(
    State(state): State<Arc<AppState>>,
    Json(req): Json<SendRequest>,
) -> Result<Json<SendResponse>, StatusCode> {
    let compiler = snap_coin_opcode::Compiler::new(&state.dictionary);

    let token_refs: Vec<&str> = req.tokens.iter().map(|s| s.as_str()).collect();
    let compiled = compiler
        .compile(&token_refs)
        .map_err(|_| StatusCode::BAD_REQUEST)?;

    let amounts: Vec<String> = compiled.amounts
        .iter()
        .map(|a| format!("0.{:08}", a))
        .collect();

    let token_count = compiled.tokens.len();

    Ok(Json(SendResponse {
        amounts,
        token_count,
    }))
}

// -----------------------------------------------------------------------------
// File: src/api/send.rs
// Project: snap-coin-msg
// Created: 2026-03-19
// -----------------------------------------------------------------------------
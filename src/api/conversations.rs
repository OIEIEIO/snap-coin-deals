// -----------------------------------------------------------------------------
// File: src/api/conversations.rs
// Project: snap-coin-msg
// Description: REST endpoints for conversation history and pair registration
// Version: 0.2.0
// -----------------------------------------------------------------------------

use axum::{extract::State, http::StatusCode, Json};
use serde::{Deserialize, Serialize};
use snap_coin::crypto::keys::Public;
use std::sync::Arc;
use crate::app_state::AppState;
use crate::conversation::assembler::{Assembler, ConversationThread};

#[derive(Debug, Deserialize)]
pub struct RegisterPairRequest {
    pub wallet_a: String,
    pub wallet_b: String,
}

#[derive(Debug, Serialize)]
pub struct RegisterPairResponse {
    pub status: String,
}

#[derive(Debug, Deserialize)]
pub struct ConversationRequest {
    pub wallet_a: String,
    pub wallet_b: String,
    pub txs:      Vec<TxInput>,
}

#[derive(Debug, Deserialize)]
pub struct TxInput {
    pub from:   String,
    pub to:     String,
    pub amount: u64,
}

#[derive(Debug, Serialize)]
pub struct ConversationResponse {
    pub wallet_a: String,
    pub wallet_b: String,
    pub raw:      Vec<RawItem>,
    pub decoded:  Vec<DecodedItem>,
}

#[derive(Debug, Serialize)]
pub struct RawItem {
    pub from_wallet: String,
    pub to_wallet:   String,
    pub amount:      String,
}

#[derive(Debug, Serialize)]
pub struct DecodedItem {
    pub from_wallet: String,
    pub to_wallet:   String,
    pub amount:      String,
    pub category:    String,
    pub meaning:     String,
}

pub async fn register_pair(
    State(state): State<Arc<AppState>>,
    Json(req): Json<RegisterPairRequest>,
) -> Result<Json<RegisterPairResponse>, StatusCode> {

    // add both addresses to watched set
    {
        let mut watched = state.watched_addresses.write().await;
        watched.insert(req.wallet_a.clone());
        watched.insert(req.wallet_b.clone());
    }

    // start watching both addresses via inbound processor
    let addr_a = Public::new_from_base36(&req.wallet_a)
        .ok_or(StatusCode::BAD_REQUEST)?;
    let addr_b = Public::new_from_base36(&req.wallet_b)
        .ok_or(StatusCode::BAD_REQUEST)?;

    state.inbound.watch(addr_a).await;
    state.inbound.watch(addr_b).await;

    tracing::info!("watching pair {} <-> {}", req.wallet_a, req.wallet_b);

    Ok(Json(RegisterPairResponse {
        status: "watching".to_string(),
    }))
}

pub async fn get_conversation(
    State(state): State<Arc<AppState>>,
    Json(req): Json<ConversationRequest>,
) -> Result<Json<ConversationResponse>, StatusCode> {

    let assembler = Assembler::new(state.dictionary.clone());

    let raw_txs: Vec<(String, String, u64)> = req.txs
        .into_iter()
        .map(|t| (t.from, t.to, t.amount))
        .collect();

    let thread: ConversationThread = assembler.build(&req.wallet_a, &req.wallet_b, raw_txs);

    let raw = thread.raw.iter().map(|r| RawItem {
        from_wallet: r.from_wallet.clone(),
        to_wallet:   r.to_wallet.clone(),
        amount:      r.amount.clone(),
    }).collect();

    let decoded = thread.decoded.iter().map(|d| DecodedItem {
        from_wallet: d.from_wallet.clone(),
        to_wallet:   d.to_wallet.clone(),
        amount:      d.amount.clone(),
        category:    d.category.clone(),
        meaning:     d.meaning.clone(),
    }).collect();

    Ok(Json(ConversationResponse {
        wallet_a: thread.wallet_a,
        wallet_b: thread.wallet_b,
        raw,
        decoded,
    }))
}

// -----------------------------------------------------------------------------
// File: src/api/conversations.rs
// Project: snap-coin-msg
// Created: 2026-03-19
// -----------------------------------------------------------------------------
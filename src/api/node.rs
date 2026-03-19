// -----------------------------------------------------------------------------
// File: src/api/node.rs
// Project: snap-coin-msg
// Description: REST endpoint to check SNAP node connection status
// Version: 0.1.0
// -----------------------------------------------------------------------------

use axum::{http::StatusCode, Json};
use serde::Serialize;
use snap_coin_pay::chain_interaction::ApiChainInteraction;
use std::net::SocketAddr;

#[derive(Debug, Serialize)]
pub struct NodeStatusResponse {
    pub online: bool,
    pub addr: String,
}

pub async fn node_status() -> Result<Json<NodeStatusResponse>, StatusCode> {
    let addr_str = std::env::var("NODE_API").unwrap_or_else(|_| "127.0.0.1:3003".to_string());

    let addr: SocketAddr = addr_str
        .parse()
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let online = ApiChainInteraction::new(addr).await.is_ok();

    Ok(Json(NodeStatusResponse {
        online,
        addr: addr_str,
    }))
}

// -----------------------------------------------------------------------------
// File: src/api/node.rs
// Project: snap-coin-msg
// Created: 2026-03-19
// -----------------------------------------------------------------------------
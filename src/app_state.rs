// -----------------------------------------------------------------------------
// File: src/app_state.rs
// Project: snap-coin-msg
// Description: Shared Axum application state
// Version: 0.1.0
// -----------------------------------------------------------------------------

use std::sync::Arc;
use tokio::sync::broadcast;
use snap_coin_opcode::Dictionary;

#[derive(Debug, Clone)]
pub struct WsEvent {
    pub from_wallet: String,
    pub to_wallet: String,
    pub amount: String,
    pub meaning: String,
    pub category: String,
}

#[derive(Clone)]
pub struct AppState {
    pub dictionary: Arc<Dictionary>,
    pub tx: broadcast::Sender<WsEvent>,
}

impl AppState {
    pub fn new(dictionary: Dictionary) -> Self {
        let (tx, _) = broadcast::channel(256);
        Self {
            dictionary: Arc::new(dictionary),
            tx,
        }
    }

    pub fn subscribe(&self) -> broadcast::Receiver<WsEvent> {
        self.tx.subscribe()
    }
}

// -----------------------------------------------------------------------------
// File: src/app_state.rs
// Project: snap-coin-msg
// Created: 2026-03-19
// -----------------------------------------------------------------------------
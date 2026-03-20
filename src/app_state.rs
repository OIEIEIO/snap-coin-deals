// -----------------------------------------------------------------------------
// File: src/app_state.rs
// Project: snap-coin-msg
// Description: Shared Axum application state
// Version: 0.5.0
// -----------------------------------------------------------------------------

use std::collections::HashSet;
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::sync::{broadcast, RwLock};
use snap_coin_opcode::Dictionary;
use snap_coin_pay::chain_interaction::ApiChainInteraction;
use snap_coin_pay::withdrawal_payment_processor::WithdrawalPaymentProcessor;
use crate::transport::inbound::InboundWatcher;
use crate::transport::outbound::OutboundConfirmationHandler;
use crate::ws::chain_events::{ChainEventMsg, start_chain_event_broadcaster};

#[derive(Debug, Clone)]
pub struct WsEvent {
    pub from_wallet: String,
    pub to_wallet:   String,
    pub amount:      String,
    pub meaning:     String,
    pub category:    String,
    pub pending:     bool,   // true = mempool, false = confirmed
}

#[derive(Clone)]
pub struct AppState {
    pub dictionary:            Arc<Dictionary>,
    pub tx:                    broadcast::Sender<WsEvent>,
    pub chain_tx:              broadcast::Sender<ChainEventMsg>,
    pub outbound:              Arc<WithdrawalPaymentProcessor<ApiChainInteraction>>,
    pub inbound:               Arc<InboundWatcher>,
    pub watched_addresses:     Arc<RwLock<HashSet<String>>>,
    pub node_addr:             SocketAddr,
    pub opcode_genesis_height: u64,
}

impl AppState {
    pub async fn new(dictionary: Dictionary, node_addr: SocketAddr, opcode_genesis_height: u64) -> Self {
        let (tx, _)       = broadcast::channel(256);
        let (chain_tx, _) = broadcast::channel(512);

        let chain_out = ApiChainInteraction::new(node_addr)
            .await
            .expect("failed to connect to node for outbound processor");

        let handler   = OutboundConfirmationHandler;
        let processor = WithdrawalPaymentProcessor::create(chain_out, None, None, None);
        processor
            .start(1, handler)
            .await
            .expect("outbound processor failed to start");

        let inbound = InboundWatcher::new(
            node_addr,
            Arc::new(dictionary.clone()),
            tx.clone(),
        ).await;

        let watched_addresses = Arc::new(RwLock::new(HashSet::new()));

        start_chain_event_broadcaster(
            node_addr,
            chain_tx.clone(),
            Arc::new(dictionary.clone()),
            tx.clone(),
            Arc::clone(&watched_addresses),
        ).await;

        Self {
            dictionary:            Arc::new(dictionary),
            tx,
            chain_tx,
            outbound:              processor,
            inbound:               Arc::new(inbound),
            watched_addresses,
            node_addr,
            opcode_genesis_height,
        }
    }

    pub fn subscribe(&self) -> broadcast::Receiver<WsEvent> {
        self.tx.subscribe()
    }

    pub fn subscribe_chain(&self) -> broadcast::Receiver<ChainEventMsg> {
        self.chain_tx.subscribe()
    }
}

// -----------------------------------------------------------------------------
// File: src/app_state.rs
// Project: snap-coin-msg
// Created: 2026-03-19
// -----------------------------------------------------------------------------
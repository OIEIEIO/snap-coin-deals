// -----------------------------------------------------------------------------
// File: src/transport/inbound.rs
// Project: snap-coin-msg
// Description: Inbound opcode tx watcher via snap-coin-pay deposit processor
// Version: 0.4.0
// -----------------------------------------------------------------------------

use async_trait::async_trait;
use snap_coin::core::transaction::Transaction;
use snap_coin::crypto::keys::Public;
use snap_coin_pay::chain_interaction::ApiChainInteraction;
use snap_coin_pay::deposit_payment_processor::{DepositPaymentProcessor, OnConfirmation};
use snap_coin_opcode::{Decoder, Dictionary};
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::sync::broadcast;
use crate::app_state::WsEvent;

#[derive(Clone)]
pub struct OpcodeConfirmationHandler {
    pub dictionary: Arc<Dictionary>,
    pub tx:         broadcast::Sender<WsEvent>,
}

#[async_trait]
impl OnConfirmation for OpcodeConfirmationHandler {
    async fn on_confirmation(&self, deposit_address: Public, transaction: Transaction) {
        let decoder = Decoder::new(&self.dictionary);

        let sender = transaction
            .inputs
            .first()
            .map(|i| i.output_owner.dump_base36())
            .unwrap_or_default();

        for output in &transaction.outputs {
            if output.receiver != deposit_address {
                continue;
            }
            let raw = output.amount;
            if let Some(opcode) = decoder.decode_amount(raw) {
                let event = WsEvent {
                    from_wallet: sender.clone(),
                    to_wallet:   deposit_address.dump_base36(),
                    amount:      format!("0.{:08}", raw),
                    meaning:     opcode.meaning.clone(),
                    category:    opcode.category.clone(),
                };
                let _ = self.tx.send(event);
                tracing::info!(
                    "inbound opcode: {} → {} [{}] {}",
                    &sender[..8],
                    &deposit_address.dump_base36()[..8],
                    opcode.category,
                    opcode.meaning
                );
            }
        }
    }
}

pub struct InboundWatcher {
    processor: Arc<DepositPaymentProcessor>,
}

impl InboundWatcher {
    pub async fn new(
        node_addr: SocketAddr,
        dictionary: Arc<Dictionary>,
        tx: broadcast::Sender<WsEvent>,
    ) -> Self {
        let chain = ApiChainInteraction::new(node_addr)
            .await
            .expect("failed to connect to node for inbound watcher");

        let handler   = OpcodeConfirmationHandler { dictionary, tx };
        let processor = DepositPaymentProcessor::create(None);

        processor
            .start(chain, 1, handler)
            .await
            .expect("inbound processor failed to start");

        Self { processor }
    }

    pub async fn watch(&self, address: Public) {
        self.processor.add_deposit_address(address).await;
    }

    pub async fn unwatch(&self, address: Public) {
        self.processor.remove_deposit_address(address).await;
    }
}

// -----------------------------------------------------------------------------
// File: src/transport/inbound.rs
// Project: snap-coin-msg
// Created: 2026-03-19
// -----------------------------------------------------------------------------
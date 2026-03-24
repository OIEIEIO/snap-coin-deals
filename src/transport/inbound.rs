// -----------------------------------------------------------------------------
// File: inbound.rs
// Location: snap-coin-msg/src/transport/inbound.rs
// Version: 0.6.0
// Description: Inbound tx watcher via snap-coin-pay deposit processor.
//              Fires confirmed WsEvent for both opcodes and plain SNAP transfers.
//              Fix: skip on_confirmation when sender == deposit_address.
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
        let decoder  = Decoder::new(&self.dictionary);
        let addr_str = deposit_address.dump_base36();

        let sender = transaction
            .inputs
            .first()
            .map(|i| i.output_owner.dump_base36())
            .unwrap_or_default();

        // skip if this fired for the sender's own watched address
        if sender == addr_str {
            return;
        }

        for output in &transaction.outputs {
            if output.receiver != deposit_address {
                continue;
            }
            let raw        = output.amount;
            let amount_str = format!("0.{:08}", raw);

            if let Some(opcode) = decoder.decode_amount(raw) {
                let _ = self.tx.send(WsEvent {
                    from_wallet: sender.clone(),
                    to_wallet:   addr_str.clone(),
                    amount:      amount_str.clone(),
                    meaning:     opcode.meaning.clone(),
                    category:    opcode.category.clone(),
                    pending:     false,
                });
                tracing::info!(
                    "inbound opcode confirmed: {} → {} [{}] {}",
                    &sender[..8],
                    &addr_str[..8],
                    opcode.category,
                    opcode.meaning
                );
            } else {
                let _ = self.tx.send(WsEvent {
                    from_wallet: sender.clone(),
                    to_wallet:   addr_str.clone(),
                    amount:      amount_str.clone(),
                    meaning:     "SNAP transfer".to_string(),
                    category:    "transfer".to_string(),
                    pending:     false,
                });
                tracing::info!(
                    "inbound transfer confirmed: {} → {} {}",
                    &sender[..8],
                    &addr_str[..8],
                    amount_str
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
        node_addr:  SocketAddr,
        dictionary: Arc<Dictionary>,
        tx:         broadcast::Sender<WsEvent>,
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
// File: inbound.rs
// Location: snap-coin-msg/src/transport/inbound.rs
// Created: 2026-03-19T00:00:00Z
// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------
// File: src/transport/inbound.rs
// Project: snap-coin-msg
// Description: Inbound opcode tx watcher via snap-coin-pay deposit processor
// Version: 0.2.0
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
    pub tx: broadcast::Sender<WsEvent>,
}

#[async_trait]
impl OnConfirmation for OpcodeConfirmationHandler {
    async fn on_confirmation(&self, deposit_address: Public, transaction: Transaction) {
        let decoder = Decoder::new(&self.dictionary);
        for output in &transaction.outputs {
            let raw = output.amount;
            if let Some(opcode) = decoder.decode_amount(raw) {
                let event = WsEvent {
                    from_wallet: format!("{:?}", transaction.inputs.first()),
                    to_wallet: deposit_address.dump_base36(),
                    amount: format!("0.{:08}", raw),
                    meaning: opcode.meaning.clone(),
                    category: opcode.category.clone(),
                };
                let _ = self.tx.send(event);
            }
        }
    }
}

pub async fn start_inbound(
    node_addr: SocketAddr,
    watch_addresses: Vec<Public>,
    dictionary: Arc<Dictionary>,
    tx: broadcast::Sender<WsEvent>,
) -> Arc<DepositPaymentProcessor> {
    let chain = ApiChainInteraction::new(node_addr)
        .await
        .expect("failed to connect to node");

    let handler = OpcodeConfirmationHandler { dictionary, tx };
    let processor = DepositPaymentProcessor::create(None);

    for address in watch_addresses {
        processor.add_deposit_address(address).await;
    }

    processor
        .start(chain, 10, handler)
        .await
        .expect("inbound processor failed");

    processor
}

// -----------------------------------------------------------------------------
// File: src/transport/inbound.rs
// Project: snap-coin-msg
// Created: 2026-03-19
// -----------------------------------------------------------------------------
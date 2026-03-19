// -----------------------------------------------------------------------------
// File: src/transport/outbound.rs
// Project: snap-coin-msg
// Description: Outbound opcode tx sender via snap-coin-pay withdrawal processor
// Version: 0.2.0
// -----------------------------------------------------------------------------

use async_trait::async_trait;
use snap_coin::core::transaction::Transaction;
use snap_coin::crypto::keys::{Private, Public};
use snap_coin_pay::chain_interaction::ApiChainInteraction;
use snap_coin_pay::withdrawal_payment_processor::{
    OnWithdrawalConfirmation, WithdrawalId, WithdrawalPaymentProcessor,
};
use std::net::SocketAddr;
use std::sync::Arc;

#[derive(Clone)]
pub struct OutboundConfirmationHandler;

#[async_trait]
impl OnWithdrawalConfirmation for OutboundConfirmationHandler {
    async fn on_confirmation(&self, withdrawal_id: WithdrawalId, _transaction: Transaction) {
        tracing::info!("outbound opcode confirmed: {}", withdrawal_id);
    }
}

pub struct OutboundProcessor {
    pub processor: Arc<WithdrawalPaymentProcessor<ApiChainInteraction>>,
}

impl OutboundProcessor {
    pub async fn new(node_addr: SocketAddr) -> Self {
        let chain = ApiChainInteraction::new(node_addr)
            .await
            .expect("failed to connect to node");

        let handler = OutboundConfirmationHandler;
        let processor = WithdrawalPaymentProcessor::create(chain, None, None, None);

        processor
            .start(10, handler)
            .await
            .expect("outbound processor failed");

        Self { processor }
    }

    pub async fn send_opcodes(
        &self,
        amounts: Vec<u64>,
        from_private: Private,
        to_public: Public,
    ) -> Result<WithdrawalId, String> {
        let outputs: Vec<(Public, u64)> = amounts
            .into_iter()
            .map(|a| (to_public.clone(), a))
            .collect();

        self.processor
            .submit_withdrawal(outputs, from_private)
            .await
            .map_err(|e| format!("Failed to submit withdrawal: {}", e))
    }
}

// -----------------------------------------------------------------------------
// File: src/transport/outbound.rs
// Project: snap-coin-msg
// Created: 2026-03-19
// -----------------------------------------------------------------------------
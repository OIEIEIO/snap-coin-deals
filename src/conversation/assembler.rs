// -----------------------------------------------------------------------------
// File: src/conversation/assembler.rs
// Project: snap-coin-msg
// Description: Group wallet pair tx history into conversation threads
// Version: 0.1.0
// -----------------------------------------------------------------------------

use snap_coin_opcode::{Decoder, Dictionary};
use std::sync::Arc;

#[derive(Debug, Clone)]
pub struct RawEntry {
    pub from_wallet: String,
    pub to_wallet: String,
    pub amount: String,
    pub raw: u64,
}

#[derive(Debug, Clone)]
pub struct DecodedEntry {
    pub from_wallet: String,
    pub to_wallet: String,
    pub amount: String,
    pub category: String,
    pub meaning: String,
}

#[derive(Debug, Clone)]
pub struct ConversationThread {
    pub wallet_a: String,
    pub wallet_b: String,
    pub raw: Vec<RawEntry>,
    pub decoded: Vec<DecodedEntry>,
}

pub struct Assembler {
    dictionary: Arc<Dictionary>,
}

impl Assembler {
    pub fn new(dictionary: Arc<Dictionary>) -> Self {
        Self { dictionary }
    }

    pub fn build(
        &self,
        wallet_a: &str,
        wallet_b: &str,
        raw_txs: Vec<(String, String, u64)>,
    ) -> ConversationThread {
        let decoder = Decoder::new(&self.dictionary);
        let mut raw: Vec<RawEntry> = Vec::new();
        let mut decoded: Vec<DecodedEntry> = Vec::new();

        for (from, to, amount) in &raw_txs {
            let is_between = (from == wallet_a && to == wallet_b)
                || (from == wallet_b && to == wallet_a);

            if !is_between {
                continue;
            }

            raw.push(RawEntry {
                from_wallet: from.clone(),
                to_wallet: to.clone(),
                amount: format!("0.{:08}", amount),
                raw: *amount,
            });

            if let Some(opcode) = decoder.decode_amount(*amount) {
                decoded.push(DecodedEntry {
                    from_wallet: from.clone(),
                    to_wallet: to.clone(),
                    amount: format!("0.{:08}", amount),
                    category: opcode.category.clone(),
                    meaning: opcode.meaning.clone(),
                });
            }
        }

        ConversationThread {
            wallet_a: wallet_a.to_string(),
            wallet_b: wallet_b.to_string(),
            raw,
            decoded,
        }
    }
}

// -----------------------------------------------------------------------------
// File: src/conversation/assembler.rs
// Project: snap-coin-msg
// Created: 2026-03-19
// -----------------------------------------------------------------------------
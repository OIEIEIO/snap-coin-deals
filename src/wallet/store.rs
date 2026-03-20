// -----------------------------------------------------------------------------
// File: src/wallet/store.rs
// Project: snap-coin-msg
// Description: Load and save encrypted wallet keys with column layout state
// Version: 0.2.0
// -----------------------------------------------------------------------------

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WalletEntry {
    pub label:         String,
    pub address:       String,
    pub encrypted_key: String,
    pub column:        Option<String>,   // "left" or "right"
    pub order:         Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WalletsFile {
    pub wallets: HashMap<String, WalletEntry>,
}

impl WalletsFile {
    pub fn load<P: AsRef<Path>>(path: P) -> Result<Self, String> {
        let data = fs::read_to_string(&path)
            .map_err(|e| format!("Failed to read wallets file: {}", e))?;
        serde_json::from_str(&data)
            .map_err(|e| format!("Failed to parse wallets JSON: {}", e))
    }

    pub fn save<P: AsRef<Path>>(&self, path: P) -> Result<(), String> {
        let data = serde_json::to_string_pretty(self)
            .map_err(|e| format!("Failed to serialize wallets: {}", e))?;
        fs::write(&path, data)
            .map_err(|e| format!("Failed to write wallets file: {}", e))
    }

    pub fn empty() -> Self {
        Self { wallets: HashMap::new() }
    }

    pub fn add(&mut self, id: String, entry: WalletEntry) {
        self.wallets.insert(id, entry);
    }

    pub fn get(&self, id: &str) -> Option<&WalletEntry> {
        self.wallets.get(id)
    }

    pub fn list(&self) -> Vec<(&String, &WalletEntry)> {
        let mut entries: Vec<_> = self.wallets.iter().collect();
        entries.sort_by_key(|(_, w)| w.order.unwrap_or(0));
        entries
    }

    pub fn next_order(&self) -> u32 {
        self.wallets
            .values()
            .filter_map(|w| w.order)
            .max()
            .unwrap_or(0) + 1
    }

    pub fn set_column(&mut self, id: &str, column: &str) -> Result<(), String> {
        let entry = self.wallets
            .get_mut(id)
            .ok_or_else(|| format!("Wallet {} not found", id))?;
        entry.column = Some(column.to_string());
        Ok(())
    }
}

// -----------------------------------------------------------------------------
// File: src/wallet/store.rs
// Project: snap-coin-msg
// Created: 2026-03-19 | Updated: 2026-03-20
// -----------------------------------------------------------------------------
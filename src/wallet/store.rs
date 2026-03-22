// -----------------------------------------------------------------------------
// File: src/wallet/store.rs
// Tree: snap-coin-msg/src/wallet/store.rs
// Description: Load and save encrypted wallet keys with column layout state
// Version: 0.4.0
// Changes: removed locked check from set_column, added swap_order method
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
    #[serde(default)]
    pub locked:        bool,
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

    pub fn remove(&mut self, id: &str) -> Result<(), String> {
        let entry = self.wallets.get(id)
            .ok_or_else(|| format!("Wallet {} not found", id))?;
        if entry.locked {
            return Err(format!("Wallet {} is locked and cannot be deleted", id));
        }
        self.wallets.remove(id);
        Ok(())
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

    pub fn swap_order(&mut self, id: &str, direction: &str) -> Result<(), String> {
        let entry = self.wallets.get(id)
            .ok_or_else(|| format!("Wallet {} not found", id))?;
        let current_order  = entry.order.unwrap_or(0);
        let current_column = entry.column.clone().unwrap_or_else(|| "left".to_string());

        // find the neighbour in the same column to swap with
        let neighbour = self.wallets.iter()
            .filter(|(k, w)| {
                *k != id &&
                w.column.as_deref().unwrap_or("left") == current_column
            })
            .map(|(k, w)| (k.clone(), w.order.unwrap_or(0)))
            .filter(|(_, o)| {
                if direction == "up"   { *o < current_order }
                else                   { *o > current_order }
            })
            .min_by_key(|(_, o)| {
                if direction == "up"   { current_order - o }
                else                   { *o - current_order }
            });

        if let Some((neighbour_id, neighbour_order)) = neighbour {
            self.wallets.get_mut(id).unwrap().order = Some(neighbour_order);
            self.wallets.get_mut(&neighbour_id).unwrap().order = Some(current_order);
            Ok(())
        } else {
            Err("already at boundary".to_string())
        }
    }
}

// -----------------------------------------------------------------------------
// File: src/wallet/store.rs
// Tree: snap-coin-msg/src/wallet/store.rs
// Created: 2026-03-19 | Updated: 2026-03-22
// -----------------------------------------------------------------------------
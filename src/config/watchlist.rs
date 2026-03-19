// -----------------------------------------------------------------------------
// File: src/config/watchlist.rs
// Project: snap-coin-msg
// Description: Load and save watched wallet pairs for read only monitoring
// Version: 0.1.0
// -----------------------------------------------------------------------------

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WatchedPair {
    pub wallet_a: String,
    pub wallet_b: String,
    pub label: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WatchlistFile {
    pub pairs: Vec<WatchedPair>,
}

impl WatchlistFile {
    pub fn load<P: AsRef<Path>>(path: P) -> Result<Self, String> {
        let data = fs::read_to_string(&path)
            .map_err(|e| format!("Failed to read watchlist file: {}", e))?;
        serde_json::from_str(&data)
            .map_err(|e| format!("Failed to parse watchlist JSON: {}", e))
    }

    pub fn save<P: AsRef<Path>>(&self, path: P) -> Result<(), String> {
        let data = serde_json::to_string_pretty(self)
            .map_err(|e| format!("Failed to serialize watchlist: {}", e))?;
        fs::write(&path, data)
            .map_err(|e| format!("Failed to write watchlist file: {}", e))
    }

    pub fn empty() -> Self {
        Self { pairs: Vec::new() }
    }

    pub fn add(&mut self, pair: WatchedPair) {
        self.pairs.push(pair);
    }

    pub fn remove(&mut self, wallet_a: &str, wallet_b: &str) {
        self.pairs.retain(|p| {
            !(p.wallet_a == wallet_a && p.wallet_b == wallet_b)
        });
    }
}

// -----------------------------------------------------------------------------
// File: src/config/watchlist.rs
// Project: snap-coin-msg
// Created: 2026-03-19
// -----------------------------------------------------------------------------
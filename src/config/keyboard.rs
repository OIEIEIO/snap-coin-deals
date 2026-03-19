// -----------------------------------------------------------------------------
// File: src/config/keyboard.rs
// Project: snap-coin-msg
// Description: Load and save custom keyboard tab layout
// Version: 0.1.0
// -----------------------------------------------------------------------------

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeyboardConfig {
    pub custom_tab: Vec<String>,
}

impl KeyboardConfig {
    pub fn load<P: AsRef<Path>>(path: P) -> Result<Self, String> {
        let data = fs::read_to_string(&path)
            .map_err(|e| format!("Failed to read keyboard config: {}", e))?;
        serde_json::from_str(&data)
            .map_err(|e| format!("Failed to parse keyboard JSON: {}", e))
    }

    pub fn save<P: AsRef<Path>>(&self, path: P) -> Result<(), String> {
        let data = serde_json::to_string_pretty(self)
            .map_err(|e| format!("Failed to serialize keyboard config: {}", e))?;
        fs::write(&path, data)
            .map_err(|e| format!("Failed to write keyboard config: {}", e))
    }

    pub fn empty() -> Self {
        Self {
            custom_tab: Vec::new(),
        }
    }

    pub fn add_token(&mut self, token: String) {
        if !self.custom_tab.contains(&token) {
            self.custom_tab.push(token);
        }
    }

    pub fn remove_token(&mut self, token: &str) {
        self.custom_tab.retain(|t| t != token);
    }
}

// -----------------------------------------------------------------------------
// File: src/config/keyboard.rs
// Project: snap-coin-msg
// Created: 2026-03-19
// -----------------------------------------------------------------------------
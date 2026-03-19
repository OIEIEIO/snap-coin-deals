// -----------------------------------------------------------------------------
// File: src/config/contacts.rs
// Project: snap-coin-msg
// Description: Load and save contacts - nicknames and wallet addresses
// Version: 0.1.0
// -----------------------------------------------------------------------------

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Contact {
    pub nickname: String,
    pub address: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContactsFile {
    pub contacts: HashMap<String, Contact>,
}

impl ContactsFile {
    pub fn load<P: AsRef<Path>>(path: P) -> Result<Self, String> {
        let data = fs::read_to_string(&path)
            .map_err(|e| format!("Failed to read contacts file: {}", e))?;
        serde_json::from_str(&data)
            .map_err(|e| format!("Failed to parse contacts JSON: {}", e))
    }

    pub fn save<P: AsRef<Path>>(&self, path: P) -> Result<(), String> {
        let data = serde_json::to_string_pretty(self)
            .map_err(|e| format!("Failed to serialize contacts: {}", e))?;
        fs::write(&path, data)
            .map_err(|e| format!("Failed to write contacts file: {}", e))
    }

    pub fn empty() -> Self {
        Self {
            contacts: HashMap::new(),
        }
    }

    pub fn add(&mut self, id: String, contact: Contact) {
        self.contacts.insert(id, contact);
    }

    pub fn get(&self, id: &str) -> Option<&Contact> {
        self.contacts.get(id)
    }

    pub fn resolve(&self, address: &str) -> String {
        self.contacts
            .values()
            .find(|c| c.address == address)
            .map(|c| c.nickname.clone())
            .unwrap_or_else(|| address.to_string())
    }
}

// -----------------------------------------------------------------------------
// File: src/config/contacts.rs
// Project: snap-coin-msg
// Created: 2026-03-19
// -----------------------------------------------------------------------------
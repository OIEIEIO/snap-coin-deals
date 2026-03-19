// -----------------------------------------------------------------------------
// File: src/wallet/pin.rs
// Project: snap-coin-msg
// Description: Per wallet PIN verify and key unlock
// Version: 0.1.0
// -----------------------------------------------------------------------------

use sha2::{Digest, Sha256};

pub fn hash_pin(pin: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(pin.as_bytes());
    format!("{:x}", hasher.finalize())
}

pub fn verify_pin(pin: &str, stored_hash: &str) -> bool {
    hash_pin(pin) == stored_hash
}

pub fn encrypt_key(private_key: &str, pin: &str) -> String {
    let pin_hash = hash_pin(pin);
    let key_bytes = private_key.as_bytes();
    let pin_bytes = pin_hash.as_bytes();
    let encrypted: Vec<u8> = key_bytes
        .iter()
        .enumerate()
        .map(|(i, b)| b ^ pin_bytes[i % pin_bytes.len()])
        .collect();
    hex::encode(encrypted)
}

pub fn decrypt_key(encrypted_key: &str, pin: &str) -> Result<String, String> {
    let pin_hash = hash_pin(pin);
    let pin_bytes = pin_hash.as_bytes();
    let encrypted = hex::decode(encrypted_key)
        .map_err(|e| format!("Failed to decode encrypted key: {}", e))?;
    let decrypted: Vec<u8> = encrypted
        .iter()
        .enumerate()
        .map(|(i, b)| b ^ pin_bytes[i % pin_bytes.len()])
        .collect();
    String::from_utf8(decrypted)
        .map_err(|e| format!("Failed to decode decrypted key: {}", e))
}

// -----------------------------------------------------------------------------
// File: src/wallet/pin.rs
// Project: snap-coin-msg
// Created: 2026-03-19
// -----------------------------------------------------------------------------
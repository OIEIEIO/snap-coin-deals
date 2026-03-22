// -----------------------------------------------------------------------------
// File: src/api/contacts.rs
// Tree: snap-coin-msg/src/api/contacts.rs
// Description: REST endpoints for contacts management
// Version: 0.2.0
// Changes: added delete endpoint with wallet key protection
// -----------------------------------------------------------------------------

use axum::{extract::State, http::StatusCode, Json};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use crate::app_state::AppState;
use crate::config::contacts::{Contact, ContactsFile};
use crate::wallet::store::WalletsFile;

#[derive(Debug, Serialize)]
pub struct ContactsResponse {
    pub contacts: Vec<ContactItem>,
}

#[derive(Debug, Serialize)]
pub struct ContactItem {
    pub id: String,
    pub nickname: String,
    pub address: String,
}

#[derive(Debug, Deserialize)]
pub struct AddContactRequest {
    pub id: String,
    pub nickname: String,
    pub address: String,
}

#[derive(Debug, Deserialize)]
pub struct DeleteContactRequest {
    pub id: String,
}

pub async fn list_contacts(
    State(_state): State<Arc<AppState>>,
) -> Result<Json<ContactsResponse>, StatusCode> {
    let file = ContactsFile::load("config/contacts.json")
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let contacts = file
        .contacts
        .iter()
        .map(|(id, c)| ContactItem {
            id: id.clone(),
            nickname: c.nickname.clone(),
            address: c.address.clone(),
        })
        .collect();

    Ok(Json(ContactsResponse { contacts }))
}

pub async fn add_contact(
    State(_state): State<Arc<AppState>>,
    Json(req): Json<AddContactRequest>,
) -> Result<StatusCode, StatusCode> {
    let mut file = ContactsFile::load("config/contacts.json")
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    file.add(req.id, Contact {
        nickname: req.nickname,
        address: req.address,
    });

    file.save("config/contacts.json")
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(StatusCode::CREATED)
}

pub async fn delete_contact(
    State(_state): State<Arc<AppState>>,
    Json(req): Json<DeleteContactRequest>,
) -> Result<StatusCode, StatusCode> {
    let mut contacts = ContactsFile::load("config/contacts.json")
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // block delete if contact address matches a wallet with a key
    let contact = contacts.contacts.get(&req.id)
        .ok_or(StatusCode::NOT_FOUND)?;

    let wallets = WalletsFile::load("config/wallets.json")
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let has_key = wallets.wallets.values()
        .any(|w| w.address == contact.address && !w.encrypted_key.is_empty());

    if has_key {
        return Err(StatusCode::FORBIDDEN);
    }

    contacts.remove(&req.id)
        .map_err(|_| StatusCode::NOT_FOUND)?;

    contacts.save("config/contacts.json")
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(StatusCode::OK)
}

// -----------------------------------------------------------------------------
// File: src/api/contacts.rs
// Tree: snap-coin-msg/src/api/contacts.rs
// Created: 2026-03-19 | Updated: 2026-03-22
// -----------------------------------------------------------------------------
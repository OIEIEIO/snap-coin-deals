// -----------------------------------------------------------------------------
// File: src/api/contacts.rs
// Project: snap-coin-msg
// Description: REST endpoints for contacts management
// Version: 0.1.0
// -----------------------------------------------------------------------------

use axum::{extract::State, http::StatusCode, Json};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use crate::app_state::AppState;
use crate::config::contacts::{Contact, ContactsFile};

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

// -----------------------------------------------------------------------------
// File: src/api/contacts.rs
// Project: snap-coin-msg
// Created: 2026-03-19
// -----------------------------------------------------------------------------
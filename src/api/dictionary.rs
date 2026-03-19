// -----------------------------------------------------------------------------
// File: src/api/dictionary.rs
// Project: snap-coin-msg
// Description: REST endpoint to serve loaded dictionary to frontend
// Version: 0.1.0
// -----------------------------------------------------------------------------

use axum::{extract::State, http::StatusCode, Json};
use serde::Serialize;
use std::collections::HashMap;
use std::sync::Arc;
use crate::app_state::AppState;

#[derive(Debug, Serialize)]
pub struct DictionaryResponse {
    pub version: String,
    pub entries: HashMap<String, DictionaryEntryResponse>,
}

#[derive(Debug, Serialize)]
pub struct DictionaryEntryResponse {
    pub r#type: String,
    pub family: String,
    pub opcode: String,
    pub amount: String,
    pub category: String,
    pub meaning: String,
    pub display: Option<String>,
    pub answer_family: Option<String>,
    pub answer_opcode_start: Option<String>,
    pub answers_question: Option<String>,
}

pub async fn get_dictionary(
    State(state): State<Arc<AppState>>,
) -> Result<Json<DictionaryResponse>, StatusCode> {
    let entries = state.dictionary
        .all_entries()
        .iter()
        .map(|(token, e)| {
            (token.clone(), DictionaryEntryResponse {
                r#type: e.r#type.clone(),
                family: e.family.clone(),
                opcode: e.opcode.clone(),
                amount: e.amount.clone(),
                category: e.category.clone(),
                meaning: e.meaning.clone(),
                display: e.display.clone(),
                answer_family: e.answer_family.clone(),
                answer_opcode_start: e.answer_opcode_start.clone(),
                answers_question: e.answers_question.clone(),
            })
        })
        .collect();

    Ok(Json(DictionaryResponse {
        version: state.dictionary.version.clone(),
        entries,
    }))
}

// -----------------------------------------------------------------------------
// File: src/api/dictionary.rs
// Project: snap-coin-msg
// Created: 2026-03-19
// -----------------------------------------------------------------------------
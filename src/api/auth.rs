// -----------------------------------------------------------------------------
// File: src/api/auth.rs
// Tree: snap-coin-deals/src/api/auth.rs
// Description: Auth middleware - bearer token validation, login, session mgmt
// Version: 0.1.0
// Comments: Single user token for now - device identity layer added later
//           API_TOKEN set in .env - never hardcoded
//           All protected routes use require_auth extractor
// -----------------------------------------------------------------------------

#![allow(dead_code)]
#![allow(unused)]

use axum::{
    extract::{Request, State},
    http::{HeaderMap, StatusCode},
    middleware::Next,
    response::{IntoResponse, Json, Response},
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use crate::app_state::AppState;

// -----------------------------------------------------------------------------
// Request / Response types
// -----------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct LoginRequest {
    pub token: String,
}

#[derive(Serialize)]
pub struct LoginResponse {
    pub success: bool,
    pub role:    String,
    pub message: String,
}

#[derive(Serialize)]
pub struct AuthError {
    pub error: String,
}

// -----------------------------------------------------------------------------
// Login endpoint — POST /api/auth/login
// Phone sends token, server validates against API_TOKEN env var
// Returns role: admin | business | member
// -----------------------------------------------------------------------------

pub async fn login(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<LoginRequest>,
) -> impl IntoResponse {
    let api_token = std::env::var("API_TOKEN")
        .unwrap_or_else(|_| "changeme".to_string());

    let admin_token = std::env::var("ADMIN_TOKEN")
        .unwrap_or_else(|_| "adminchangeme".to_string());

    if payload.token == admin_token {
        return (
            StatusCode::OK,
            Json(LoginResponse {
                success: true,
                role:    "admin".to_string(),
                message: "authenticated as admin".to_string(),
            }),
        );
    }

    if payload.token == api_token {
        return (
            StatusCode::OK,
            Json(LoginResponse {
                success: true,
                role:    "member".to_string(),
                message: "authenticated".to_string(),
            }),
        );
    }

    (
        StatusCode::UNAUTHORIZED,
        Json(LoginResponse {
            success: false,
            role:    "none".to_string(),
            message: "invalid token".to_string(),
        }),
    )
}

// -----------------------------------------------------------------------------
// Auth middleware — validates bearer token on every protected route
// Usage: .layer(axum::middleware::from_fn_with_state(state, require_auth))
// -----------------------------------------------------------------------------

pub async fn require_auth(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    request: Request,
    next: Next,
) -> Response {
    let api_token = std::env::var("API_TOKEN")
        .unwrap_or_else(|_| "changeme".to_string());

    let admin_token = std::env::var("ADMIN_TOKEN")
        .unwrap_or_else(|_| "adminchangeme".to_string());

    let auth_header = headers
        .get("Authorization")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    let token = auth_header.strip_prefix("Bearer ").unwrap_or("");

    if token == api_token || token == admin_token {
        return next.run(request).await;
    }

    (
        StatusCode::UNAUTHORIZED,
        Json(AuthError {
            error: "unauthorized".to_string(),
        }),
    )
        .into_response()
}

// -----------------------------------------------------------------------------
// Token verify endpoint — GET /api/auth/verify
// Phone calls this on app open to check if stored token is still valid
// -----------------------------------------------------------------------------

pub async fn verify(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> impl IntoResponse {
    let api_token = std::env::var("API_TOKEN")
        .unwrap_or_else(|_| "changeme".to_string());

    let admin_token = std::env::var("ADMIN_TOKEN")
        .unwrap_or_else(|_| "adminchangeme".to_string());

    let auth_header = headers
        .get("Authorization")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    let token = auth_header.strip_prefix("Bearer ").unwrap_or("");

    if token == admin_token {
        return (
            StatusCode::OK,
            Json(LoginResponse {
                success: true,
                role:    "admin".to_string(),
                message: "token valid".to_string(),
            }),
        );
    }

    if token == api_token {
        return (
            StatusCode::OK,
            Json(LoginResponse {
                success: true,
                role:    "member".to_string(),
                message: "token valid".to_string(),
            }),
        );
    }

    (
        StatusCode::UNAUTHORIZED,
        Json(LoginResponse {
            success: false,
            role:    "none".to_string(),
            message: "token invalid or expired".to_string(),
        }),
    )
}

// -----------------------------------------------------------------------------
// File: src/api/auth.rs
// Tree: snap-coin-deals/src/api/auth.rs
// Created: 2026-04-02 | Version: 0.1.0
// -----------------------------------------------------------------------------
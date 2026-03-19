// -----------------------------------------------------------------------------
// File: src/main.rs
// Project: snap-coin-msg
// Description: Axum server bootstrap, routes, startup
// Version: 0.5.0
// -----------------------------------------------------------------------------

#![allow(dead_code)]
#![allow(unused)]

use axum::{
    extract::{State, WebSocketUpgrade},
    response::IntoResponse,
    routing::{get, post},
    Router,
};
use std::sync::Arc;
use tower_http::services::ServeDir;

mod api;
mod app_state;
mod config;
mod conversation;
mod transport;
mod wallet;
mod ws;

use app_state::AppState;
use snap_coin_opcode::Dictionary;

async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| ws::broadcaster::handle_socket(socket, state.tx.clone()))
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();
    dotenvy::dotenv().ok();

    let dict_path = std::env::var("DICTIONARY_PATH")
        .unwrap_or_else(|_| "../snap-coin-opcode/dictionary/dictionary.json".to_string());

    let dictionary = Dictionary::load(&dict_path).expect("failed to load dictionary");
    tracing::info!(
        "dictionary v{} loaded - {} opcodes",
        dictionary.version,
        dictionary.all_entries().len()
    );

    let state = Arc::new(AppState::new(dictionary));

    let app = Router::new()
        .route("/ws", get(ws_handler))
        .route("/api/dictionary",        get(api::dictionary::get_dictionary))
        .route("/api/node/status",       get(api::node::node_status))
        .route("/api/send",              post(api::send::send_message))
        .route("/api/conversations",     post(api::conversations::get_conversation))
        .route("/api/wallets",           get(api::wallets::list_wallets))
        .route("/api/wallets/add",       post(api::wallets::add_wallet))
        .route("/api/wallets/unlock",    post(api::wallets::unlock_wallet))
        .route("/api/contacts",          get(api::contacts::list_contacts))
        .route("/api/contacts/add",      post(api::contacts::add_contact))
        .route("/api/watchlist",         get(api::watchlist::list_watchlist))
        .route("/api/watchlist/add",     post(api::watchlist::add_watch))
        .route("/api/watchlist/remove",  post(api::watchlist::remove_watch))
        .fallback_service(ServeDir::new("static"))
        .with_state(state);

    let bind = std::env::var("BIND_ADDR")
        .unwrap_or_else(|_| "0.0.0.0:8080".to_string());

    let listener = tokio::net::TcpListener::bind(&bind).await.unwrap();
    let port = listener.local_addr().unwrap().port();

    tracing::info!("snap-coin-msg listening on {}", bind);
    tracing::info!("open -> http://localhost:{}", port);

    axum::serve(listener, app).await.unwrap();
}

// -----------------------------------------------------------------------------
// File: src/main.rs
// Project: snap-coin-msg
// Created: 2026-03-19
// -----------------------------------------------------------------------------
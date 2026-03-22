// -----------------------------------------------------------------------------
// File: src/main.rs
// Tree: snap-coin-msg/src/main.rs
// Description: Axum server bootstrap, routes, startup
// Version: 0.13.0
// Changes: added /api/wallets/reorder route
// -----------------------------------------------------------------------------

#![allow(dead_code)]
#![allow(unused)]

use axum::{
    extract::{State, WebSocketUpgrade},
    response::IntoResponse,
    routing::{get, post},
    Router,
};
use std::net::SocketAddr;
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
    ws.on_upgrade(move |socket| {
        ws::broadcaster::handle_socket(socket, state.tx.clone())
    })
}

async fn ws_chain_handler(
    ws: WebSocketUpgrade,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| {
        ws::chain_events::handle_chain_socket(socket, state.chain_tx.clone())
    })
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

    let node_addr: SocketAddr = std::env::var("NODE_API")
        .unwrap_or_else(|_| "127.0.0.1:3003".to_string())
        .parse()
        .expect("invalid NODE_API address");

    let opcode_genesis_height: u64 = std::env::var("OPCODE_GENESIS_HEIGHT")
        .unwrap_or_else(|_| "123114".to_string())
        .parse()
        .expect("invalid OPCODE_GENESIS_HEIGHT");

    tracing::info!("opcode genesis height: {}", opcode_genesis_height);

    let state = Arc::new(AppState::new(dictionary, node_addr, opcode_genesis_height).await);

    let app = Router::new()
        .route("/ws",                           get(ws_handler))
        .route("/ws/chain",                     get(ws_chain_handler))
        .route("/api/dictionary",               get(api::dictionary::get_dictionary))
        .route("/api/node/status",              get(api::node::node_status))
        .route("/api/chain/height",             get(api::chain::get_height))
        .route("/api/chain/balance/{address}",  get(api::chain::get_balance))
        .route("/api/send",                     post(api::send::send_message))
        .route("/api/conversations",            post(api::conversations::get_conversation))
        .route("/api/conversations/register",   post(api::conversations::register_pair))
        .route("/api/history",                  post(api::history::get_history))
        .route("/api/wallets",                  get(api::wallets::list_wallets))
        .route("/api/wallets/add",              post(api::wallets::add_wallet))
        .route("/api/wallets/create",           post(api::wallets::create_wallet))
        .route("/api/wallets/move",             post(api::wallets::move_wallet))
        .route("/api/wallets/delete",           post(api::wallets::delete_wallet))
        .route("/api/wallets/reorder",          post(api::wallets::reorder_wallet))
        .route("/api/wallets/send-snap",        post(api::wallets::send_snap))
        .route("/api/contacts",                 get(api::contacts::list_contacts))
        .route("/api/contacts/add",             post(api::contacts::add_contact))
        .route("/api/watchlist",                get(api::watchlist::list_watchlist))
        .route("/api/watchlist/add",            post(api::watchlist::add_watch))
        .route("/api/watchlist/remove",         post(api::watchlist::remove_watch))
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
// Tree: snap-coin-msg/src/main.rs
// Created: 2026-03-19 | Updated: 2026-03-22
// -----------------------------------------------------------------------------
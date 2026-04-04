// -----------------------------------------------------------------------------
// File: src/main.rs
// Tree: snap-coin-deals/src/main.rs
// Description: Axum server bootstrap, routes, and startup for snap-coin-deals
// Version: 0.1.0
// Comments: Auth middleware applied to all /api routes except /api/auth/login
//           Public routes: /api/auth/login, /api/businesses, /api/deals, static
//           Admin-only routes noted inline — enforce in frontend until role
//           middleware is added in a future version
//           Removes: conversations, send, contacts, watchlist, wallet_column
//           Adds: auth, members, businesses, deals, claims
// -----------------------------------------------------------------------------

#![allow(dead_code)]
#![allow(unused)]

use axum::{
    extract::{State, WebSocketUpgrade},
    middleware,
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
        .unwrap_or_else(|_| "config/local-dictionary.json".to_string());

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

    // -------------------------------------------------------------------------
    // Public routes — no auth required
    // -------------------------------------------------------------------------
    let public_routes = Router::new()
        .route("/api/auth/login",               post(api::auth::login))
        .route("/api/auth/verify",              get(api::auth::verify))
        .route("/api/businesses",               get(api::businesses::list_businesses))
        .route("/api/deals",                    get(api::deals::list_deals));

    // -------------------------------------------------------------------------
    // Protected routes — require bearer token
    // -------------------------------------------------------------------------
    let protected_routes = Router::new()
        // websocket
        .route("/ws",                           get(ws_handler))
        .route("/ws/chain",                     get(ws_chain_handler))
        // chain + node
        .route("/api/dictionary",               get(api::dictionary::get_dictionary))
        .route("/api/node/status",              get(api::node::node_status))
        .route("/api/chain/height",             get(api::chain::get_height))
        .route("/api/chain/balance/{address}",  get(api::chain::get_balance))
        // wallets
        .route("/api/wallets",                  get(api::wallets::list_wallets))
        .route("/api/wallets/add",              post(api::wallets::add_wallet))
        .route("/api/wallets/create",           post(api::wallets::create_wallet))
        .route("/api/wallets/move",             post(api::wallets::move_wallet))
        .route("/api/wallets/delete",           post(api::wallets::delete_wallet))
        .route("/api/wallets/reorder",          post(api::wallets::reorder_wallet))
        .route("/api/wallets/send-snap",        post(api::wallets::send_snap))
        // history
        .route("/api/history",                  post(api::history::get_history))
        // members
        .route("/api/members/enroll",           post(api::members::enroll_member))
        .route("/api/members/lookup",           post(api::members::lookup_member))
        .route("/api/members",                  get(api::members::list_members))
        .route("/api/members/suspend",          post(api::members::suspend_member))
        .route("/api/members/update",           post(api::members::update_member))
        // businesses
        .route("/api/businesses/all",           get(api::businesses::list_businesses_all))
        .route("/api/businesses/enroll",        post(api::businesses::enroll_business))
        .route("/api/businesses/lookup",        post(api::businesses::lookup_business))
        .route("/api/businesses/update",        post(api::businesses::update_business))
        .route("/api/businesses/suspend",       post(api::businesses::suspend_business))
        // deals
        .route("/api/deals/post",               post(api::deals::post_deal))
        .route("/api/deals/all",                get(api::deals::list_deals_all))
        .route("/api/deals/by-business",        post(api::deals::list_deals_by_business))
        .route("/api/deals/get",                post(api::deals::get_deal))
        .route("/api/deals/update",             post(api::deals::update_deal))
        .route("/api/deals/cancel",             post(api::deals::cancel_deal))
        // claims
        .route("/api/claims/create",            post(api::claims::create_claim))
        .route("/api/claims/redeem",            post(api::claims::redeem_claim))
        .route("/api/claims/update-tx",         post(api::claims::update_snap_tx))
        .route("/api/claims/verify",            post(api::claims::verify_claim))
        .route("/api/claims/by-member",         post(api::claims::list_claims_by_member))
        .route("/api/claims/by-business",       post(api::claims::list_claims_by_business))
        // auth middleware applied to all protected routes
        .layer(middleware::from_fn_with_state(
            state.clone(),
            api::auth::require_auth,
        ));

    // -------------------------------------------------------------------------
    // Merge and serve
    // -------------------------------------------------------------------------
    let app = public_routes
        .merge(protected_routes)
        .fallback_service(ServeDir::new("static"))
        .with_state(state);

    let bind = std::env::var("BIND_ADDR")
        .unwrap_or_else(|_| "0.0.0.0:8080".to_string());

    let listener = tokio::net::TcpListener::bind(&bind).await.unwrap();
    let port     = listener.local_addr().unwrap().port();

    tracing::info!("snap-coin-deals listening on {}", bind);
    tracing::info!("open -> http://localhost:{}", port);

    axum::serve(listener, app).await.unwrap();
}

// -----------------------------------------------------------------------------
// File: src/main.rs
// Tree: snap-coin-deals/src/main.rs
// Created: 2026-04-02 | Version: 0.1.0
// -----------------------------------------------------------------------------
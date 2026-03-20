// -----------------------------------------------------------------------------
// File: src/api/history.rs
// Project: snap-coin-msg
// Description: Fetch full wallet transaction history from opcode genesis height
// Version: 0.4.0
// -----------------------------------------------------------------------------

use axum::{extract::State, http::StatusCode, Json};
use serde::{Deserialize, Serialize};
use snap_coin::api::requests::{Request, Response};
use snap_coin::core::transaction::TransactionId;
use snap_coin::crypto::keys::Public;
use std::sync::Arc;
use tokio::io::AsyncWriteExt;
use tokio::net::TcpStream;
use crate::app_state::AppState;

#[derive(Debug, Deserialize)]
pub struct HistoryRequest {
    pub address: String,
}

#[derive(Debug, Serialize)]
pub struct HistoryResponse {
    pub address: String,
    pub entries: Vec<HistoryEntry>,
}

#[derive(Debug, Serialize)]
pub struct HistoryEntry {
    pub from_wallet: String,
    pub to_wallet:   String,
    pub amount:      String,
    pub token:       String,
    pub category:    String,
    pub meaning:     String,
    pub height:      u64,
    pub is_opcode:   bool,
}

// Send one request, read one response
async fn node_request(stream: &mut TcpStream, req: Request) -> Result<Response, StatusCode> {
    let bytes = req.encode().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    stream.write_all(&bytes).await.map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
    Response::decode_from_stream(stream).await.map_err(|_| StatusCode::SERVICE_UNAVAILABLE)
}

// Fetch tx IDs from genesis height forward — stops early once below genesis
async fn fetch_tx_ids_from_genesis(
    stream:         &mut TcpStream,
    stream_info:    &mut TcpStream,
    address:        Public,
    genesis_height: u64,
) -> Result<Vec<(TransactionId, u64)>, StatusCode> {
    let mut results = Vec::new();
    let mut page    = 0u32;

    'pages: loop {
        let req = Request::TransactionsOfAddress { address: address.clone(), page };
        match node_request(stream, req).await? {
            Response::TransactionsOfAddress { transactions, next_page } => {
                for tx_id in transactions {
                    let info_req = Request::TransactionAndInfo { transaction_id: tx_id.clone() };
                    let height = match node_request(stream_info, info_req).await? {
                        Response::TransactionAndInfo { transaction_and_info: Some(info) } => {
                            info.at_height
                        }
                        _ => continue,
                    };

                    if height < genesis_height {
                        break 'pages;
                    }

                    results.push((tx_id, height));
                }

                match next_page {
                    Some(p) => page = p,
                    None    => break,
                }
            }
            _ => return Err(StatusCode::INTERNAL_SERVER_ERROR),
        }
    }

    Ok(results)
}

pub async fn get_history(
    State(state): State<Arc<AppState>>,
    Json(req): Json<HistoryRequest>,
) -> Result<Json<HistoryResponse>, StatusCode> {

    let address  = Public::new_from_base36(&req.address).ok_or(StatusCode::BAD_REQUEST)?;
    let addr_str = address.dump_base36();

    let mut stream_ids  = TcpStream::connect(state.node_addr).await
        .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
    let mut stream_info = TcpStream::connect(state.node_addr).await
        .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
    let mut stream_tx   = TcpStream::connect(state.node_addr).await
        .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;

    let tx_ids = fetch_tx_ids_from_genesis(
        &mut stream_ids,
        &mut stream_info,
        address.clone(),
        state.opcode_genesis_height,
    ).await?;

    let mut entries: Vec<HistoryEntry> = Vec::new();
    let dict_entries = state.dictionary.all_entries();

    for (tx_id, height) in tx_ids {
        let req = Request::Transaction { transaction_id: tx_id };
        match node_request(&mut stream_tx, req).await? {
            Response::Transaction { transaction: Some(tx) } => {
                let sender = tx.inputs
                    .first()
                    .map(|i| i.output_owner.dump_base36())
                    .unwrap_or_default();

                for output in &tx.outputs {
                    let receiver = output.receiver.dump_base36();

                    // only include outputs directly to or from this wallet
                    // if sender: only outputs NOT back to self (excludes change)
                    // if receiver: only outputs where this wallet is the receiver
                    let is_sender   = sender == addr_str;
                    let is_receiver = receiver == addr_str;

                    if is_sender && receiver == addr_str { continue; } // skip change back to self
                    if !is_sender && !is_receiver        { continue; } // skip unrelated outputs

                    let amount_str = format!("{}.{:08}", output.amount / 100_000_000, output.amount % 100_000_000);

                    // check if this amount matches a dictionary opcode
                    let opcode_match = dict_entries
                        .iter()
                        .find(|(_, e)| e.amount == amount_str)
                        .map(|(k, e)| (k.clone(), e.category.clone(), e.meaning.clone()));

                    let (token, category, meaning, is_opcode) = match opcode_match {
                        Some((t, c, m)) => (t, c, m, true),
                        None => (
                            amount_str.clone(),
                            "transfer".to_string(),
                            "SNAP transfer".to_string(),
                            false,
                        ),
                    };

                    entries.push(HistoryEntry {
                        from_wallet: sender.clone(),
                        to_wallet:   receiver.clone(),
                        amount: amount_str,
                        token,
                        category,
                        meaning,
                        height,
                        is_opcode,
                    });
                }
            }
            _ => continue,
        }
    }

    // sort ascending — oldest first, frontend prepends so newest ends up on top
    entries.sort_by_key(|e| e.height);

    Ok(Json(HistoryResponse {
        address: req.address,
        entries,
    }))
}

// -----------------------------------------------------------------------------
// File: src/api/history.rs
// Project: snap-coin-msg
// Created: 2026-03-20 | Updated: 2026-03-20
// -----------------------------------------------------------------------------
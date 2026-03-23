// -----------------------------------------------------------------------------
// File: chain_events.rs
// Location: snap-coin-msg/src/ws/chain_events.rs
// Version: 0.4.0
// Description: Chain event broadcaster - dictionary aware, height tracking.
//              Updated for snap-coin v16: ChainEvent moved from
//              full_node::node_state to node::chain_events.
// -----------------------------------------------------------------------------

use axum::extract::ws::{Message, WebSocket};
use futures_util::{SinkExt, StreamExt};
use serde::Serialize;
use snap_coin::node::chain_events::ChainEvent;
use snap_coin_opcode::Dictionary;
use snap_coin_opcode::Decoder;
use snap_coin_pay::chain_interaction::ApiChainInteraction;
use snap_coin_pay::chain_interaction::ChainInteraction;
use std::collections::HashSet;
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::sync::{broadcast, RwLock};
use crate::app_state::WsEvent;

#[derive(Debug, Clone, Serialize)]
pub struct ChainEventMsg {
    pub event_type: String,
    pub detail:     String,
    pub height:     Option<u64>,
    pub is_opcode:  bool,
}

pub async fn start_chain_event_broadcaster(
    node_addr:         SocketAddr,
    tx:                broadcast::Sender<ChainEventMsg>,
    dictionary:        Arc<Dictionary>,
    opcode_tx:         broadcast::Sender<WsEvent>,
    watched_addresses: Arc<RwLock<HashSet<String>>>,
) {
    let chain = match ApiChainInteraction::new(node_addr).await {
        Ok(c)  => c,
        Err(e) => {
            tracing::error!("chain event broadcaster failed to connect: {}", e);
            return;
        }
    };

    chain.start_listener(None).await.ok();
    let mut rx    = chain.subscribe();
    let height_chain = match ApiChainInteraction::new(node_addr).await {
        Ok(c)  => Some(c),
        Err(_) => None,
    };

    tokio::spawn(async move {
        let mut current_height: u64 = 0;

        loop {
            match rx.recv().await {
                Ok(event) => {
                    let msg = match event {
                        ChainEvent::Block { block } => {
                            if let Some(ref hc) = height_chain {
                                if let Ok(h) = hc.get_height().await {
                                    current_height = h as u64;
                                }
                            }
                            let hash = block.meta.hash
                                .map(|h| format!("{:?}", h))
                                .unwrap_or_else(|| "none".to_string());
                            ChainEventMsg {
                                event_type: "BLOCK".to_string(),
                                detail: format!(
                                    "{} tx(s)  hash {}",
                                    block.transactions.len(),
                                    &hash[..12.min(hash.len())],
                                ),
                                height:    Some(current_height),
                                is_opcode: false,
                            }
                        }

                        ChainEvent::Transaction { transaction } => {
                            let mut opcode_parts: Vec<String> = Vec::new();
                            let mut is_opcode = false;
                            let decoder = Decoder::new(&dictionary);

                            let sender = transaction.inputs
                                .first()
                                .map(|i| i.output_owner.dump_base36())
                                .unwrap_or_default();

                            let watched = watched_addresses.read().await;

                            for output in &transaction.outputs {
                                let receiver   = output.receiver.dump_base36();
                                let amount_str = format!("0.{:08}", output.amount);

                                if let Some(entry) = dictionary.lookup_amount(&amount_str) {
                                    opcode_parts.push(format!(
                                        "{} → {}",
                                        &receiver[..8],
                                        entry.meaning
                                    ));
                                    is_opcode = true;

                                    if watched.contains(&receiver) {
                                        let _ = opcode_tx.send(WsEvent {
                                            from_wallet: sender.clone(),
                                            to_wallet:   receiver.clone(),
                                            amount:      amount_str.clone(),
                                            meaning:     entry.meaning.clone(),
                                            category:    entry.category.clone(),
                                            pending:     true,
                                        });
                                    }
                                } else {
                                    opcode_parts.push(format!(
                                        "{}  {}",
                                        &receiver[..8],
                                        amount_str
                                    ));
                                }
                            }

                            ChainEventMsg {
                                event_type: "MEMPOOL".to_string(),
                                detail:     opcode_parts.join("  |  "),
                                height:     None,
                                is_opcode,
                            }
                        }

                        ChainEvent::TransactionExpiration { transaction } => ChainEventMsg {
                            event_type: "EXPIRED".to_string(),
                            detail:     format!("{:?}", transaction),
                            height:     None,
                            is_opcode:  false,
                        },
                    };
                    tx.send(msg).ok();
                }
                Err(broadcast::error::RecvError::Lagged(n)) => {
                    tracing::warn!("chain event broadcaster lagged {} messages", n);
                }
                Err(broadcast::error::RecvError::Closed) => break,
            }
        }
    });
}

pub async fn handle_chain_socket(
    socket: WebSocket,
    tx: broadcast::Sender<ChainEventMsg>,
) {
    let mut rx = tx.subscribe();
    let (mut sender, mut receiver) = socket.split();

    let send_task = tokio::spawn(async move {
        while let Ok(msg) = rx.recv().await {
            let json = serde_json::json!({
                "event_type": msg.event_type,
                "detail":     msg.detail,
                "height":     msg.height,
                "is_opcode":  msg.is_opcode,
            });
            if sender
                .send(Message::Text(json.to_string().into()))
                .await
                .is_err()
            {
                break;
            }
        }
    });

    let recv_task = tokio::spawn(async move {
        while let Some(Ok(_)) = receiver.next().await {}
    });

    tokio::select! {
        _ = send_task => {}
        _ = recv_task => {}
    }
}

// -----------------------------------------------------------------------------
// File: chain_events.rs
// Location: snap-coin-msg/src/ws/chain_events.rs
// Created: 2026-03-23T00:00:00Z
// -----------------------------------------------------------------------------
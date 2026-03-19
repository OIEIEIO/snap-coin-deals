// -----------------------------------------------------------------------------
// File: src/ws/broadcaster.rs
// Project: snap-coin-msg
// Description: Push decoded opcode events to browser via WebSocket
// Version: 0.2.0
// -----------------------------------------------------------------------------

use axum::extract::ws::{Message, WebSocket};
use futures_util::{SinkExt, StreamExt};
use tokio::sync::broadcast;
use crate::app_state::WsEvent;

pub async fn handle_socket(socket: WebSocket, tx: broadcast::Sender<WsEvent>) {
    let mut rx = tx.subscribe();
    let (mut sender, mut receiver) = socket.split();

    let send_task = tokio::spawn(async move {
        while let Ok(event) = rx.recv().await {
            let msg = serde_json::json!({
                "from": event.from_wallet,
                "to": event.to_wallet,
                "amount": event.amount,
                "category": event.category,
                "meaning": event.meaning,
            });
            if sender
                .send(Message::Text(msg.to_string().into()))
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
// File: src/ws/broadcaster.rs
// Project: snap-coin-msg
// Created: 2026-03-19
// -----------------------------------------------------------------------------
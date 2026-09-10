use super::crdt::SyncytiumEngine;
use super::types::{CrdtOp, SyncytiumWireEvent};
use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    http::header,
    response::{Html, IntoResponse, Json},
    routing::{get, post},
    Router,
};
use serde::Deserialize;
use std::sync::Arc;

const DASHBOARD_HTML: &str = include_str!("dashboard.html");

#[derive(Deserialize)]
pub struct RewindRequest {
    pub target_ms: Option<u64>,
    pub step: Option<usize>,
}

async fn dashboard() -> Html<&'static str> {
    Html(DASHBOARD_HTML)
}

async fn get_state(State(engine): State<Arc<SyncytiumEngine>>) -> impl IntoResponse {
    Json(engine.snapshot().await)
}

async fn get_history(State(engine): State<Arc<SyncytiumEngine>>) -> impl IntoResponse {
    Json(engine.history().await)
}

async fn apply_op_api(
    State(engine): State<Arc<SyncytiumEngine>>,
    Json(op): Json<CrdtOp>,
) -> impl IntoResponse {
    let snapshot = engine.apply_op(op).await;
    Json(snapshot)
}

async fn rewind_api(
    State(engine): State<Arc<SyncytiumEngine>>,
    Json(req): Json<RewindRequest>,
) -> impl IntoResponse {
    let target = if let Some(ms) = req.target_ms {
        ms
    } else if let Some(step) = req.step {
        let history = engine.history().await;
        if step == 0 || history.is_empty() {
            0
        } else {
            let idx = (step - 1).min(history.len() - 1);
            history[idx].timestamp_ms
        }
    } else {
        0
    };
    let snapshot = engine.time_travel(target).await;
    Json(snapshot)
}

async fn export_api(State(engine): State<Arc<SyncytiumEngine>>) -> impl IntoResponse {
    let snapshot = engine.snapshot().await;
    (
        [(
            header::CONTENT_DISPOSITION,
            "attachment; filename=\"syncytium_crdt.json\"",
        )],
        Json(snapshot),
    )
}

async fn ws_handler(
    ws: WebSocketUpgrade,
    State(engine): State<Arc<SyncytiumEngine>>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, engine))
}

async fn handle_socket(mut socket: WebSocket, engine: Arc<SyncytiumEngine>) {
    let snapshot = engine.snapshot().await;
    let initial = SyncytiumWireEvent::Snapshot { snapshot };
    if let Ok(text) = serde_json::to_string(&initial) {
        if socket.send(Message::Text(text)).await.is_err() {
            return;
        }
    }

    let mut rx = engine.subscribe();
    loop {
        tokio::select! {
            event = rx.recv() => {
                match event {
                    Ok(ev) => {
                        if let Ok(text) = serde_json::to_string(&ev) {
                            if socket.send(Message::Text(text)).await.is_err() {
                                break;
                            }
                        }
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
                    Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
                }
            }
            incoming = socket.recv() => {
                match incoming {
                    Some(Ok(Message::Text(text))) => {
                        handle_client_ws_message(&engine, &text).await;
                    }
                    Some(Ok(_)) => continue,
                    _ => break,
                }
            }
        }
    }
}

async fn handle_client_ws_message(engine: &SyncytiumEngine, text: &str) {
    if let Ok(op) = serde_json::from_str::<CrdtOp>(text) {
        engine.apply_op(op).await;
    } else if let Ok(req) = serde_json::from_str::<RewindRequest>(text) {
        if let Some(target) = req.target_ms {
            engine.time_travel(target).await;
        }
    }
}

pub fn build_router(engine: Arc<SyncytiumEngine>) -> Router {
    Router::new()
        .route("/", get(dashboard))
        .route("/ws", get(ws_handler))
        .route("/api/syncytium/state", get(get_state))
        .route("/api/syncytium/history", get(get_history))
        .route("/api/syncytium/rewind", post(rewind_api))
        .route("/api/syncytium/op", post(apply_op_api))
        .route("/api/syncytium/export", get(export_api))
        .with_state(engine)
}

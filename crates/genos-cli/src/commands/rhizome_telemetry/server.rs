use super::graph::RhizomeGraph;
use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    http::header,
    response::{Html, IntoResponse, Json},
    routing::get,
    Router,
};
use std::sync::Arc;

const DASHBOARD_HTML: &str = include_str!("dashboard.html");

async fn dashboard() -> Html<&'static str> {
    Html(DASHBOARD_HTML)
}

async fn graph_snapshot(State(graph): State<Arc<RhizomeGraph>>) -> impl IntoResponse {
    Json(graph.snapshot().await)
}

/// Exports $G_t$ as JSON so the network topology can be saved, replayed, or handed to a client as
/// proof of how the mission was decomposed.
async fn export_snapshot(State(graph): State<Arc<RhizomeGraph>>) -> impl IntoResponse {
    let snapshot = graph.snapshot().await;
    (
        [(
            header::CONTENT_DISPOSITION,
            "attachment; filename=\"rhizome_graph.json\"",
        )],
        Json(snapshot),
    )
}

async fn ws_handler(
    ws: WebSocketUpgrade,
    State(graph): State<Arc<RhizomeGraph>>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, graph))
}

async fn handle_socket(mut socket: WebSocket, graph: Arc<RhizomeGraph>) {
    let snapshot = graph.snapshot().await;
    let initial = super::graph::GraphMutated::Snapshot { snapshot };
    if let Ok(text) = serde_json::to_string(&initial) {
        if socket.send(Message::Text(text)).await.is_err() {
            return;
        }
    }

    let mut rx = graph.subscribe();
    loop {
        tokio::select! {
            event = rx.recv() => {
                match event {
                    Ok(event) => {
                        if let Ok(text) = serde_json::to_string(&event) {
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
                    Some(Ok(_)) => continue,
                    _ => break,
                }
            }
        }
    }
}

/// Builds the telemetry HTTP + WebSocket router: a dashboard page, a live `GraphMutated` event
/// stream, and a REST snapshot/export endpoint so the graph is a requestable state, not just logs.
pub fn build_router(graph: Arc<RhizomeGraph>) -> Router {
    Router::new()
        .route("/", get(dashboard))
        .route("/ws", get(ws_handler))
        .route("/api/graph", get(graph_snapshot))
        .route("/api/export", get(export_snapshot))
        .with_state(graph)
}

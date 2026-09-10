use super::crdt::SyncytiumEngine;
use super::types::{CrdtOp, SyncytiumWireEvent};
use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Query, State,
    },
    http::{header, HeaderMap, StatusCode},
    response::{Html, IntoResponse, Json, Response},
    routing::{get, post},
    Router,
};
use serde::Deserialize;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Instant;

const DASHBOARD_HTML: &str = include_str!("dashboard.html");

/// Token bucket used to cap how fast a caller can mutate shared state or push
/// WebSocket messages, so a single client cannot flood the engine.
struct RateLimiter {
    capacity: f64,
    refill_per_sec: f64,
    state: Mutex<(f64, Instant)>,
}

impl RateLimiter {
    fn new(capacity: f64, refill_per_sec: f64) -> Self {
        Self {
            capacity,
            refill_per_sec,
            state: Mutex::new((capacity, Instant::now())),
        }
    }

    fn try_acquire(&self) -> bool {
        let mut guard = match self.state.lock() {
            Ok(guard) => guard,
            Err(poisoned) => poisoned.into_inner(),
        };
        let (tokens, last) = &mut *guard;
        let now = Instant::now();
        let elapsed = now.duration_since(*last).as_secs_f64();
        *tokens = (*tokens + elapsed * self.refill_per_sec).min(self.capacity);
        *last = now;
        if *tokens >= 1.0 {
            *tokens -= 1.0;
            true
        } else {
            false
        }
    }
}

fn constant_time_eq(a: &str, b: &str) -> bool {
    let a = a.as_bytes();
    let b = b.as_bytes();
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

#[derive(Clone)]
pub struct AppState {
    engine: Arc<SyncytiumEngine>,
    rate_limiter: Arc<RateLimiter>,
    auth_token: Option<Arc<String>>,
}

impl AppState {
    fn new(engine: Arc<SyncytiumEngine>) -> Self {
        let auth_token = std::env::var("GENOS_SYNCYTIUM_TOKEN")
            .ok()
            .filter(|token| !token.is_empty())
            .map(Arc::new);
        Self {
            engine,
            // 600 burst, refilled at 300 ops/s: generous for the 300ms
            // simulation tick yet impossible to flood unboundedly.
            rate_limiter: Arc::new(RateLimiter::new(600.0, 300.0)),
            auth_token,
        }
    }

    /// Returns true when the request is authorized. When no token is
    /// configured the endpoint remains open (loopback-only by default).
    fn authorize(&self, headers: &HeaderMap, query_token: Option<&str>) -> bool {
        let Some(expected) = self.auth_token.as_deref() else {
            return true;
        };
        if let Some(token) = query_token {
            if constant_time_eq(token, expected) {
                return true;
            }
        }
        if let Some(value) = headers.get(header::AUTHORIZATION).and_then(|value| value.to_str().ok()) {
            let token = value.strip_prefix("Bearer ").unwrap_or(value).trim();
            if constant_time_eq(token, expected) {
                return true;
            }
        }
        false
    }
}

#[derive(Deserialize)]
pub struct RewindRequest {
    pub target_ms: Option<u64>,
    pub step: Option<usize>,
}

fn unauthorized() -> Response {
    (
        StatusCode::UNAUTHORIZED,
        "Missing or invalid Syncytium authorization token.",
    )
        .into_response()
}

fn rate_limited() -> Response {
    (StatusCode::TOO_MANY_REQUESTS, "Rate limit exceeded.").into_response()
}

async fn dashboard() -> Html<&'static str> {
    Html(DASHBOARD_HTML)
}

async fn get_state(State(state): State<AppState>) -> impl IntoResponse {
    Json(state.engine.snapshot().await)
}

async fn get_history(State(state): State<AppState>) -> impl IntoResponse {
    Json(state.engine.history().await)
}

async fn apply_op_api(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(op): Json<CrdtOp>,
) -> Response {
    if !state.authorize(&headers, None) {
        return unauthorized();
    }
    if !state.rate_limiter.try_acquire() {
        return rate_limited();
    }
    let snapshot = state.engine.apply_op(op).await;
    Json(snapshot).into_response()
}

async fn rewind_api(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<RewindRequest>,
) -> Response {
    if !state.authorize(&headers, None) {
        return unauthorized();
    }
    if !state.rate_limiter.try_acquire() {
        return rate_limited();
    }
    let target = if let Some(ms) = req.target_ms {
        ms
    } else if let Some(step) = req.step {
        let history = state.engine.history().await;
        if step == 0 || history.is_empty() {
            0
        } else {
            let idx = (step - 1).min(history.len() - 1);
            history[idx].timestamp_ms
        }
    } else {
        0
    };
    let snapshot = state.engine.time_travel(target).await;
    Json(snapshot).into_response()
}

async fn export_api(State(state): State<AppState>) -> impl IntoResponse {
    let snapshot = state.engine.snapshot().await;
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
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(params): Query<HashMap<String, String>>,
) -> Response {
    let query_token = params.get("token").map(String::as_str);
    if !state.authorize(&headers, query_token) {
        return unauthorized();
    }
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

async fn send_event(socket: &mut WebSocket, event: &SyncytiumWireEvent) -> bool {
    match serde_json::to_string(event) {
        Ok(text) => socket.send(Message::Text(text)).await.is_ok(),
        Err(_) => true,
    }
}

async fn send_error(socket: &mut WebSocket, message: &str) {
    let event = SyncytiumWireEvent::Error {
        message: message.to_string(),
    };
    let _ = send_event(socket, &event).await;
}

async fn handle_socket(mut socket: WebSocket, state: AppState) {
    let snapshot = state.engine.snapshot().await;
    let initial = SyncytiumWireEvent::Snapshot { snapshot };
    if !send_event(&mut socket, &initial).await {
        return;
    }

    let mut rx = state.engine.subscribe();
    loop {
        tokio::select! {
            event = rx.recv() => {
                match event {
                    Ok(ev) => {
                        if !send_event(&mut socket, &ev).await {
                            break;
                        }
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Lagged(skipped)) => {
                        // The client fell behind and the broadcast ring dropped
                        // `skipped` events. Resync with a full snapshot instead
                        // of silently losing operations.
                        eprintln!("[Syncytium] client lagged {skipped} events; sending resync snapshot");
                        let snapshot = state.engine.snapshot().await;
                        let resync = SyncytiumWireEvent::Snapshot { snapshot };
                        if !send_event(&mut socket, &resync).await {
                            break;
                        }
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
                }
            }
            incoming = socket.recv() => {
                match incoming {
                    Some(Ok(Message::Text(text))) => {
                        if !state.rate_limiter.try_acquire() {
                            send_error(&mut socket, "Rate limit exceeded for WebSocket messages.").await;
                            continue;
                        }
                        if let Err(message) = apply_client_message(&state, &text).await {
                            send_error(&mut socket, &message).await;
                        }
                    }
                    Some(Ok(_)) => continue,
                    _ => break,
                }
            }
        }
    }
}

/// Parses a client WebSocket payload. Malformed input is surfaced back to the
/// caller as an error event rather than being silently discarded.
async fn apply_client_message(state: &AppState, text: &str) -> Result<(), String> {
    if let Ok(op) = serde_json::from_str::<CrdtOp>(text) {
        state.engine.apply_op(op).await;
        return Ok(());
    }
    if let Ok(req) = serde_json::from_str::<RewindRequest>(text) {
        if let Some(target) = req.target_ms {
            state.engine.time_travel(target).await;
        }
        return Ok(());
    }
    Err("Malformed message: expected a CrdtOp or RewindRequest JSON payload.".to_string())
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
        .with_state(AppState::new(engine))
}

use super::live_source::{LiveSource, dashboard_snapshot};
use axum::{
    Json, Router,
    extract::{
        State, WebSocketUpgrade,
        ws::{Message, WebSocket},
    },
    http::{StatusCode, header},
    response::{Html, IntoResponse, Response},
    routing::get,
};
use serde_json::json;

async fn read(source: LiveSource) -> Result<serde_json::Value, String> {
    tokio::task::spawn_blocking(move || source.read())
        .await
        .map_err(|error| error.to_string())?
}

async fn dashboard() -> Html<&'static str> {
    Html(include_str!("dashboard.html"))
}

async fn snapshot(State(source): State<LiveSource>) -> Response {
    match read(source).await {
        Ok(value) => Json(value).into_response(),
        Err(reason) => (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({"success":false, "error":reason})),
        )
            .into_response(),
    }
}

async fn export(State(source): State<LiveSource>) -> Response {
    match read(source).await {
        Ok(value) => (
            [(
                header::CONTENT_DISPOSITION,
                r#"attachment; filename="rhizome_graph.json""#,
            )],
            Json(value),
        )
            .into_response(),
        Err(reason) => (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({"success":false, "error":reason})),
        )
            .into_response(),
    }
}

async fn websocket(ws: WebSocketUpgrade, State(source): State<LiveSource>) -> impl IntoResponse {
    ws.on_upgrade(move |socket| stream(socket, source))
}

async fn stream(mut socket: WebSocket, source: LiveSource) {
    let mut timer = tokio::time::interval(std::time::Duration::from_secs(1));
    loop {
        tokio::select! {
            _ = timer.tick() => {
                let event = match read(source.clone()).await {
                    Ok(value) => json!({"type":"Snapshot", "snapshot":dashboard_snapshot(&value)}),
                    Err(reason) => json!({"type":"Error", "error":reason}),
                };
                let failed = event["type"] == "Error";
                if socket.send(Message::Text(event.to_string())).await.is_err() || failed { break; }
            }
            incoming = socket.recv() => {
                if !matches!(incoming, Some(Ok(_))) { break; }
            }
        }
    }
}

pub fn run(port: u16, source: LiveSource) -> Result<(), String> {
    source.read()?;
    let runtime = tokio::runtime::Runtime::new().map_err(|error| error.to_string())?;
    runtime.block_on(async move {
        let app = Router::new().route("/", get(dashboard)).route("/api/graph", get(snapshot))
            .route("/api/export", get(export)).route("/ws", get(websocket)).with_state(source);
        let address = format!("127.0.0.1:{port}");
        let listener = tokio::net::TcpListener::bind(&address).await.map_err(|error| error.to_string())?;
        println!("{}", json!({"success":true, "operation":"rhizome_live_telemetry", "source":"backend",
            "dashboard":format!("http://{address}/"), "graph_api":format!("http://{address}/api/graph")}));
        axum::serve(listener, app).await.map_err(|error| error.to_string())
    })
}

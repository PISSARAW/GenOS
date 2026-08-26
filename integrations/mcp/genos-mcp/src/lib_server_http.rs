fn negotiate_version(request: &Value) -> &str {
    match request
        .pointer("/params/protocolVersion")
        .and_then(Value::as_str)
    {
        Some("2025-06-18") => "2025-06-18",
        Some("2025-03-26") => "2025-03-26",
        Some("2024-11-05") => "2024-11-05",
        _ => MCP_PROTOCOL_VERSION,
    }
}

fn success_response(id: Value, result: Value) -> Value {
    json!({"jsonrpc": "2.0", "id": id, "result": result})
}

fn error_response(id: Value, code: i32, message: &str) -> Value {
    json!({"jsonrpc": "2.0", "id": id, "error": {"code": code, "message": message}})
}

fn tool_error(id: Value, message: String) -> Value {
    success_response(
        id,
        json!({
            "content": [{"type": "text", "text": message}],
            "isError": true
        }),
    )
}

pub async fn serve_stdio<R, W>(reader: R, mut writer: W, server: McpServer) -> anyhow::Result<()>
where
    R: AsyncRead + Unpin,
    W: AsyncWrite + Unpin,
{
    let mut lines = BufReader::new(reader).lines();
    while let Some(line) = lines.next_line().await? {
        if line.trim().is_empty() {
            continue;
        }
        let response = match serde_json::from_str::<Value>(&line) {
            Ok(request) => server.handle(request).await,
            Err(error) => Some(error_response(
                Value::Null,
                -32700,
                &format!("parse error: {error}"),
            )),
        };
        if let Some(response) = response {
            writer
                .write_all(serde_json::to_string(&response)?.as_bytes())
                .await?;
            writer.write_all(b"\n").await?;
            writer.flush().await?;
        }
    }
    Ok(())
}

pub fn http_router(server: McpServer) -> Router {
    Router::new()
        .route("/health", get(|| async { Json(json!({"status": "ok"})) }))
        .route("/mcp", post(mcp_http))
        .with_state(server)
}

#[derive(Clone)]
struct AuthenticatedHttpState {
    server: McpServer,
    bearer_token: String,
}

pub fn authenticated_http_router(server: McpServer, bearer_token: String) -> Router {
    Router::new()
        .route("/health", get(|| async { Json(json!({"status": "ok"})) }))
        .route("/mcp", post(authenticated_mcp_http))
        .with_state(AuthenticatedHttpState {
            server,
            bearer_token,
        })
}

async fn mcp_http(State(server): State<McpServer>, Json(request): Json<Value>) -> Response {
    match server.handle(request).await {
        Some(response) => (StatusCode::OK, Json(response)).into_response(),
        None => StatusCode::ACCEPTED.into_response(),
    }
}

async fn authenticated_mcp_http(
    State(state): State<AuthenticatedHttpState>,
    headers: HeaderMap,
    Json(request): Json<Value>,
) -> Response {
    let expected = format!("Bearer {}", state.bearer_token);
    let supplied = headers
        .get("authorization")
        .and_then(|value| value.to_str().ok());
    if supplied != Some(expected.as_str()) {
        return (
            StatusCode::UNAUTHORIZED,
            Json(json!({"error": "unauthorized"})),
        )
            .into_response();
    }
    mcp_http(State(state.server), Json(request)).await
}

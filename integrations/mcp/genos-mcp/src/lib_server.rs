#[derive(Clone)]
pub struct McpServer {
    executor: Arc<dyn CommandExecutor>,
}

impl McpServer {
    pub fn new(executor: Arc<dyn CommandExecutor>) -> Self {
        Self { executor }
    }

    pub async fn handle(&self, request: Value) -> Option<Value> {
        let id = request.get("id").cloned()?;
        let method = request.get("method").and_then(Value::as_str);
        if request.get("jsonrpc").and_then(Value::as_str) != Some("2.0") {
            return Some(error_response(id, -32600, "invalid JSON-RPC request"));
        }

        match method {
            Some("initialize") => Some(success_response(
                id,
                json!({
                    "protocolVersion": negotiate_version(&request),
                    "capabilities": {"tools": {"listChanged": false}},
                    "serverInfo": {"name": "genos-mcp", "version": env!("CARGO_PKG_VERSION")},
                    "instructions": SERVER_INSTRUCTIONS
                }),
            )),
            Some("ping") => Some(success_response(id, json!({}))),
            Some("tools/list") => Some(success_response(id, json!({"tools": public_tool_specs()}))),
            Some("tools/call") => Some(self.call_tool(id, request.get("params")).await),
            Some(method) => Some(error_response(
                id,
                -32601,
                &format!("method not found: {method}"),
            )),
            None => Some(error_response(id, -32600, "request method is required")),
        }
    }
}

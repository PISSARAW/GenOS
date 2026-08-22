use async_trait::async_trait;
use axum::{
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use genos_protocol::{plan_tool_call, tool_specs, CommandOutcome, ProtocolResult, ToolAnnotations, ToolSpec, PROTOCOL_VERSION};
use serde_json::{json, Value};
use std::{env, path::PathBuf, sync::Arc};
use tokio::{
    io::{AsyncBufReadExt, AsyncRead, AsyncWrite, AsyncWriteExt, BufReader},
    process::Command,
};

pub const MCP_PROTOCOL_VERSION: &str = "2025-06-18";
pub const SERVER_INSTRUCTIONS: &str = "GenOS versions complete agent-world state and software-development trajectories. Inspect and search negative knowledge before mutation. Diagnose with falsifiable hypotheses before solve; snapshot before risky work; fork when comparing alternatives; diff, adversarially review, and evaluate across relevant worlds before merge. Use project experiment tools for workspace refactors, causal replay, incident reproduction, scientific research, security coevolution, and unknown-cause debugging. Record decisions, assumptions, evidence, failures, and code/test lineage for future agents. genos_run and workspace-based project experiments may execute explicit commands in isolated GenOS worlds and change files. Never run a command the user did not authorize. Product clients such as Codex are tools users, not model providers stored in the genome.";

fn expose_full_catalog() -> bool {
    matches!(env::var("GENOS_MCP_EXPOSE_ALL").as_deref(), Ok("1") | Ok("true") | Ok("TRUE"))
}

fn orchestrator_tool() -> ToolSpec {
    ToolSpec {
        name: "genos_orchestrate".into(),
        title: "GenOS Orchestrator".into(),
        description: "Start or continue an evidence-driven GenOS orchestration. Give a task on the first call. On later calls choose an operation (search_failures, diagnose, snapshot, fork, create, evaluate_trajectories, merge, replay, resilience_hypermutation, security_coevolution) and pass its arguments. The orchestrator decides when to delegate, fork, replay, or merge; workers receive only leased operations.".into(),
        input_schema: json!({"type":"object","additionalProperties":false,"properties":{
            "task":{"type":"string","description":"Mission on the first call."},
            "operation":{"type":"string","description":"Leased GenOS operation for this decision gate."},
            "arguments":{"type":"object","description":"Arguments for the leased operation."}
        },"required":[]}),
        output_schema: json!({"type":"object"}),
        annotations: ToolAnnotations { read_only_hint: false, destructive_hint: false, idempotent_hint: false, open_world_hint: false },
        meta: json!({"genos/protocolVersion": PROTOCOL_VERSION, "genos/authority":"orchestrator"}),
    }
}

fn public_tool_specs() -> Vec<ToolSpec> {
    if expose_full_catalog() { tool_specs() } else { vec![orchestrator_tool()] }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ExecutionOutput {
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
}

#[async_trait]
pub trait CommandExecutor: Send + Sync {
    async fn execute(&self, args: &[String]) -> anyhow::Result<ExecutionOutput>;
}

#[derive(Clone, Debug)]
pub struct GenosCliExecutor {
    executable: Option<PathBuf>,
    workspace_root: PathBuf,
    orchestrator_bridge: Option<PathBuf>,
}

impl GenosCliExecutor {
    pub fn discover() -> anyhow::Result<Self> {
        let workspace_root = env::var_os("GENOS_WORKSPACE_ROOT")
            .map(PathBuf::from)
            .unwrap_or(env::current_dir()?);
        let executable = env::var_os("GENOS_BIN")
            .map(PathBuf::from)
            .or_else(sibling_genos_binary);
        let orchestrator_bridge = env::var_os("GENOS_ORCHESTRATOR_BRIDGE").map(PathBuf::from)
            .or_else(|| {
                let candidate = workspace_root.join("backend/bin/genos-orchestrate.cjs");
                candidate.is_file().then_some(candidate)
            });
        Ok(Self {
            executable,
            workspace_root,
            orchestrator_bridge,
        })
    }

    pub fn new(executable: impl Into<PathBuf>, workspace_root: impl Into<PathBuf>) -> Self {
        Self {
            executable: Some(executable.into()),
            workspace_root: workspace_root.into(),
            orchestrator_bridge: None,
        }
    }
}

#[async_trait]
impl CommandExecutor for GenosCliExecutor {
    async fn execute(&self, args: &[String]) -> anyhow::Result<ExecutionOutput> {
        let mut command = if args.first().map(String::as_str) == Some("__genos_backend_orchestrate__") {
            let bridge = self.orchestrator_bridge.as_ref()
                .ok_or_else(|| anyhow::anyhow!("backend/bin/genos-orchestrate.cjs was not found; set GENOS_ORCHESTRATOR_BRIDGE"))?;
            let mut node = Command::new("node");
            node.arg(bridge).args(&args[1..]);
            node
        } else { match &self.executable {
            Some(executable) => Command::new(executable),
            None => {
                let mut cargo = Command::new("cargo");
                cargo.args([
                    "run",
                    "--quiet",
                    "--manifest-path",
                    self.workspace_root
                        .join("Cargo.toml")
                        .to_string_lossy()
                        .as_ref(),
                    "-p",
                    "genos-cli",
                    "--",
                ]);
                cargo
            }
        }};
        let output = command
            .args(args)
            .current_dir(&self.workspace_root)
            .kill_on_drop(true)
            .output()
            .await?;
        Ok(ExecutionOutput {
            exit_code: output.status.code().unwrap_or(-1),
            stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
            stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
        })
    }
}

fn sibling_genos_binary() -> Option<PathBuf> {
    let current = env::current_exe().ok()?;
    let name = if cfg!(windows) { "genos.exe" } else { "genos" };
    let candidate = current.with_file_name(name);
    candidate.is_file().then_some(candidate)
}

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

    async fn call_tool(&self, id: Value, params: Option<&Value>) -> Value {
        let Some(params) = params.and_then(Value::as_object) else {
            return error_response(id, -32602, "tools/call params must be an object");
        };
        let Some(name) = params.get("name").and_then(Value::as_str) else {
            return error_response(id, -32602, "tools/call requires a tool name");
        };
        let arguments = params
            .get("arguments")
            .cloned()
            .unwrap_or_else(|| json!({}));
        let (operation_name, operation_arguments) = if name == "genos_orchestrate" && arguments.get("operation").is_none() && expose_full_catalog() == false {
            ("__genos_backend_orchestrate__".to_string(), arguments)
        } else if name == "genos_orchestrate" {
            let operation = arguments.get("operation").and_then(Value::as_str).unwrap_or("solve");
            let operation_name = format!("genos_{}", operation.strip_prefix("genos_").unwrap_or(operation));
            let task = arguments.get("task").and_then(Value::as_str).unwrap_or("Autonomous GenOS orchestration");
            let operation_arguments = arguments.get("arguments").cloned().unwrap_or_else(|| {
                if operation == "solve" { json!({"problem": task}) } else { json!({"query": task}) }
            });
            (operation_name, operation_arguments)
        } else if expose_full_catalog() {
            (name.to_string(), arguments)
        } else {
            return tool_error(id, "Only genos_orchestrate is public. Set GENOS_MCP_EXPOSE_ALL=true for an internal full-catalog client.".into());
        };
        let planned = if operation_name == "__genos_backend_orchestrate__" {
            genos_protocol::PlannedCommand { operation: "backend_orchestrate".into(), args: vec![operation_name, operation_arguments.to_string()] }
        } else { match plan_tool_call(&operation_name, &operation_arguments) {
            Ok(planned) => planned,
            Err(error) => return tool_error(id, error.to_string()),
        }};

        match self.executor.execute(&planned.args).await {
            Ok(execution) => {
                let result = ProtocolResult::new(
                    planned.operation,
                    CommandOutcome {
                        exit_code: execution.exit_code,
                        stdout: execution.stdout,
                        stderr: execution.stderr,
                    },
                );
                let text = serde_json::to_string_pretty(&result)
                    .unwrap_or_else(|error| format!("failed to serialize GenOS result: {error}"));
                success_response(
                    id,
                    json!({
                        "content": [{"type": "text", "text": text}],
                        "structuredContent": result,
                        "isError": execution.exit_code != 0
                    }),
                )
            }
            Err(error) => tool_error(id, format!("failed to launch GenOS: {error}")),
        }
    }
}

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

async fn mcp_http(State(server): State<McpServer>, Json(request): Json<Value>) -> Response {
    match server.handle(request).await {
        Some(response) => (StatusCode::OK, Json(response)).into_response(),
        None => StatusCode::ACCEPTED.into_response(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        body::{to_bytes, Body},
        http::Request,
    };
    use tokio::io::{duplex, split, AsyncBufReadExt, AsyncWriteExt, BufReader};
    use tower::ServiceExt;

    #[derive(Clone)]
    struct FakeExecutor {
        output: ExecutionOutput,
    }

    #[async_trait]
    impl CommandExecutor for FakeExecutor {
        async fn execute(&self, _args: &[String]) -> anyhow::Result<ExecutionOutput> {
            Ok(self.output.clone())
        }
    }

    fn server() -> McpServer {
        McpServer::new(Arc::new(FakeExecutor {
            output: ExecutionOutput {
                exit_code: 0,
                stdout: "{\"valid\":true}\n".into(),
                stderr: String::new(),
            },
        }))
    }

    #[tokio::test]
    async fn initialize_advertises_tools_and_instructions() {
        let response = server()
            .handle(json!({
                "jsonrpc": "2.0",
                "id": 1,
                "method": "initialize",
                "params": {"protocolVersion": "2025-03-26"}
            }))
            .await
            .unwrap();
        assert_eq!(response["result"]["protocolVersion"], "2025-03-26");
        assert_eq!(
            response["result"]["capabilities"]["tools"]["listChanged"],
            false
        );
        assert!(response["result"]["instructions"]
            .as_str()
            .unwrap()
            .starts_with("GenOS versions"));
    }

    #[tokio::test]
    async fn tool_call_returns_versioned_structured_content() {
        let response = server()
            .handle(json!({
                "jsonrpc": "2.0",
                "id": "call-1",
                "method": "tools/call",
                "params": {"name": "genos_orchestrate", "arguments": {"operation": "inspect", "arguments": {"path": "agent.yaml"}}}
            }))
            .await
            .unwrap();
        assert_eq!(response["result"]["isError"], false);
        assert_eq!(
            response["result"]["structuredContent"]["protocol_version"],
            genos_protocol::PROTOCOL_VERSION
        );
        assert_eq!(
            response["result"]["structuredContent"]["output"]["valid"],
            true
        );
    }

    #[tokio::test]
    async fn stdio_transport_uses_one_json_rpc_message_per_line() {
        let (client, server_io) = duplex(16 * 1024);
        let (client_read, mut client_write) = split(client);
        let (server_read, server_write) = split(server_io);
        let task = tokio::spawn(serve_stdio(server_read, server_write, server()));

        client_write
            .write_all(b"{\"jsonrpc\":\"2.0\",\"id\":7,\"method\":\"ping\"}\n")
            .await
            .unwrap();
        let mut line = String::new();
        BufReader::new(client_read)
            .read_line(&mut line)
            .await
            .unwrap();
        let response: Value = serde_json::from_str(&line).unwrap();
        assert_eq!(response["id"], 7);
        drop(client_write);
        task.await.unwrap().unwrap();
    }

    #[tokio::test]
    async fn http_transport_accepts_json_rpc_posts() {
        let response = http_router(server())
            .oneshot(
                Request::post("/mcp")
                    .header("content-type", "application/json")
                    .body(Body::from(
                        r#"{"jsonrpc":"2.0","id":9,"method":"tools/list"}"#,
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let value: Value = serde_json::from_slice(&body).unwrap();
        let tools = value["result"]["tools"].as_array().unwrap();
        assert_eq!(tools.len(), 1);
        assert_eq!(tools[0]["name"], "genos_orchestrate");
    }
}

mod tools;

use serde_json::{json, Value};
use std::env;
use std::io::{self, BufRead, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

const DEFAULT_TOOL_TIMEOUT_MS: u64 = 120_000;
const MAX_OUTPUT_BYTES: usize = 1024 * 1024;

fn tool_timeout_ms() -> u64 {
    env::var("GENOS_MCP_TOOL_TIMEOUT_MS")
        .ok()
        .and_then(|value| value.parse::<u64>().ok())
        .filter(|value| *value > 0)
        .map(|value| value.min(30 * 60 * 1000))
        .unwrap_or(DEFAULT_TOOL_TIMEOUT_MS)
}

fn bounded_output(bytes: Vec<u8>) -> String {
    let start = bytes.len().saturating_sub(MAX_OUTPUT_BYTES);
    String::from_utf8_lossy(&bytes[start..]).to_string()
}

fn execute_command(mut command: Command) -> Result<(i32, String), String> {
    let mut child = command
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| error.to_string())?;
    let stdout = child.stdout.take().map(|mut stream| thread::spawn(move || {
        let mut bytes = Vec::new();
        let _ = stream.read_to_end(&mut bytes);
        bytes
    }));
    let stderr = child.stderr.take().map(|mut stream| thread::spawn(move || {
        let mut bytes = Vec::new();
        let _ = stream.read_to_end(&mut bytes);
        bytes
    }));
    let deadline = Instant::now() + Duration::from_millis(tool_timeout_ms());
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if Instant::now() >= deadline => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(format!("MCP tool timed out after {}ms.", tool_timeout_ms()));
            }
            Ok(None) => thread::sleep(Duration::from_millis(10)),
            Err(error) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(error.to_string());
            }
        }
    };
    let stdout = stdout.and_then(|thread| thread.join().ok()).unwrap_or_default();
    let stderr = stderr.and_then(|thread| thread.join().ok()).unwrap_or_default();
    let text = if stderr.is_empty() {
        bounded_output(stdout)
    } else {
        format!("{}\n{}", bounded_output(stdout), bounded_output(stderr))
    };
    Ok((status.code().unwrap_or(-1), text))
}

fn find_genos_binary(workspace: &Path) -> Option<PathBuf> {
    if let Ok(path_str) = env::var("GENOS_BIN") {
        let p = PathBuf::from(path_str);
        if p.is_file() {
            return Some(p);
        }
    }
    let exe_name = if cfg!(windows) { "genos.exe" } else { "genos" };
    if let Ok(current) = env::current_exe() {
        let candidate = current.with_file_name(exe_name);
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    for sub in &["target/debug", "target/release", "../target/debug", "../../target/debug"] {
        let candidate = workspace.join(sub).join(exe_name);
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    None
}

fn resolve_bridge_path(workspace: &Path) -> PathBuf {
    if let Ok(val) = env::var("GENOS_ORCHESTRATOR_BRIDGE") {
        let p = PathBuf::from(val);
        if p.is_file() {
            return p;
        }
    }
    workspace.join("backend/bin/genos-orchestrate.cjs")
}

fn execute_orchestrator(bridge: &Path, payload: &Value, workspace: &Path) -> (i32, String) {
    let payload_str = payload.to_string();
    let mut cmd = Command::new("node");
    cmd.arg(bridge)
        .arg(&payload_str)
        .current_dir(workspace);

    if let Ok(mode) = env::var("GENOS_EXECUTION_MODE") {
        cmd.env("GENOS_EXECUTION_MODE", mode);
    }
    if let Ok(id) = env::var("GENOS_AGENT_ID") {
        cmd.env("GENOS_AGENT_ID", id);
    }
    if let Ok(orch) = env::var("GENOS_ORCHESTRATOR_AGENT_ID") {
        cmd.env("GENOS_ORCHESTRATOR_AGENT_ID", orch);
    }

    match execute_command(cmd) {
        Ok(result) => result,
        Err(error) => (-1, format!("Failed to invoke orchestrator bridge: {error}")),
    }
}

fn build_cli_args(name: &str, args: &Value) -> Vec<String> {
    match name {
        "genos_snapshot" => {
            let agent = args.get("agent").and_then(Value::as_str).unwrap_or("default-agent");
            let out = args.get("out").and_then(Value::as_str).unwrap_or("snapshots/mcp-snapshot.json");
            vec!["snapshot".into(), "create".into(), "--agent".into(), agent.into(), "--out".into(), out.into()]
        }
        "genos_capsule_create" => {
            let snap = args.get("snapshot_id").and_then(Value::as_str).unwrap_or("ROOT");
            let mut v = vec!["capsule".into(), "create".into(), "--snapshot".into(), snap.into()];
            if let Some(seed) = args.get("seed").and_then(Value::as_str) {
                v.push("--seed".into());
                v.push(seed.into());
            }
            v
        }
        "genos_merge" => {
            let branch = args.get("branch_id").and_then(Value::as_str).unwrap_or("HEAD");
            let mut v = vec!["merge".into(), branch.into()];
            if let Some(cond) = args.get("conditions").and_then(Value::as_str) {
                v.push("--conditions".into());
                v.push(cond.into());
            }
            v
        }
        "genos_audit" => {
            let snap = args.get("snapshot_id").and_then(Value::as_str).unwrap_or("ROOT");
            let out = args.get("output").and_then(Value::as_str).unwrap_or("audit.log");
            vec!["audit".into(), snap.into(), "--output".into(), out.into()]
        }
        "genos_biomimicry" => {
            let feat = args.get("feature").and_then(Value::as_str).unwrap_or("sar");
            let act = args.get("action").and_then(Value::as_str).unwrap_or("prime");
            vec!["biomimicry".into(), "bio-feature".into(), "--feature".into(), feat.into(), "--action".into(), act.into()]
        }
        "genos_v2_init" => vec!["init".into()],
        "genos_v2_fork" => {
            let p = args.get("parent_id").and_then(Value::as_str).unwrap_or("ROOT");
            vec!["agent".into(), "fork".into(), "--parent-id".into(), p.into()]
        }
        _ => vec!["--help".into()],
    }
}

fn execute_cli(workspace: &Path, name: &str, args: &Value) -> (i32, String) {
    let cli_args = build_cli_args(name, args);
    let mut cmd = if let Some(bin) = find_genos_binary(workspace) {
        let mut c = Command::new(bin);
        c.args(&cli_args);
        c
    } else {
        let mut c = Command::new("cargo");
        c.args(["run", "-q", "--manifest-path", &workspace.join("Cargo.toml").to_string_lossy(), "-p", "genos-cli", "--"]);
        c.args(&cli_args);
        c
    };

    cmd.current_dir(workspace);
    match execute_command(cmd) {
        Ok(result) => result,
        Err(error) => (-1, format!("Failed to execute GenOS CLI: {error}")),
    }
}

fn handle_tool_call(name: &str, args: &Value, workspace: &Path) -> (i32, String) {
    let bridge = resolve_bridge_path(workspace);
    match name {
        "genos_orchestrate" => {
            let mut payload = args.clone();
            if let Some(obj) = payload.as_object_mut() {
                obj.insert("action".into(), json!("orchestrate"));
                obj.entry("background").or_insert_with(|| json!(false));
            }
            execute_orchestrator(&bridge, &payload, workspace)
        }
        "genos_delegate_worker" => {
            let mut payload = args.clone();
            if let Some(obj) = payload.as_object_mut() {
                obj.insert("action".into(), json!("dispatch_worker"));
                obj.insert("background".into(), json!(false));
            }
            execute_orchestrator(&bridge, &payload, workspace)
        }
        "genos_change_strategy" => {
            let mut payload = args.clone();
            if let Some(obj) = payload.as_object_mut() {
                obj.insert("action".into(), json!("change_strategy"));
            }
            execute_orchestrator(&bridge, &payload, workspace)
        }
        "genos_report_progress" => {
            let mut payload = args.clone();
            if let Some(obj) = payload.as_object_mut() {
                obj.insert("action".into(), json!("report_progress"));
            }
            execute_orchestrator(&bridge, &payload, workspace)
        }
        "genos_change_organization" => {
            let mut payload = args.clone();
            if let Some(obj) = payload.as_object_mut() {
                obj.insert("action".into(), json!("change_organization"));
            }
            execute_orchestrator(&bridge, &payload, workspace)
        }
        "genos_organization_state" => {
            let payload = json!({ "action": "organization_state" });
            execute_orchestrator(&bridge, &payload, workspace)
        }
        "genos_worker_publish" => {
            let mut payload = args.clone();
            if let Some(obj) = payload.as_object_mut() {
                obj.insert("action".into(), json!("organization_publish"));
            }
            execute_orchestrator(&bridge, &payload, workspace)
        }
        "genos_worker_inbox" => {
            let mut payload = args.clone();
            if let Some(obj) = payload.as_object_mut() {
                obj.insert("action".into(), json!("organization_inbox"));
            }
            execute_orchestrator(&bridge, &payload, workspace)
        }
        "genos_trinity_launch" => {
            let mut payload = args.clone();
            if let Some(obj) = payload.as_object_mut() {
                obj.insert("action".into(), json!("dispatch_trinity"));
            }
            execute_orchestrator(&bridge, &payload, workspace)
        }
        "genos_a_team_preview" => {
            let mut payload = args.clone();
            if let Some(obj) = payload.as_object_mut() {
                obj.insert("action".into(), json!("dispatch_team"));
            }
            execute_orchestrator(&bridge, &payload, workspace)
        }
        "genos_snapshot"
        | "genos_capsule_create"
        | "genos_merge"
        | "genos_audit"
        | "genos_biomimicry"
        | "genos_v2_init"
        | "genos_v2_fork" => execute_cli(workspace, name, args),
        _ => (-1, format!("Unsupported MCP tool: {name}")),
    }
}

fn process_request(line: &str, workspace: &Path) -> Option<Value> {
    let req: Value = match serde_json::from_str(line) {
        Ok(v) => v,
        Err(_) => return None,
    };

    let id = req.get("id").cloned();
    let method = req.get("method").and_then(Value::as_str)?;

    match method {
        "initialize" => Some(json!({
            "jsonrpc": "2.0",
            "id": id,
            "result": {
                "protocolVersion": "2025-06-18",
                "capabilities": { "tools": { "listChanged": false } },
                "serverInfo": { "name": "genos-mcp", "version": "3.0.0" },
                "instructions": "GenOS autonomous agent runtime tools."
            }
        })),
        "notifications/initialized" => None,
        "ping" => Some(json!({ "jsonrpc": "2.0", "id": id, "result": {} })),
        "tools/list" => Some(json!({
            "jsonrpc": "2.0",
            "id": id,
            "result": { "tools": tools::public_tool_specs() }
        })),
        "tools/call" => {
            let params = req.get("params");
            let name = params.and_then(|p| p.get("name")).and_then(Value::as_str).unwrap_or("");
            let empty_args = json!({});
            let args = params.and_then(|p| p.get("arguments")).unwrap_or(&empty_args);

            if !tools::is_tool_allowed(name) {
                return Some(json!({
                    "jsonrpc": "2.0",
                    "id": id,
                    "result": {
                        "content": [{ "type": "text", "text": format!("Tool '{name}' is outside the active GenOS MCP lease.") }],
                        "isError": true
                    }
                }));
            }

            let (code, text) = handle_tool_call(name, args, workspace);
            Some(json!({
                "jsonrpc": "2.0",
                "id": id,
                "result": {
                    "content": [{ "type": "text", "text": text }],
                    "isError": code != 0
                }
            }))
        }
        _ => Some(json!({
            "jsonrpc": "2.0",
            "id": id,
            "error": { "code": -32601, "message": format!("Method '{method}' not found") }
        })),
    }
}

fn main() {
    let workspace = env::var("GENOS_WORKSPACE_ROOT")
        .map(PathBuf::from)
        .or_else(|_| env::current_dir())
        .unwrap_or_else(|_| PathBuf::from("."));

    eprintln!("🧬 GenOS MCP Server running on stdio (workspace: {})", workspace.display());

    let stdin = io::stdin();
    let mut stdout = io::stdout();

    for line_res in stdin.lock().lines() {
        let line = match line_res {
            Ok(l) => l,
            Err(_) => break,
        };
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        if let Some(resp) = process_request(trimmed, &workspace) {
            let out = resp.to_string();
            let _ = writeln!(stdout, "{out}");
            let _ = stdout.flush();
        }
    }
}

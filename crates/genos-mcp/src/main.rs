mod tools;

use serde_json::{json, Value};
use std::env;
use std::io::{self, BufRead, Write};
use std::path::{Path, PathBuf};
use std::process::Command;

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

    match cmd.output() {
        Ok(output) => {
            let code = output.status.code().unwrap_or(-1);
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            let combined = if stderr.is_empty() { stdout } else { format!("{stdout}\n{stderr}") };
            (code, combined)
        }
        Err(e) => (-1, format!("Failed to invoke orchestrator bridge: {e}")),
    }
}

fn build_cli_args(name: &str, args: &Value) -> Vec<String> {
    match name {
        "genos_snapshot" => {
            let msg = args.get("message").and_then(Value::as_str).unwrap_or("MCP snapshot");
            let mut v = vec!["snapshot".into(), "create".into(), "--message".into(), msg.into()];
            if let Some(b) = args.get("branch_id").and_then(Value::as_str) {
                v.push("--branch-id".into());
                v.push(b.into());
            }
            v
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
            vec!["fork".into(), "--parent-id".into(), p.into()]
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
    match cmd.output() {
        Ok(output) => {
            let code = output.status.code().unwrap_or(-1);
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            let combined = if stderr.is_empty() { stdout } else { format!("{stdout}\n{stderr}") };
            (code, combined)
        }
        Err(e) => (-1, format!("Failed to execute GenOS CLI: {e}")),
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
        _ => execute_cli(workspace, name, args),
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

mod executor;
pub mod omega;
mod omega_dispatch;
pub mod omega_runtime;
mod omega_semantic_registry;
mod tools;
mod validation;

use serde_json::{json, Value};
use std::env;
use std::io::{self, BufRead, Write};
use std::path::{Path, PathBuf};

use validation::{validate_path_arguments, validate_tool_arguments};

fn extract_json_candidate(line: &str) -> &str {
    let trimmed = line.trim().trim_start_matches('\u{feff}');
    if let Some(start_idx) = trimmed.find('{') {
        if let Some(end_idx) = trimmed.rfind('}') {
            if end_idx >= start_idx {
                return &trimmed[start_idx..=end_idx];
            }
        }
    }
    trimmed
}

fn handle_initialize(req: &Value, id: Option<Value>) -> Option<Value> {
    let client_version = req
        .get("params")
        .and_then(|p| p.get("protocolVersion"))
        .and_then(Value::as_str)
        .unwrap_or("2024-11-05");
    Some(json!({
        "jsonrpc": "2.0",
        "id": id,
        "result": {
            "protocolVersion": client_version,
            "capabilities": { "tools": { "listChanged": false } },
            "serverInfo": { "name": "genos-mcp", "version": "3.0.0" },
            "instructions": "GenOS autonomous agent runtime tools."
        }
    }))
}

fn handle_tools_list(id: Option<Value>) -> Option<Value> {
    Some(json!({
        "jsonrpc": "2.0",
        "id": id,
        "result": { "tools": tools::public_tool_specs() }
    }))
}

fn handle_tools_call(req: &Value, id: Option<Value>, workspace: &Path) -> Option<Value> {
    let params = req.get("params");
    let name = params
        .and_then(|p| p.get("name"))
        .and_then(Value::as_str)
        .unwrap_or("");
    let empty_args = json!({});
    let args = match params.and_then(|p| p.get("arguments")) {
        Some(Value::Null) | None => &empty_args,
        Some(val) => val,
    };
    if let Err(error) = validate_path_arguments(args, workspace) {
        return Some(json!({
            "jsonrpc": "2.0",
            "id": id,
            "result": {
                "content": [{ "type": "text", "text": error }],
                "isError": true
            }
        }));
    }
    if let Err(error) = validate_tool_arguments(name, args) {
        return Some(json!({
            "jsonrpc": "2.0",
            "id": id,
            "result": {
                "content": [{ "type": "text", "text": error }],
                "isError": true
            }
        }));
    }

    if !tools::is_tool_allowed_for_call(name, args) {
        return Some(json!({
            "jsonrpc": "2.0",
            "id": id,
            "result": {
                "content": [{ "type": "text", "text": format!("Tool '{name}' is outside the active GenOS MCP lease.") }],
                "isError": true
            }
        }));
    }

    let (code, text) = executor::handle_tool_call(name, args, workspace);
    Some(json!({
        "jsonrpc": "2.0",
        "id": id,
        "result": {
            "content": [{ "type": "text", "text": text }],
            "isError": code != 0
        }
    }))
}

fn handle_omega_execute(req: &Value, id: Option<Value>, workspace: &Path) -> Option<Value> {
    Some(json!({ "jsonrpc": "2.0", "id": id,
        "result": omega_dispatch::execute(req.get("params").unwrap_or(&Value::Null), workspace) }))
}

fn handle_ping(id: Option<Value>) -> Option<Value> {
    Some(json!({ "jsonrpc": "2.0", "id": id, "result": {} }))
}

fn handle_method_not_found(method: &str, id: Option<Value>) -> Option<Value> {
    Some(json!({
        "jsonrpc": "2.0",
        "id": id,
        "error": { "code": -32601, "message": format!("Method '{method}' not found") }
    }))
}

fn handle_parse_error(id: Option<Value>) -> Option<Value> {
    Some(json!({
        "jsonrpc": "2.0",
        "id": id,
        "error": { "code": -32700, "message": "Parse error" }
    }))
}

fn handle_invalid_request(id: Option<Value>) -> Option<Value> {
    Some(json!({
        "jsonrpc": "2.0",
        "id": id,
        "error": { "code": -32600, "message": "Invalid Request" }
    }))
}

fn should_skip_notification(method: &str, id: &Option<Value>) -> bool {
    id.is_none()
        || id.as_ref().map_or(false, Value::is_null)
        || method.starts_with("notifications/")
        || method.starts_with("$/")
}

fn process_request(line: &str, workspace: &Path) -> Option<Value> {
    let trimmed = line.trim().trim_start_matches('\u{feff}');
    if trimmed.is_empty() {
        return None;
    }
    let lower = trimmed.to_ascii_lowercase();
    if (lower.starts_with("content-length:") || lower.starts_with("content-type:"))
        && !trimmed.contains('{')
    {
        return None;
    }

    let candidate = extract_json_candidate(trimmed);
    let req: Value = match serde_json::from_str(candidate) {
        Ok(v) => v,
        Err(_) => return handle_parse_error(None),
    };

    let id = req.get("id").cloned();
    let method = match req.get("method").and_then(Value::as_str) {
        Some(method) => method,
        None => return handle_invalid_request(id),
    };

    if should_skip_notification(method, &id) {
        return None;
    }

    match method {
        "initialize" => handle_initialize(&req, id),
        "notifications/initialized" => None,
        "ping" => handle_ping(id),
        "omega/execute" => handle_omega_execute(&req, id, workspace),
        "tools/list" => handle_tools_list(id),
        "tools/call" => handle_tools_call(&req, id, workspace),
        _ => handle_method_not_found(method, id),
    }
}

fn main() {
    let workspace = env::var("GENOS_WORKSPACE_ROOT")
        .map(PathBuf::from)
        .or_else(|_| env::current_dir())
        .unwrap_or_else(|_| PathBuf::from("."));

    eprintln!(
        "🧬 GenOS MCP Server running on stdio (workspace: {})",
        workspace.display()
    );

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

#[cfg(test)]
mod tests {
    use super::{process_request, validation::validate_path_arguments, validation::validate_tool_arguments};
    use crate::executor::{MAX_OUTPUT_BYTES, read_bounded};
    use serde_json::json;
    use std::io::Cursor;
    use std::path::Path;

    #[test]
    fn read_bounded_keeps_only_the_configured_tail() {
        let input = vec![b'x'; MAX_OUTPUT_BYTES + 4096];
        let output = read_bounded(Cursor::new(input));
        assert_eq!(output.len(), MAX_OUTPUT_BYTES);
        assert!(output.iter().all(|byte| *byte == b'x'));
    }

    #[test]
    fn path_arguments_reject_traversal_and_absolute_paths() {
        let workspace = Path::new(".");
        assert!(validate_path_arguments(&json!({ "out": "../../outside.json" }), workspace).is_err());
        assert!(validate_path_arguments(&json!({ "agent": "/etc/passwd" }), workspace).is_err());
        assert!(validate_path_arguments(&json!({ "output": "C:/outside.log" }), workspace).is_err());
        assert!(validate_path_arguments(&json!({ "snapshot_id": "../outside.json" }), workspace).is_err());
        assert!(validate_path_arguments(&json!({ "branch_id": "/var/tmp" }), workspace).is_err());
        assert!(validate_path_arguments(&json!({ "parent_id": "..\\forbidden" }), workspace).is_err());
        assert!(validate_path_arguments(&json!({ "out": "reports/result.json" }), workspace).is_ok());
        assert!(validate_path_arguments(&serde_json::Value::Null, workspace).is_ok());
        assert!(validate_path_arguments(&json!({}), workspace).is_ok());
        assert!(validate_path_arguments(&json!([]), workspace).is_err());
        assert!(validate_path_arguments(&json!("reports/result.json"), workspace).is_err());
    }

    #[test]
    fn tool_arguments_reject_missing_required_values() {
        assert!(validate_tool_arguments("genos_snapshot", &json!({})).is_err());
        assert!(validate_tool_arguments("genos_replay", &json!({})).is_err());
        assert!(validate_tool_arguments("genos_snapshot", &json!({ "agent": "a", "out": "b" })).is_ok());
        assert!(validate_tool_arguments("genos_philosophy", &json!({})).is_err());
        assert!(validate_tool_arguments("genos_philosophy", &json!({ "operation": "listConcepts" })).is_ok());
        assert!(validate_tool_arguments("genos_philosophy", &json!({ "operation": "saveAnalysis" })).is_err());
        assert!(validate_tool_arguments("genos_philosophy", &json!({
            "operation": "applyRuntimeEffect",
            "arguments": { "apply": true }
        })).is_err());
    }

    #[test]
    fn process_request_handles_headers_and_preambles() {
        let root = Path::new(".");
        assert!(process_request("Content-Length: 120", root).is_none());
        assert!(process_request("Content-Type: application/json", root).is_none());
        assert!(process_request("  \r\n", root).is_none());
        let init = process_request(
            "\u{feff}{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\"}",
            root,
        );
        assert!(init.is_some());
        assert_eq!(init.unwrap()["id"], 1);
    }

    #[test]
    fn process_request_executes_omega_graphs_through_the_mcp_path() {
        let request = json!({
            "jsonrpc": "2.0", "id": 2, "method": "omega/execute",
            "params": { "envelope": {
                "schema": "genos.gcir.omega/v1", "version": 1, "id": "mcp-omega",
                "operations": [
                    { "id": "read", "kind": "READ", "reference": "repo", "dependsOn": [], "state": "open" },
                    { "id": "select", "kind": "SELECT", "reference": "slice", "dependsOn": ["read"], "state": "open" }
                ], "policy": { "read": ["repo"], "select": ["slice"] }
            }, "objects": { "repo": { "ok": true } } }
        });
        let response = process_request(&request.to_string(), Path::new(".")).expect("response");
        assert_eq!(response["result"]["status"], "emitted");
        assert_eq!(response["result"]["values"]["select"]["ok"], true);
    }
}

mod executor;
pub mod omega;
mod omega_dispatch;
pub mod omega_runtime;
mod tools;

use serde_json::{json, Value};
use std::env;
use std::io::{self, BufRead, Write};
use std::path::{Path, PathBuf};

const PATH_ARGUMENTS: &[&str] = &[
    "agent",
    "out",
    "output",
    "history_file",
    "input_file",
    "manifest",
    "graph_file",
    "snapshot",
    "snapshot_id",
    "branch_id",
    "parent_id",
];

fn validate_path_arguments(args: &Value, workspace: &Path) -> Result<(), String> {
    let object = match args {
        Value::Null => return Ok(()),
        Value::Object(map) => map,
        _ => return Err("Tool arguments must be a JSON object.".into()),
    };
    for key in PATH_ARGUMENTS {
        let Some(value) = object.get(*key).and_then(Value::as_str) else {
            continue;
        };
        let path = std::path::Path::new(value);
        let has_parent_segment = value.split(['/', '\\']).any(|segment| segment == "..");
        let is_absolute = path.is_absolute()
            || value.starts_with('/')
            || value.starts_with('\\')
            || value.as_bytes().get(1) == Some(&b':');
        if value.is_empty() || value.contains('\0') || is_absolute || has_parent_segment {
            return Err(format!("{key} must be a safe workspace-relative path."));
        }
        let root = workspace
            .canonicalize()
            .map_err(|_| format!("{key} must remain inside the GenOS workspace."))?;
        let mut probe = root.join(path);
        while !probe.exists() {
            if !probe.pop() {
                return Err(format!("{key} must remain inside the GenOS workspace."));
            }
        }
        let resolved = probe
            .canonicalize()
            .map_err(|_| format!("{key} must remain inside the GenOS workspace."))?;
        if !resolved.starts_with(&root) {
            return Err(format!("{key} must remain inside the GenOS workspace and avoid symlinks."));
        }
    }
    Ok(())
}

fn required_string(object: &serde_json::Map<String, Value>, field: &str) -> Result<(), String> {
    match object.get(field).and_then(Value::as_str).filter(|value| !value.trim().is_empty()) {
        Some(_) => Ok(()),
        None => Err(format!("{field} must be a non-empty string.")),
    }
}

fn validate_tool_arguments(name: &str, args: &Value) -> Result<(), String> {
    let object = match args {
        Value::Object(map) => map,
        _ => return Err("Tool arguments must be a JSON object.".into()),
    };
    let required: &[&str] = match name {
        "genos_orchestrate" | "genos_delegate_worker" => &["mission"],
        "genos_snapshot" => &["agent", "out"],
        "genos_capsule_create" => &["snapshot_id"],
        "genos_change_strategy" => &["strategy", "reason"],
        "genos_report_progress" => &["phase", "message"],
        "genos_change_organization" => &["organization", "reason"],
        "genos_worker_publish" => &["kind", "signal_type", "signal_data"],
        "genos_trinity_launch" => &["mission"],
        "genos_a_team_preview" => &["project_goal", "sub_systems"],
        "genos_merge" => &["branch_id"],
        "genos_audit" => &["snapshot_id"],
        "genos_biomimicry" => &["feature", "action"],
        "genos_biological_mode" => &["mode", "mission"],
        "genos_execute_primitive" => &["primitive_name"],
        "genos_philosophy" => &["operation"],
        _ => &[],
    };
    for field in required {
        required_string(object, field)?;
    }
    if name == "genos_replay" {
        let has_snapshot = object.get("snapshot").and_then(Value::as_str).is_some_and(|value| !value.trim().is_empty());
        let has_snapshot_id = object.get("snapshot_id").and_then(Value::as_str).is_some_and(|value| !value.trim().is_empty());
        if !has_snapshot && !has_snapshot_id {
            return Err("snapshot or snapshot_id must be provided.".into());
        }
    }
    if name == "genos_a_team_preview" && !object.get("sub_systems").is_some_and(Value::is_array) {
        return Err("sub_systems must be an array.".into());
    }
    if name == "genos_philosophy" {
        validate_philosophy_arguments(object)?;
    }
    Ok(())
}

fn validate_philosophy_arguments(
    object: &serde_json::Map<String, Value>,
) -> Result<(), String> {
    let operation = object
        .get("operation")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "operation must be a non-empty string.".to_string())?;
    if object.get("arguments").is_some_and(|value| !value.is_object()) {
        return Err("arguments must be an object.".into());
    }
    let applies_runtime_effect = object
        .get("arguments")
        .and_then(Value::as_object)
        .and_then(|args| args.get("apply"))
        .and_then(Value::as_bool)
        == Some(true);
    match (operation, applies_runtime_effect) {
        ("saveAnalysis", _) | ("applyRuntimeEffect", true) => {
            Err("genos_philosophy is read-only; runtime effects are preview-only.".into())
        }
        _ => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::{process_request, validate_path_arguments, validate_tool_arguments};
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
        Err(_) => {
            return Some(json!({
                "jsonrpc": "2.0",
                "id": null,
                "error": { "code": -32700, "message": "Parse error" }
            }));
        }
    };

    let id = req.get("id").cloned();
    let method = match req.get("method").and_then(Value::as_str) {
        Some(method) => method,
        None => {
            return Some(json!({
                "jsonrpc": "2.0",
                "id": id,
                "error": { "code": -32600, "message": "Invalid Request" }
            }));
        }
    };

    if id.is_none()
        || id.as_ref().map_or(false, Value::is_null)
        || method.starts_with("notifications/")
        || method.starts_with("$/")
    {
        return None;
    }

    match method {
        "initialize" => {
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
        "notifications/initialized" => None,
        "ping" => Some(json!({ "jsonrpc": "2.0", "id": id, "result": {} })),
        "omega/execute" => Some(json!({ "jsonrpc": "2.0", "id": id,
            "result": omega_dispatch::execute(req.get("params").unwrap_or(&Value::Null), workspace) })),
        "tools/list" => Some(json!({
            "jsonrpc": "2.0",
            "id": id,
            "result": { "tools": tools::public_tool_specs() }
        })),
        "tools/call" => {
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

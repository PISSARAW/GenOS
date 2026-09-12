mod executor;
mod tools;

use serde_json::{json, Value};
use std::env;
use std::io::{self, BufRead, Write};
use std::path::{Path, PathBuf};

const PATH_ARGUMENTS: &[&str] = &[
    "agent", "out", "output", "history_file", "input_file", "manifest",
    "graph_file", "snapshot", "snapshot_id", "branch_id", "parent_id",
];

fn validate_path_arguments(args: &Value) -> Result<(), String> {
    let object = match args {
        Value::Null => return Ok(()),
        Value::Object(map) => map,
        _ => return Err("Tool arguments must be a JSON object.".into()),
    };
    for key in PATH_ARGUMENTS {
        let Some(value) = object.get(*key).and_then(Value::as_str) else { continue; };
        let path = std::path::Path::new(value);
        let has_parent_segment = value.split(['/', '\\']).any(|segment| segment == "..");
        let is_absolute = path.is_absolute() || value.starts_with('/') || value.starts_with('\\') || value.as_bytes().get(1) == Some(&b':');
        if value.is_empty() || value.contains('\0') || is_absolute || has_parent_segment {
            return Err(format!("{key} must be a safe workspace-relative path."));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{process_request, validate_path_arguments};
    use crate::executor::{read_bounded, MAX_OUTPUT_BYTES};
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
        assert!(validate_path_arguments(&json!({ "out": "../../outside.json" })).is_err());
        assert!(validate_path_arguments(&json!({ "agent": "/etc/passwd" })).is_err());
        assert!(validate_path_arguments(&json!({ "output": "C:/outside.log" })).is_err());
        assert!(validate_path_arguments(&json!({ "snapshot_id": "../outside.json" })).is_err());
        assert!(validate_path_arguments(&json!({ "branch_id": "/var/tmp" })).is_err());
        assert!(validate_path_arguments(&json!({ "parent_id": "..\\forbidden" })).is_err());
        assert!(validate_path_arguments(&json!({ "out": "reports/result.json" })).is_ok());
        assert!(validate_path_arguments(&serde_json::Value::Null).is_ok());
        assert!(validate_path_arguments(&json!({})).is_ok());
    }

    #[test]
    fn process_request_handles_headers_and_preambles() {
        let root = Path::new(".");
        assert!(process_request("Content-Length: 120", root).is_none());
        assert!(process_request("Content-Type: application/json", root).is_none());
        assert!(process_request("  \r\n", root).is_none());
        let init = process_request("\u{feff}{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\"}", root);
        assert!(init.is_some());
        assert_eq!(init.unwrap()["id"], 1);
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
    if (lower.starts_with("content-length:") || lower.starts_with("content-type:")) && !trimmed.contains('{') {
        return None;
    }

    let candidate = extract_json_candidate(trimmed);
    let req: Value = match serde_json::from_str(candidate) {
        Ok(v) => v,
        Err(_) => return Some(json!({
            "jsonrpc": "2.0",
            "id": null,
            "error": { "code": -32700, "message": "Parse error" }
        })),
    };

    let id = req.get("id").cloned();
    let method = match req.get("method").and_then(Value::as_str) {
        Some(method) => method,
        None => return Some(json!({
            "jsonrpc": "2.0",
            "id": id,
            "error": { "code": -32600, "message": "Invalid Request" }
        }))
    };

    if id.is_none() || id.as_ref().map_or(false, Value::is_null) || method.starts_with("notifications/") || method.starts_with("$/") {
        return None;
    }

    match method {
        "initialize" => {
            let client_version = req.get("params")
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
        "tools/list" => Some(json!({
            "jsonrpc": "2.0",
            "id": id,
            "result": { "tools": tools::public_tool_specs() }
        })),
        "tools/call" => {
            let params = req.get("params");
            let name = params.and_then(|p| p.get("name")).and_then(Value::as_str).unwrap_or("");
            let empty_args = json!({});
            let args = match params.and_then(|p| p.get("arguments")) {
                Some(Value::Null) | None => &empty_args,
                Some(val) => val,
            };
            if let Err(error) = validate_path_arguments(args) {
                return Some(json!({
                    "jsonrpc": "2.0",
                    "id": id,
                    "result": {
                        "content": [{ "type": "text", "text": error }],
                        "isError": true
                    }
                }));
            }

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

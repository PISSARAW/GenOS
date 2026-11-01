use super::execute_command;
use serde_json::{Value, json};
use std::path::Path;
use std::process::Command;

pub(crate) const UNAVAILABLE_TOOLS: &[&str] = &[
    "genos_browser_act",
    "genos_computer_use",
    "genos_foveal_crop",
    "genos_optimal_foraging",
];

pub(crate) fn is_bridged_tool(name: &str) -> bool {
    !UNAVAILABLE_TOOLS.contains(&name) && crate::tools::is_backend_routed_tool(name)
}

fn reject_failed_backend_result(result: (i32, String)) -> (i32, String) {
    if result.0 != 0 {
        return result;
    }
    if result.1.trim().is_empty() {
        return (-1, "Backend returned an empty result.".into());
    }
    if let Ok(value) = serde_json::from_str::<Value>(&result.1) {
        if value.get("success").and_then(Value::as_bool) == Some(false)
            || value.get("status").and_then(Value::as_str) == Some("error")
        {
            return (-1, result.1);
        }
    }
    result
}

pub(super) fn execute(workspace: &Path, name: &str, args: &Value) -> (i32, String) {
    if !is_bridged_tool(name) {
        return (-1, format!("Unsupported MCP tool: {name}"));
    }
    let dispatcher = workspace.join("backend/bin/genos-mcp-dispatch.cjs");
    if !dispatcher.is_file() {
        return (-1, "GenOS backend MCP dispatcher is unavailable.".into());
    }
    let request = json!({ "name": name, "arguments": args }).to_string();
    let mut command = Command::new("node");
    command
        .arg(dispatcher)
        .arg(request)
        .current_dir(workspace)
        .env("GENOS_WORKSPACE_ROOT", workspace);
    let result = execute_command(command).unwrap_or_else(|error| {
        (
            -1,
            format!("Failed to invoke backend MCP dispatcher: {error}"),
        )
    });
    reject_failed_backend_result(result)
}

#[cfg(test)]
mod tests {
    use super::{UNAVAILABLE_TOOLS, execute, is_bridged_tool, reject_failed_backend_result};
    use serde_json::json;
    use std::path::Path;

    #[test]
    fn explicit_backend_failure_cannot_be_successful_transport() {
        let failed = reject_failed_backend_result((
            0,
            json!({"success": false, "status": "refused"}).to_string(),
        ));
        assert_ne!(failed.0, 0);
        let succeeded = reject_failed_backend_result((
            0,
            json!({"success": true, "status": "completed"}).to_string(),
        ));
        assert_eq!(succeeded.0, 0);
        assert_eq!(
            reject_failed_backend_result((1, "backend failed".into())).0,
            1
        );
        let empty = reject_failed_backend_result((0, "   ".into()));
        assert_ne!(empty.0, 0);
        let error_status = reject_failed_backend_result((
            0,
            json!({"status": "error", "message": "crash"}).to_string(),
        ));
        assert_ne!(error_status.0, 0);
        assert!(is_bridged_tool("genos_agent_fork_snapshot"));
        assert!(is_bridged_tool("genos_agent_inherited_memory_read"));
        assert!(is_bridged_tool("genos_agent_state_restore_inspect"));
        assert!(is_bridged_tool("genos_working_memory"));
        assert!(is_bridged_tool("genos_teaching_worker"));
    }

    #[test]
    fn tools_without_backend_route_fail_closed() {
        for name in UNAVAILABLE_TOOLS {
            assert!(!is_bridged_tool(name));
            let (code, output) = execute(Path::new("."), name, &json!({}));
            assert_ne!(code, 0);
            assert_eq!(output, format!("Unsupported MCP tool: {name}"));
        }
    }
}

use super::execute_command;
use serde_json::{Value, json};
use std::path::Path;
use std::process::Command;

const BRIDGED_TOOLS: &[&str] = &[
    "genos_execute_strategy_pipeline",
    "genos_fossil_record",
    "genos_fossil_list",
    "genos_fossil_strata",
    "genos_fossil_excavate",
    "genos_fossil_decode",
    "genos_fossil_candidate",
    "genos_topology_session",
    "genos_signal_publish",
    "genos_signal_read",
    "genos_signal_purge",
    "genos_signal_ground",
    "genos_signal_electrocyte_vote",
    "genos_signal_chemotactic_follow",
    "genos_signal_plasmid_transfer",
    "genos_signal_collective_decision",
    "genos_agent_fork_snapshot",
    "genos_search_failures",
    "genos_diagnose",
    "genos_analyze_trajectory",
    "genos_record_decision",
    "genos_record_experience",
    "genos_compile_memory",
    "genos_blame",
];

pub(crate) fn is_bridged_tool(name: &str) -> bool {
    BRIDGED_TOOLS.contains(&name)
}

fn reject_failed_backend_result(result: (i32, String)) -> (i32, String) {
    if result.0 != 0 {
        return result;
    }
    let failed = serde_json::from_str::<Value>(&result.1)
        .ok()
        .and_then(|value| value.get("success").and_then(Value::as_bool))
        == Some(false);
    if failed { (-1, result.1) } else { result }
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
    use super::{execute, is_bridged_tool, reject_failed_backend_result};
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
        assert!(is_bridged_tool("genos_agent_fork_snapshot"));
    }

    #[test]
    fn tools_without_backend_route_fail_closed() {
        for name in [
            "genos_browser_act",
            "genos_computer_use",
            "genos_foveal_crop",
            "genos_optimal_foraging",
        ] {
            assert!(!is_bridged_tool(name));
            let (code, output) = execute(Path::new("."), name, &json!({}));
            assert_ne!(code, 0);
            assert_eq!(output, format!("Unsupported MCP tool: {name}"));
        }
    }
}

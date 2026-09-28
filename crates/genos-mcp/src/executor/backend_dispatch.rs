use super::execute_command;
use serde_json::{json, Value};
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
];

pub(super) fn execute(workspace: &Path, name: &str, args: &Value) -> (i32, String) {
    if !BRIDGED_TOOLS.contains(&name) {
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
    execute_command(command).unwrap_or_else(|error| {
        (
            -1,
            format!("Failed to invoke backend MCP dispatcher: {error}"),
        )
    })
}

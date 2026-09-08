use crate::args::ReplaySubcommands;
use serde_json::{json, Value};
use std::fs;
use std::path::Path;

pub fn execute(cmd: ReplaySubcommands) -> Result<(), String> {
    match cmd {
        ReplaySubcommands::Basic { snapshot } => handle_basic(&snapshot),
    }
}

fn handle_basic(snapshot: &str) -> Result<(), String> {
    let path = Path::new(snapshot);
    if !path.exists() {
        return Err(format!("Snapshot file not found: {}", snapshot));
    }

    let content = fs::read_to_string(path)
        .map_err(|error| format!("Failed to read snapshot file '{}': {}", snapshot, error))?;
    let value: Value = serde_json::from_str(&content)
        .map_err(|error| format!("Invalid JSON format in '{}': {}", snapshot, error))?;

    for field in ["snapshot_id", "agent_id", "branch_id", "world_id"] {
        if value.get(field).and_then(Value::as_str).is_none() {
            return Err(format!("Snapshot is missing required string field '{}'", field));
        }
    }

    let state = value.get("state")
        .ok_or_else(|| "Snapshot is missing required field 'state'".to_string())?;
    let replayed_steps = state.get("working_memory")
        .and_then(Value::as_array)
        .map_or(1, |steps| steps.len().max(1));

    println!("{}", serde_json::to_string_pretty(&json!({
        "success": true,
        "operation": "replay_basic",
        "snapshot": snapshot,
        "snapshot_id": value["snapshot_id"],
        "agent_id": value["agent_id"],
        "branch_id": value["branch_id"],
        "world_id": value["world_id"],
        "replayed_steps": replayed_steps,
        "replay_status": "RECONSTRUCTED",
        "execution_replayed": false,
        "verification": "snapshot structure and working-memory step count only"
    })).map_err(|error| error.to_string())?);
    Ok(())
}

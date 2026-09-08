use crate::args::ReplaySubcommands;
use crate::commands::replay_chain;
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
    let snapshot_id = value["snapshot_id"].as_str().unwrap();
    let agent_id = value["agent_id"].as_str().unwrap();
    let branch_id = value["branch_id"].as_str().unwrap();
    let world_id = value["world_id"].as_str().unwrap();

    let state = value.get("state")
        .ok_or_else(|| "Snapshot is missing required field 'state'".to_string())?;
    let working_memory = state.get("working_memory")
        .and_then(Value::as_array)
        .ok_or_else(|| "Snapshot state.working_memory must be an array".to_string())?;

    // Re-derive the causal chain from identity fields and every recorded step,
    // then compare it to what the snapshot claims. Any mismatch means the
    // trace was tampered with or never actually executed as recorded.
    let expected_genesis = replay_chain::genesis_hash(snapshot_id, agent_id, branch_id, world_id);
    if let Some(recorded_genesis) = state.get("genesis_hash").and_then(Value::as_str) {
        if recorded_genesis != expected_genesis {
            return Err(format!(
                "Replay failed: genesis hash mismatch (recorded '{}', recomputed '{}')",
                recorded_genesis, expected_genesis
            ));
        }
    }

    let mut prev_hash = expected_genesis.clone();
    let mut replayed_entropy = 0.0_f64;
    let mut replayed_dissonance = 0.0_f64;
    let mut verified_steps = Vec::new();

    for (index, entry) in working_memory.iter().enumerate() {
        let step_index = (index as u64) + 1;
        let action = entry.get("action").and_then(Value::as_str)
            .ok_or_else(|| format!("Step {} is missing required string field 'action'", step_index))?;
        let delta_entropy = entry.get("delta_entropy").and_then(Value::as_f64).unwrap_or(0.0);
        let delta_dissonance = entry.get("delta_dissonance").and_then(Value::as_f64).unwrap_or(0.0);
        let payload = entry.get("payload").cloned().unwrap_or(json!({}));
        let recorded_step_hash = entry.get("step_hash").and_then(Value::as_str)
            .ok_or_else(|| format!("Step {} is missing required field 'step_hash'", step_index))?;

        let recomputed = replay_chain::step_hash(&prev_hash, step_index, action, delta_entropy, delta_dissonance, &payload);
        if recomputed != recorded_step_hash {
            return Err(format!(
                "Replay failed: hash-chain broken at step {} (recorded '{}', recomputed '{}')",
                step_index, recorded_step_hash, recomputed
            ));
        }

        replayed_entropy += delta_entropy;
        replayed_dissonance += delta_dissonance;
        prev_hash = recomputed;
        verified_steps.push(json!({ "step": step_index, "action": action, "step_hash": prev_hash }));
    }

    println!("{}", serde_json::to_string_pretty(&json!({
        "success": true,
        "operation": "replay_basic",
        "snapshot": snapshot,
        "snapshot_id": value["snapshot_id"],
        "agent_id": value["agent_id"],
        "branch_id": value["branch_id"],
        "world_id": value["world_id"],
        "replayed_steps": working_memory.len(),
        "replay_status": "VERIFIED",
        "execution_replayed": true,
        "verification": "recomputed genesis + hash-chained working-memory trace from snapshot identity; all steps matched their recorded hashes",
        "genesis_hash": expected_genesis,
        "final_chain_hash": prev_hash,
        "replayed_entropy_delta": replayed_entropy,
        "replayed_dissonance_delta": replayed_dissonance,
        "verified_steps": verified_steps
    })).map_err(|error| error.to_string())?);
    Ok(())
}

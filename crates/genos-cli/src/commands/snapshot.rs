use std::fs;
use chrono::Utc;
use serde_json::{json, Value};
use uuid::Uuid;
use crate::args::SnapshotSubcommands;
use crate::commands::replay_chain;
use super::output_guard::WriteOptions;
use super::output_guard::write_output_file;
use super::snapshot_genome::load_or_create_genome;
use super::snapshot_record::RecordRequest;
use super::snapshot_record::handle_record_step;
use super::snapshot_validate::handle_validate;

pub fn execute(cmd: SnapshotSubcommands) -> Result<(), String> {
    match cmd {
        SnapshotSubcommands::Create { agent, out, force, parents } => {
            let opts = WriteOptions { force, parents };
            handle_create(&agent, &out, &opts)
        }
        SnapshotSubcommands::Validate { file } => handle_validate(&file),
        SnapshotSubcommands::List => handle_list(),
        SnapshotSubcommands::RecordStep { snapshot, action, delta_entropy, delta_dissonance, payload } => {
            let req = RecordRequest { snapshot: &snapshot, action: &action, delta_entropy, delta_dissonance, payload: payload.as_deref() };
            handle_record_step(&req)
        }
    }
}

pub fn handle_diff(path_a: &str, path_b: &str) -> Result<(), String> {
    let content_a = fs::read_to_string(path_a).map_err(|e| format!("Impossible de lire '{}': {}", path_a, e))?;
    let content_b = fs::read_to_string(path_b).map_err(|e| format!("Impossible de lire '{}': {}", path_b, e))?;

    let json_a: Value = serde_json::from_str(&content_a).unwrap_or(json!({ "raw": content_a }));
    let json_b: Value = serde_json::from_str(&content_b).unwrap_or(json!({ "raw": content_b }));

    let mut differences = Vec::new();
    if json_a != json_b {
        if json_a["agent_id"] != json_b["agent_id"] {
            differences.push(json!({ "field": "agent_id", "a": json_a["agent_id"], "b": json_b["agent_id"] }));
        }
        if json_a["branch_id"] != json_b["branch_id"] {
            differences.push(json!({ "field": "branch_id", "a": json_a["branch_id"], "b": json_b["branch_id"] }));
        }
        if json_a["state"] != json_b["state"] {
            differences.push(json!({ "field": "state", "changed": true }));
        }
    }

    let result = json!({
        "identical": json_a == json_b,
        "path_a": path_a,
        "path_b": path_b,
        "divergences_count": differences.len(),
        "differences": differences
    });

    println!("{}", serde_json::to_string_pretty(&result).unwrap());
    Ok(())
}

fn build_snapshot_payload(agent_path: &str) -> Value {
    let (agent_id, genome) = load_or_create_genome(agent_path);
    let snapshot_id = format!("snap-{}", Uuid::new_v4().simple());
    let branch_id = format!("branch-{}", &snapshot_id[5..13]);
    let created_at = Utc::now().to_rfc3339();
    let world_id = "world-matrix-0";
    let genesis_hash = replay_chain::genesis_hash(&snapshot_id, &agent_id, &branch_id, world_id);
    json!({
        "snapshot_id": snapshot_id,
        "agent_id": agent_id,
        "branch_id": branch_id,
        "world_id": world_id,
        "created_at": created_at,
        "genome": genome,
        "state": {
            "execution_status": "quiescent",
            "working_memory": [],
            "entropy": 0.42,
            "dissonance": 0.0,
            "genesis_hash": genesis_hash
        }
    })
}

fn print_create_output(payload: &Value, out: &str) -> Result<(), String> {
    println!("{}", json!({
        "success": true,
        "operation": "snapshot_create",
        "snapshot_id": payload["snapshot_id"],
        "agent_id": payload["agent_id"],
        "branch_id": payload["branch_id"],
        "file": out
    }));
    Ok(())
}

fn handle_create(agent_path: &str, out: &str, opts: &WriteOptions) -> Result<(), String> {
    let payload = build_snapshot_payload(agent_path);
    let text = match serde_json::to_string_pretty(&payload) {
        Ok(valid) => valid,
        Err(error) => return Err(error.to_string()),
    };
    match write_output_file(out, &text, opts) {
        Ok(()) => print_create_output(&payload, out),
        Err(reason) => Err(reason),
    }
}

fn handle_list() -> Result<(), String> {
    let mut snapshots = Vec::new();
    if let Ok(entries) = fs::read_dir("snapshots") {
        for entry in entries.flatten() {
            if entry.path().extension().is_some_and(|ext| ext == "json") {
                snapshots.push(entry.file_name().to_string_lossy().to_string());
            }
        }
    }

    let output = json!({
        "count": snapshots.len(),
        "snapshots": snapshots
    });

    println!("{}", serde_json::to_string_pretty(&output).unwrap());
    Ok(())
}

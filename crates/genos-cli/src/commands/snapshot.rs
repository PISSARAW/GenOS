use std::fs;
use std::path::Path;
use chrono::Utc;
use serde_json::{json, Value};
use uuid::Uuid;
use genos_cell::AgentCell;
use crate::args::SnapshotSubcommands;

pub fn execute(cmd: SnapshotSubcommands) -> Result<(), String> {
    match cmd {
        SnapshotSubcommands::Create { agent, out } => handle_create(&agent, &out),
        SnapshotSubcommands::List => handle_list(),
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

fn handle_create(agent_path: &str, out: &str) -> Result<(), String> {
    let (agent_id, genome) = load_or_create_genome(agent_path);

    let snapshot_id = format!("snap-{}", Uuid::new_v4().simple());
    let branch_id = format!("branch-{}", &snapshot_id[5..13]);
    let created_at = Utc::now().to_rfc3339();

    let snapshot_payload = json!({
        "snapshot_id": snapshot_id,
        "agent_id": agent_id,
        "branch_id": branch_id,
        "world_id": "world-matrix-0",
        "created_at": created_at,
        "genome": genome,
        "state": {
            "execution_status": "quiescent",
            "working_memory": [],
            "entropy": 0.42,
            "dissonance": 0.0
        }
    });

    let out_path = Path::new(out);
    if let Some(parent) = out_path.parent() {
        let _ = fs::create_dir_all(parent);
    }

    let json_str = serde_json::to_string_pretty(&snapshot_payload).map_err(|e| e.to_string())?;
    fs::write(out_path, json_str).map_err(|e| e.to_string())?;

    println!("{}", json!({
        "success": true,
        "operation": "snapshot_create",
        "snapshot_id": snapshot_payload["snapshot_id"],
        "agent_id": snapshot_payload["agent_id"],
        "branch_id": snapshot_payload["branch_id"],
        "file": out
    }));
    Ok(())
}

fn load_or_create_genome(agent_path: &str) -> (String, Value) {
    if let Ok(content) = fs::read_to_string(agent_path) {
        if agent_path.ends_with(".yaml") || agent_path.ends_with(".yml") {
            if let Ok(val) = serde_yaml::from_str::<Value>(&content) {
                let id = val.get("cell_id").and_then(|v| v.as_str()).unwrap_or("agent-default").to_string();
                return (id, val);
            }
        } else if let Ok(val) = serde_json::from_str::<Value>(&content) {
            let id = val.get("cell_id").and_then(|v| v.as_str()).unwrap_or("agent-default").to_string();
            return (id, val);
        }
    }

    let cell = AgentCell::default();
    let val = serde_json::to_value(&cell).unwrap_or(json!({ "name": "Griot" }));
    (cell.cell_id.to_string(), val)
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

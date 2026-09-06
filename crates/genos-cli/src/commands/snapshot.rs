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
        SnapshotSubcommands::Validate { file } => handle_validate(&file),
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

fn normalize_to_agent_genome(val: Value) -> Value {
    if val.get("kind").and_then(|k| k.as_str()) == Some("AgentGenome") && val.get("apiVersion").is_some() {
        return val;
    }
    let name = val.get("name").and_then(|v| v.as_str()).unwrap_or("Griot").to_string();
    let role = val.get("role").and_then(|v| v.as_str()).unwrap_or("Autonomous Node").to_string();
    let meaning = val.get("name_meaning").and_then(|v| v.as_str()).unwrap_or("Agent autonome résilient de l'écosystème GenOS").to_string();
    let cell_id = val.get("cell_id")
        .or_else(|| val.get("identity").and_then(|i| i.get("cell_id")))
        .and_then(|v| v.as_str())
        .unwrap_or("agent-default")
        .to_string();

    json!({
        "apiVersion": "v0alpha1",
        "kind": "AgentGenome",
        "metadata": {
            "name": name,
            "version": "0.1.0"
        },
        "identity": {
            "role": role,
            "name": name,
            "name_meaning": meaning,
            "cell_id": cell_id
        },
        "cognition": val.get("cognition").cloned().unwrap_or_else(|| json!({
            "conscience": val.get("conscience").cloned().unwrap_or_else(|| json!({})),
            "organelles": val.get("organelles").cloned().unwrap_or_else(|| json!([]))
        })),
        "objectives": val.get("objectives").cloned().unwrap_or_else(|| json!({
            "primary": role,
            "operational_mode": "autonomous"
        })),
        "policies": val.get("policies").cloned().unwrap_or_else(|| json!({
            "hayflick_limit": val.get("hayflick_limit").cloned().unwrap_or(json!(50)),
            "is_senescent": val.get("is_senescent").cloned().unwrap_or(json!(false))
        })),
        "capabilities": val.get("capabilities").cloned().unwrap_or_else(|| json!(["inspect", "reason", "mutate"])),
        "memory_policy": val.get("memory_policy").cloned().unwrap_or_else(|| json!({
            "ltd_decay": true,
            "consolidation": true
        })),
        "model_policy": val.get("model_policy").cloned().unwrap_or_else(|| json!({
            "preferred": "default"
        })),
        "tool_policy": val.get("tool_policy").cloned().unwrap_or_else(|| json!({
            "allowed_tools": ["genos_inspect"]
        })),
        "cell_id": cell_id,
        "name": name,
        "role": role,
        "conscience": val.get("conscience").cloned().unwrap_or_else(|| json!({}))
    })
}

fn load_or_create_genome(agent_path: &str) -> (String, Value) {
    if let Ok(content) = fs::read_to_string(agent_path) {
        if agent_path.ends_with(".yaml") || agent_path.ends_with(".yml") {
            if let Ok(val) = serde_yaml::from_str::<Value>(&content) {
                let id = val.get("cell_id")
                    .or_else(|| val.get("identity").and_then(|i| i.get("cell_id")))
                    .and_then(|v| v.as_str())
                    .unwrap_or("agent-default")
                    .to_string();
                return (id, normalize_to_agent_genome(val));
            }
        } else if let Ok(val) = serde_json::from_str::<Value>(&content) {
            let id = val.get("cell_id")
                .or_else(|| val.get("identity").and_then(|i| i.get("cell_id")))
                .and_then(|v| v.as_str())
                .unwrap_or("agent-default")
                .to_string();
            return (id, normalize_to_agent_genome(val));
        }
    }

    let cell = AgentCell::default();
    let id = cell.cell_id.to_string();
    let val = serde_json::to_value(&cell).unwrap_or(json!({ "name": "Griot" }));
    (id, normalize_to_agent_genome(val))
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

fn handle_validate(file_path: &str) -> Result<(), String> {
    let path = Path::new(file_path);
    if !path.exists() {
        return Err(format!("Snapshot file not found: {}", file_path));
    }

    let content = fs::read_to_string(path)
        .map_err(|e| format!("Failed to read snapshot file '{}': {}", file_path, e))?;

    let val: Value = serde_json::from_str(&content)
        .map_err(|e| format!("Invalid JSON format in '{}': {}", file_path, e))?;

    let mut errors = Vec::new();

    for field in ["snapshot_id", "agent_id", "branch_id", "world_id", "created_at"] {
        if val.get(field).and_then(|v| v.as_str()).is_none() {
            errors.push(format!("Missing required string field '{}'", field));
        }
    }

    if let Some(genome) = val.get("genome") {
        if !genome.is_object() {
            errors.push("Field 'genome' must be an object".to_string());
        } else if genome.get("apiVersion").is_none() || genome.get("kind").and_then(|k| k.as_str()) != Some("AgentGenome") {
            errors.push("Embedded 'genome' must conform to AgentGenome specification".to_string());
        }
    } else {
        errors.push("Missing required field 'genome'".to_string());
    }

    if let Some(state) = val.get("state") {
        if !state.is_object() {
            errors.push("Field 'state' must be an object".to_string());
        }
    } else {
        errors.push("Missing required field 'state'".to_string());
    }

    if !errors.is_empty() {
        let output = json!({
            "success": false,
            "operation": "snapshot_validate",
            "file": file_path,
            "schema": "snapshot.schema.json",
            "status": "INVALID",
            "errors": errors
        });
        println!("{}", serde_json::to_string_pretty(&output).unwrap());
        return Err(format!("Snapshot validation failed: {}", errors.join(", ")));
    }

    let output = json!({
        "success": true,
        "operation": "snapshot_validate",
        "file": file_path,
        "schema": "snapshot.schema.json",
        "status": "VALID",
        "snapshot_id": val.get("snapshot_id").and_then(|v| v.as_str()),
        "agent_id": val.get("agent_id").and_then(|v| v.as_str()),
        "branch_id": val.get("branch_id").and_then(|v| v.as_str())
    });

    println!("{}", serde_json::to_string_pretty(&output).unwrap());
    Ok(())
}

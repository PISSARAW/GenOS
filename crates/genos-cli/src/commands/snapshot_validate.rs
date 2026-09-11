use std::fs;
use std::path::Path;
use serde_json::Value;
use serde_json::json;

fn push_missing_strings(errors: &mut Vec<String>, val: &Value) {
    for field in ["snapshot_id", "agent_id", "branch_id", "world_id", "created_at"] {
        if val.get(field).and_then(|item| item.as_str()).is_none() {
            errors.push(format!("Missing required string field '{}'", field));
        }
    }
}

fn kind_is_genome(genome: &Value) -> bool {
    match genome.get("kind").and_then(|item| item.as_str()) {
        Some(kind) => kind == "AgentGenome",
        None => false,
    }
}

fn genome_conforms(genome: &Value) -> bool {
    match genome.get("apiVersion") {
        Some(_) => kind_is_genome(genome),
        None => false,
    }
}

fn assess_genome_spec(errors: &mut Vec<String>, genome: &Value) {
    match genome_conforms(genome) {
        true => (),
        false => errors.push("Embedded 'genome' must conform to AgentGenome specification".to_string()),
    }
}

fn assess_genome(errors: &mut Vec<String>, genome: &Value) {
    if genome.is_object() {
        assess_genome_spec(errors, genome);
        return;
    }
    errors.push("Field 'genome' must be an object".to_string());
}

fn push_genome_errors(errors: &mut Vec<String>, val: &Value) {
    match val.get("genome") {
        Some(genome) => assess_genome(errors, genome),
        None => errors.push("Missing required field 'genome'".to_string()),
    }
}

fn assess_state(errors: &mut Vec<String>, state: &Value) {
    if state.is_object() {
        return;
    }
    errors.push("Field 'state' must be an object".to_string());
}

fn push_state_errors(errors: &mut Vec<String>, val: &Value) {
    match val.get("state") {
        Some(state) => assess_state(errors, state),
        None => errors.push("Missing required field 'state'".to_string()),
    }
}

fn collect_errors(val: &Value) -> Vec<String> {
    let mut errors = Vec::new();
    push_missing_strings(&mut errors, val);
    push_genome_errors(&mut errors, val);
    push_state_errors(&mut errors, val);
    errors
}

fn print_valid(file_path: &str, val: &Value) -> Result<(), String> {
    let output = json!({
        "success": true,
        "operation": "snapshot_validate",
        "file": file_path,
        "schema": "snapshot.schema.json",
        "status": "VALID",
        "snapshot_id": val.get("snapshot_id").and_then(|item| item.as_str()),
        "agent_id": val.get("agent_id").and_then(|item| item.as_str()),
        "branch_id": val.get("branch_id").and_then(|item| item.as_str())
    });
    println!("{}", serde_json::to_string_pretty(&output).unwrap_or_default());
    Ok(())
}

fn print_invalid(file_path: &str, errors: &[String]) -> Result<(), String> {
    let output = json!({
        "success": false,
        "operation": "snapshot_validate",
        "file": file_path,
        "schema": "snapshot.schema.json",
        "status": "INVALID",
        "errors": errors
    });
    println!("{}", serde_json::to_string_pretty(&output).unwrap_or_default());
    Err(format!("Snapshot validation failed: {}", errors.join(", ")))
}

fn report_validation(file_path: &str, val: &Value) -> Result<(), String> {
    let errors = collect_errors(val);
    match errors.is_empty() {
        true => print_valid(file_path, val),
        false => print_invalid(file_path, &errors),
    }
}

fn validate_present(file_path: &str) -> Result<(), String> {
    let content = match fs::read_to_string(Path::new(file_path)) {
        Ok(valid) => valid,
        Err(error) => return Err(format!("Failed to read snapshot file '{}': {}", file_path, error)),
    };
    let val: Value = match serde_json::from_str(&content) {
        Ok(valid) => valid,
        Err(error) => return Err(format!("Invalid JSON format in '{}': {}", file_path, error)),
    };
    report_validation(file_path, &val)
}

pub fn handle_validate(file_path: &str) -> Result<(), String> {
    if Path::new(file_path).exists() {
        return validate_present(file_path);
    }
    Err(format!("Snapshot file not found: {}", file_path))
}

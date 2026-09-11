use std::fs;
use std::path::Path;
use serde_json::Value;
use serde_json::json;
use crate::commands::replay_chain;

pub struct RecordRequest<'a> {
    pub snapshot: &'a str,
    pub action: &'a str,
    pub delta_entropy: f64,
    pub delta_dissonance: f64,
    pub payload: Option<&'a str>,
}

struct StepReport {
    step: u64,
    hash: String,
    entropy: f64,
    dissonance: f64,
}

fn parse_payload(raw: Option<&str>) -> Result<Value, String> {
    match raw {
        Some(text) => match serde_json::from_str(text) {
            Ok(valid) => Ok(valid),
            Err(error) => Err(format!("Invalid --payload JSON: {}", error)),
        },
        None => Ok(json!({})),
    }
}

fn read_snapshot(req: &RecordRequest) -> Result<Value, String> {
    let content = match fs::read_to_string(Path::new(req.snapshot)) {
        Ok(valid) => valid,
        Err(error) => return Err(format!("Failed to read snapshot file '{}': {}", req.snapshot, error)),
    };
    match serde_json::from_str(&content) {
        Ok(valid) => Ok(valid),
        Err(error) => Err(format!("Invalid JSON format in '{}': {}", req.snapshot, error)),
    }
}

fn str_copy(value: &Value, key: &str) -> String {
    match value.get(key).and_then(Value::as_str) {
        Some(valid) => valid.to_string(),
        None => String::new(),
    }
}

fn num_field(state: &Value, key: &str) -> f64 {
    match state.get(key).and_then(Value::as_f64) {
        Some(valid) => valid,
        None => 0.0,
    }
}

fn previous_hash(memory: &[Value], genesis: &str) -> String {
    match memory.last().and_then(|last| last.get("step_hash")).and_then(Value::as_str) {
        Some(valid) => valid.to_string(),
        None => genesis.to_string(),
    }
}

fn state_mut(value: &mut Value) -> Result<&mut Value, String> {
    match value.get_mut("state") {
        Some(valid) => Ok(valid),
        None => Err("Snapshot is missing required field 'state'".to_string()),
    }
}

fn push_step(value: &mut Value, req: &RecordRequest, payload: &Value) -> Result<(u64, String), String> {
    let genesis = replay_chain::genesis_hash(&str_copy(value, "snapshot_id"), &str_copy(value, "agent_id"), &str_copy(value, "branch_id"), &str_copy(value, "world_id"));
    let state = match state_mut(value) {
        Ok(valid) => valid,
        Err(reason) => return Err(reason),
    };
    let memory = match state.get_mut("working_memory").and_then(Value::as_array_mut) {
        Some(valid) => valid,
        None => return Err("Snapshot state.working_memory must be an array".to_string()),
    };
    let prev = previous_hash(memory, &genesis);
    let step = memory.len() as u64 + 1;
    let hash = replay_chain::step_hash(&prev, step, req.action, req.delta_entropy, req.delta_dissonance, payload);
    memory.push(json!({
        "step": step,
        "action": req.action,
        "delta_entropy": req.delta_entropy,
        "delta_dissonance": req.delta_dissonance,
        "payload": payload,
        "prev_hash": prev,
        "step_hash": hash
    }));
    Ok((step, hash))
}

fn finalize_state(value: &mut Value, req: &RecordRequest, pushed: (u64, String)) -> Result<StepReport, String> {
    let state = match state_mut(value) {
        Ok(valid) => valid,
        Err(reason) => return Err(reason),
    };
    let entropy = num_field(state, "entropy") + req.delta_entropy;
    let dissonance = num_field(state, "dissonance") + req.delta_dissonance;
    state["entropy"] = json!(entropy);
    state["dissonance"] = json!(dissonance);
    Ok(StepReport { step: pushed.0, hash: pushed.1, entropy, dissonance })
}

fn append_step(value: &mut Value, req: &RecordRequest) -> Result<StepReport, String> {
    let payload = match parse_payload(req.payload) {
        Ok(valid) => valid,
        Err(reason) => return Err(reason),
    };
    let pushed = match push_step(value, req, &payload) {
        Ok(valid) => valid,
        Err(reason) => return Err(reason),
    };
    match finalize_state(value, req, pushed) {
        Ok(report) => Ok(report),
        Err(reason) => Err(reason),
    }
}

fn print_step(snapshot: &str, report: &StepReport) -> Result<(), String> {
    let text = match serde_json::to_string_pretty(&json!({
        "success": true,
        "operation": "snapshot_record_step",
        "snapshot": snapshot,
        "step": report.step,
        "step_hash": report.hash,
        "entropy": report.entropy,
        "dissonance": report.dissonance
    })) {
        Ok(valid) => valid,
        Err(error) => return Err(error.to_string()),
    };
    println!("{}", text);
    Ok(())
}

pub fn handle_record_step(req: &RecordRequest) -> Result<(), String> {
    let mut value = match read_snapshot(req) {
        Ok(valid) => valid,
        Err(reason) => return Err(reason),
    };
    let report = match append_step(&mut value, req) {
        Ok(valid) => valid,
        Err(reason) => return Err(reason),
    };
    let text = match serde_json::to_string_pretty(&value) {
        Ok(valid) => valid,
        Err(error) => return Err(error.to_string()),
    };
    match fs::write(Path::new(req.snapshot), text) {
        Ok(()) => print_step(req.snapshot, &report),
        Err(error) => Err(error.to_string()),
    }
}

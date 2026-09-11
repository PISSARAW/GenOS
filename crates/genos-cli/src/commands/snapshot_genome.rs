use serde_json::Value;
use serde_json::json;
use genos_cell::AgentCell;

fn text_field(val: &Value, key: &str, fallback: &str) -> String {
    match val.get(key).and_then(|item| item.as_str()) {
        Some(valid) => valid.to_string(),
        None => fallback.to_string(),
    }
}

fn identity_cell_ref(val: &Value) -> String {
    match val.get("identity").and_then(|item| item.as_object()) {
        Some(identity) => match identity.get("cell_id").and_then(|item| item.as_str()) {
            Some(valid) => valid.to_string(),
            None => "agent-default".to_string(),
        },
        None => "agent-default".to_string(),
    }
}

fn cell_ref(val: &Value) -> String {
    match val.get("cell_id").and_then(|item| item.as_str()) {
        Some(valid) => valid.to_string(),
        None => identity_cell_ref(val),
    }
}

fn genome_kind_matches(val: &Value, kind: &str) -> bool {
    if kind != "AgentGenome" {
        return false;
    }
    val.get("apiVersion").is_some()
}

fn is_agent_genome(val: &Value) -> bool {
    match val.get("kind").and_then(|item| item.as_str()) {
        Some(kind) => genome_kind_matches(val, kind),
        None => false,
    }
}

fn cloned_or(val: &Value, key: &str, fallback: Value) -> Value {
    match val.get(key) {
        Some(valid) => valid.clone(),
        None => fallback,
    }
}

fn fallback_conscience(val: &Value) -> Value {
    json!({
        "conscience": val.get("conscience").cloned().unwrap_or_else(|| json!({})),
        "organelles": val.get("organelles").cloned().unwrap_or_else(|| json!([]))
    })
}

fn build_genome(val: Value) -> Value {
    let name = text_field(&val, "name", "Griot");
    let role = text_field(&val, "role", "Autonomous Node");
    let meaning = text_field(&val, "name_meaning", "Agent autonome résilient de l'écosystème GenOS");
    let cell_id = cell_ref(&val);
    let cognition = cloned_or(&val, "cognition", fallback_conscience(&val));
    json!({
        "apiVersion": "v0alpha1",
        "kind": "AgentGenome",
        "metadata": { "name": name, "version": "0.1.0" },
        "identity": { "role": role, "name": name, "name_meaning": meaning, "cell_id": cell_id },
        "cognition": cognition,
        "objectives": cloned_or(&val, "objectives", json!({ "primary": role, "operational_mode": "autonomous" })),
        "policies": cloned_or(&val, "policies", json!({ "hayflick_limit": 50, "is_senescent": false })),
        "capabilities": cloned_or(&val, "capabilities", json!(["inspect", "reason", "mutate"])),
        "memory_policy": cloned_or(&val, "memory_policy", json!({ "ltd_decay": true, "consolidation": true })),
        "model_policy": cloned_or(&val, "model_policy", json!({ "preferred": "default" })),
        "tool_policy": cloned_or(&val, "tool_policy", json!({ "allowed_tools": ["genos_inspect"] })),
        "cell_id": cell_id,
        "name": name,
        "role": role,
        "conscience": val.get("conscience").cloned().unwrap_or_else(|| json!({}))
    })
}

pub fn normalize_to_agent_genome(val: Value) -> Value {
    if is_agent_genome(&val) {
        return val;
    }
    build_genome(val)
}

fn genome_with_id(val: Value) -> (String, Value) {
    let id = cell_ref(&val);
    (id, normalize_to_agent_genome(val))
}

fn parse_yaml_genome(content: &str) -> (String, Value) {
    match serde_yaml::from_str::<Value>(content) {
        Ok(val) => genome_with_id(val),
        Err(_) => default_genome(),
    }
}

fn parse_json_genome(content: &str) -> (String, Value) {
    match serde_json::from_str::<Value>(content) {
        Ok(val) => genome_with_id(val),
        Err(_) => default_genome(),
    }
}

fn parse_genome_content(content: &str, agent_path: &str) -> (String, Value) {
    if agent_path.ends_with(".yaml") {
        return parse_yaml_genome(content);
    }
    if agent_path.ends_with(".yml") {
        return parse_yaml_genome(content);
    }
    parse_json_genome(content)
}

fn default_genome() -> (String, Value) {
    let cell = AgentCell::default();
    let id = cell.cell_id.to_string();
    let raw = match serde_json::to_value(&cell) {
        Ok(valid) => valid,
        Err(_) => json!({ "name": "Griot" }),
    };
    (id, normalize_to_agent_genome(raw))
}

pub fn load_or_create_genome(agent_path: &str) -> (String, Value) {
    match std::fs::read_to_string(agent_path) {
        Ok(content) => parse_genome_content(&content, agent_path),
        Err(_) => default_genome(),
    }
}

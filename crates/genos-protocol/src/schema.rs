use serde_json::{json, Map, Value};

use crate::types::PROTOCOL_VERSION;

pub fn object_schema<const N: usize>(properties: [(&str, Value); N], required: &[&str]) -> Value {
    let properties: Map<String, Value> = properties
        .into_iter()
        .map(|(name, schema)| (name.to_string(), schema))
        .collect();
    json!({
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "additionalProperties": false,
        "properties": properties,
        "required": required
    })
}

pub fn capsule_schema() -> Value {
    object_schema(
        [
            ("capsule_id", string_schema("Capsule identifier.")),
            ("root", root_schema()),
        ],
        &["capsule_id"],
    )
}

pub fn string_schema(description: &str) -> Value {
    json!({"type": "string", "minLength": 1, "description": description})
}

pub fn string_array_schema(description: &str) -> Value {
    json!({"type":"array","items":{"type":"string","minLength":1},"description":description})
}

pub fn root_schema() -> Value {
    json!({"type": "string", "minLength": 1, "default": ".genos", "description": "GenOS data root."})
}

pub fn experiment_root_schema() -> Value {
    json!({"type": "string", "minLength": 1, "default": ".genos/experiments", "description": "Experiment report and world root."})
}

pub fn result_schema() -> Value {
    json!({
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "additionalProperties": false,
        "properties": {
            "protocol_version": {"const": PROTOCOL_VERSION},
            "operation": {"type": "string"},
            "exit_code": {"type": "integer"},
            "output": {},
            "stdout": {"type": "string"},
            "stderr": {"type": "string"}
        },
        "required": ["protocol_version", "operation", "exit_code", "stdout", "stderr"]
    })
}

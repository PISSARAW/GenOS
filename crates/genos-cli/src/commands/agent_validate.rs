use std::fs;
use std::path::Path;

fn is_yaml_path(file_path: &str) -> bool {
    match file_path.ends_with(".yaml") {
        true => true,
        false => file_path.ends_with(".yml"),
    }
}
fn read_genome_value(file_path: &str, content: &str) -> Result<serde_json::Value, String> {
    match is_yaml_path(file_path) {
        true => match serde_yaml::from_str(content) {
            Ok(v) => Ok(v),
            Err(e) => Err(format!("Invalid YAML format in '{}': {}", file_path, e)),
        },
        false => match serde_json::from_str(content) {
            Ok(v) => Ok(v),
            Err(e) => Err(format!("Invalid JSON format in '{}': {}", file_path, e)),
        },
    }
}
pub fn load_genome_file(file_path: &str) -> Result<serde_json::Value, String> {
    let path = Path::new(file_path);
    match path.exists() {
        false => return Err(format!("Genome file not found: {}", file_path)),
        true => {},
    }
    match fs::read_to_string(path) {
        Ok(content) => read_genome_value(file_path, &content),
        Err(e) => Err(format!("Failed to read genome file '{}': {}", file_path, e)),
    }
}
fn check_api_version(val: &serde_json::Value, errors: &mut Vec<String>) {
    match val.get("apiVersion") {
        Some(v) => match v.as_str() {
            Some(_) => {},
            None => errors.push("Missing required field 'apiVersion'".to_string()),
        },
        None => errors.push("Missing required field 'apiVersion'".to_string()),
    }
}
fn check_kind(val: &serde_json::Value, errors: &mut Vec<String>) {
    match val.get("kind") {
        None => errors.push("Missing required field 'kind'".to_string()),
        Some(v) => match v.as_str() {
            None => errors.push("Missing required field 'kind'".to_string()),
            Some("AgentGenome") => {},
            Some(other) => errors.push(format!("Field 'kind' must equal 'AgentGenome', found '{}'", other)),
        },
    }
}
fn check_metadata_name(metadata: &serde_json::Map<String, serde_json::Value>, errors: &mut Vec<String>) {
    match metadata.get("name") {
        Some(v) => match v.as_str() {
            Some(_) => {},
            None => errors.push("Missing required field 'metadata.name'".to_string()),
        },
        None => errors.push("Missing required field 'metadata.name'".to_string()),
    }
}
fn check_metadata_version(metadata: &serde_json::Map<String, serde_json::Value>, errors: &mut Vec<String>) {
    match metadata.get("version") {
        Some(v) => match v.as_str() {
            Some(_) => {},
            None => errors.push("Missing required field 'metadata.version'".to_string()),
        },
        None => errors.push("Missing required field 'metadata.version'".to_string()),
    }
}
fn check_metadata(val: &serde_json::Value, errors: &mut Vec<String>) {
    match val.get("metadata") {
        None => errors.push("Missing required object 'metadata'".to_string()),
        Some(v) => match v.as_object() {
            None => errors.push("Missing required object 'metadata'".to_string()),
            Some(metadata) => {
                check_metadata_name(metadata, errors);
                check_metadata_version(metadata, errors);
            }
        },
    }
}
fn check_identity(val: &serde_json::Value, errors: &mut Vec<String>) {
    match val.get("identity") {
        None => errors.push("Missing required object 'identity'".to_string()),
        Some(v) => match v.as_object() {
            None => errors.push("Missing required object 'identity'".to_string()),
            Some(identity) => match identity.get("role") {
                Some(r) => match r.as_str() {
                    Some(_) => {},
                    None => errors.push("Missing required field 'identity.role'".to_string()),
                },
                None => errors.push("Missing required field 'identity.role'".to_string()),
            },
        },
    }
}
fn check_cognition(val: &serde_json::Value, errors: &mut Vec<String>) {
    match val.get("cognition") {
        Some(v) => match v.as_object() {
            Some(_) => {},
            None => errors.push("Missing required object 'cognition'".to_string()),
        },
        None => errors.push("Missing required object 'cognition'".to_string()),
    }
}
fn has_object(val: &serde_json::Value, key: &str) -> bool {
    match val.get(key) {
        Some(v) => v.as_object().is_some(),
        None => false,
    }
}
fn check_memory(val: &serde_json::Value, errors: &mut Vec<String>) {
    match has_object(val, "memory") {
        true => {},
        false => match has_object(val, "memory_policy") {
            true => {},
            false => errors.push("Missing required object 'memory' or 'memory_policy'".to_string()),
        },
    }
}
fn check_models(val: &serde_json::Value, errors: &mut Vec<String>) {
    match has_object(val, "models") {
        true => {},
        false => match has_object(val, "model_policy") {
            true => {},
            false => errors.push("Missing required object 'models' or 'model_policy'".to_string()),
        },
    }
}
fn check_tools(val: &serde_json::Value, errors: &mut Vec<String>) {
    match has_object(val, "tools") {
        true => {},
        false => match has_object(val, "tool_policy") {
            true => {},
            false => errors.push("Missing required object 'tools' or 'tool_policy'".to_string()),
        },
    }
}
fn check_policies(val: &serde_json::Value, errors: &mut Vec<String>) {
    match val.get("policies") {
        None => {},
        Some(policies) => match policies.is_object() {
            true => {},
            false => match policies.is_array() {
                true => {},
                false => errors.push("Field 'policies' must be an object or an array".to_string()),
            },
        },
    }
}
fn check_capabilities(val: &serde_json::Value, errors: &mut Vec<String>) {
    match val.get("capabilities") {
        None => {},
        Some(caps) => match caps.is_array() {
            true => {},
            false => errors.push("Field 'capabilities' must be an array".to_string()),
        },
    }
}
pub fn collect_genome_errors(val: &serde_json::Value) -> Vec<String> {
    let mut errors = Vec::new();
    check_api_version(val, &mut errors);
    check_kind(val, &mut errors);
    check_metadata(val, &mut errors);
    check_identity(val, &mut errors);
    check_cognition(val, &mut errors);
    check_memory(val, &mut errors);
    check_models(val, &mut errors);
    check_tools(val, &mut errors);
    check_policies(val, &mut errors);
    check_capabilities(val, &mut errors);
    errors
}
pub fn report_invalid_genome(file_path: &str, errors: &[String]) -> String {
    let output = serde_json::json!({
        "success": false,
        "operation": "genome_validate",
        "file": file_path,
        "schema": "genome.schema.json",
        "status": "INVALID",
        "errors": errors
    });
    println!("{}", serde_json::to_string_pretty(&output).unwrap());
    format!("Genome validation failed: {}", errors.join(", "))
}
pub fn report_valid_genome(file_path: &str, val: &serde_json::Value) {
    let output = serde_json::json!({
        "success": true,
        "operation": "genome_validate",
        "file": file_path,
        "schema": "genome.schema.json",
        "status": "VALID",
        "genome": {
            "name": val.get("metadata").and_then(|m| m.get("name")).and_then(|n| n.as_str()),
            "role": val.get("identity").and_then(|i| i.get("role")).and_then(|r| r.as_str()),
            "apiVersion": val.get("apiVersion").and_then(|a| a.as_str())
        }
    });
    println!("{}", serde_json::to_string_pretty(&output).unwrap());
}

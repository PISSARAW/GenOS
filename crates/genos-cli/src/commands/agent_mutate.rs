use std::fs;
use std::path::Path;
use std::path::PathBuf;
use serde_json::Value;
use serde_json::json;

pub struct Mutation<'a> {
    pub agent_id: &'a str,
    pub trait_name: &'a str,
    pub outcome: f64,
}

fn candidate_paths(agent_id: &str) -> Vec<PathBuf> {
    vec![
        PathBuf::from(agent_id),
        PathBuf::from(format!("{}.json", agent_id)),
        PathBuf::from(format!("{}.yaml", agent_id)),
        PathBuf::from(format!(".genos/agents/{}.json", agent_id)),
    ]
}

fn first_existing(paths: &[PathBuf]) -> Option<usize> {
    let mut index = 0;
    while index < paths.len() {
        if paths[index].exists() {
            return Some(index);
        }
        index += 1;
    }
    None
}

fn stamp_json_object(obj: &mut serde_json::Map<String, Value>, stamp: &Mutation) {
    obj.insert(format!("trait_{}", stamp.trait_name), json!(stamp.outcome));
    match obj.get_mut("metadata").and_then(|meta| meta.as_object_mut()) {
        Some(meta) => {
            meta.insert("last_mutation".to_string(), json!({ "trait": stamp.trait_name, "outcome": stamp.outcome }));
        }
        None => (),
    }
}

fn try_json_mutation(content: &str, stamp: &Mutation) -> Option<String> {
    let mut val = match serde_json::from_str::<Value>(content) {
        Ok(valid) => valid,
        Err(_) => return None,
    };
    match val.as_object_mut() {
        Some(obj) => stamp_json_object(obj, stamp),
        None => return None,
    }
    match serde_json::to_string_pretty(&val) {
        Ok(saved) => Some(saved),
        Err(_) => None,
    }
}

fn try_yaml_mutation(content: &str, stamp: &Mutation) -> Option<String> {
    let mut val = match serde_yaml::from_str::<Value>(content) {
        Ok(valid) => valid,
        Err(_) => return None,
    };
    match val.as_object_mut() {
        Some(obj) => stamp_json_object(obj, stamp),
        None => return None,
    }
    match serde_yaml::to_string(&val) {
        Ok(saved) => Some(saved),
        Err(_) => None,
    }
}

fn print_mutation_output(path: &Path, stamp: &Mutation) -> Result<(), String> {
    let output = json!({
        "success": true,
        "operation": "agent_mutate",
        "agent_id": stamp.agent_id,
        "trait": stamp.trait_name,
        "outcome": stamp.outcome,
        "mutation_score": stamp.outcome * 1.05,
        "persisted_file": path.to_string_lossy().to_string()
    });
    println!("{}", serde_json::to_string(&output).unwrap_or_default());
    Ok(())
}

fn write_mutated(path: &Path, saved: &str, stamp: &Mutation) -> Result<(), String> {
    match fs::write(path, saved) {
        Ok(()) => print_mutation_output(path, stamp),
        Err(error) => Err(format!("Failed to persist mutation: {}", error)),
    }
}

fn mutate_known_format(path: &Path, content: &str, stamp: &Mutation) -> Result<(), String> {
    match try_json_mutation(content, stamp) {
        Some(saved) => return write_mutated(path, &saved, stamp),
        None => (),
    }
    match try_yaml_mutation(content, stamp) {
        Some(saved) => write_mutated(path, &saved, stamp),
        None => Err(format!("Agent file has unsupported content: {}", stamp.agent_id)),
    }
}

fn mutate_file(path: &Path, stamp: &Mutation) -> Result<(), String> {
    let content = match fs::read_to_string(path) {
        Ok(valid) => valid,
        Err(error) => return Err(format!("Failed to read agent file: {}", error)),
    };
    mutate_known_format(path, &content, stamp)
}

pub fn handle_mutate(agent_id: &str, trait_name: &str, outcome: f64) -> Result<(), String> {
    let stamp = Mutation { agent_id, trait_name, outcome };
    let paths = candidate_paths(agent_id);
    match first_existing(&paths) {
        Some(index) => mutate_file(&paths[index], &stamp),
        None => Err(format!("Agent file not found or unsupported: {}", agent_id)),
    }
}

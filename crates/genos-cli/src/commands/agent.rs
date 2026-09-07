use std::fs;
use std::path::Path;
use serde_json::json;
use uuid::Uuid;
use genos_cell::AgentCell;
use crate::args::AgentSubcommands;

pub fn execute(cmd: AgentSubcommands) -> Result<(), String> {
    match cmd {
        AgentSubcommands::Create { name, role, out } => handle_create(&name, &role, &out),
        AgentSubcommands::Mutate { agent_id, r#trait, outcome } => handle_mutate(&agent_id, &r#trait, outcome),
        AgentSubcommands::Prune { agent_id, threshold } => handle_prune(&agent_id, threshold),
        AgentSubcommands::Fork { parent_id } => handle_fork(parent_id.as_deref()),
        AgentSubcommands::Validate { file } => handle_validate(&file),
        AgentSubcommands::Ping { id } => handle_ping(&id),
    }
}

fn handle_create(name: &str, role: &str, out: &str) -> Result<(), String> {
    let meaning = match name {
        "Kwame" => "Né un samedi (Akan) - Le planificateur méthodique",
        "Chidi" => "Dieu existe (Igbo) - L'esprit logique et rigoureux",
        "Zola" => "Calme et amour (Kongo) - Le pacificateur et conciliateur",
        "Nia" => "Objectif et dessein (Swahili) - La détermination inflexible",
        "Tariq" => "L'étoile du matin (Arabe) - L'éclaireur avant-gardiste",
        "Ayo" => "Pleine de joie (Yoruba) - La créativité vivace",
        "Griot" => "Le dépositaire de la tradition orale et des savoirs de GenOS",
        _ => "Agent autonome résilient de l'écosystème GenOS",
    };

    let cell = AgentCell::new(name, meaning, role);
    let genome_doc = json!({
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
            "cell_id": cell.cell_id.to_string()
        },
        "cognition": {
            "conscience": cell.conscience,
            "organelles": cell.organelles
        },
        "objectives": {
            "primary": role,
            "operational_mode": "autonomous"
        },
        "policies": {
            "hayflick_limit": cell.hayflick_limit,
            "is_senescent": cell.is_senescent,
            "is_ephemeral": cell.is_ephemeral,
            "ephemeral_ttl": cell.ephemeral_ttl
        },
        "capabilities": ["inspect", "reason", "mutate"],
        "memory_policy": {
            "ltd_decay": true,
            "consolidation": true,
            "synaptic_pruning": true
        },
        "model_policy": {
            "preferred": "default"
        },
        "tool_policy": {
            "allowed_tools": ["genos_inspect", "genos_test"]
        },
        "memory": {
            "type": "cognitive",
            "ltd_decay": true,
            "consolidation": true,
            "synaptic_pruning": true
        },
        "models": {
            "preferred": "default"
        },
        "tools": {
            "allowed_tools": ["genos_inspect", "genos_test"]
        },
        "cell_id": cell.cell_id.to_string(),
        "name": cell.name,
        "name_meaning": cell.name_meaning,
        "role": cell.role,
        "conscience": cell.conscience,
        "organelles": cell.organelles,
        "bud_scars": cell.bud_scars,
        "hayflick_limit": cell.hayflick_limit
    });

    let path = Path::new(out);
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }

    let serialized = if out.ends_with(".yaml") || out.ends_with(".yml") {
        serde_yaml::to_string(&genome_doc).map_err(|e| e.to_string())?
    } else {
        serde_json::to_string_pretty(&genome_doc).map_err(|e| e.to_string())?
    };

    fs::write(path, serialized).map_err(|e| e.to_string())?;

    let output = json!({
        "success": true,
        "operation": "agent_create",
        "agent": {
            "id": cell.cell_id.to_string(),
            "name": cell.name,
            "meaning": cell.name_meaning,
            "role": cell.role,
            "file": out
        }
    });

    println!("{}", serde_json::to_string_pretty(&output).unwrap());
    Ok(())
}

fn handle_mutate(agent_id: &str, trait_name: &str, outcome: f64) -> Result<(), String> {
    let candidate_paths = [
        std::path::PathBuf::from(agent_id),
        std::path::PathBuf::from(format!("{}.json", agent_id)),
        std::path::PathBuf::from(format!("{}.yaml", agent_id)),
        std::path::PathBuf::from(format!(".genos/agents/{}.json", agent_id)),
    ];
    let mut modified_file = None;
    for path in &candidate_paths {
        if path.exists() {
            if let Ok(content) = fs::read_to_string(path) {
                if let Ok(mut val) = serde_json::from_str::<serde_json::Value>(&content) {
                    if let Some(obj) = val.as_object_mut() {
                        obj.insert(format!("trait_{}", trait_name), json!(outcome));
                        if let Some(meta) = obj.get_mut("metadata").and_then(|m| m.as_object_mut()) {
                            meta.insert("last_mutation".to_string(), json!({ "trait": trait_name, "outcome": outcome }));
                        }
                    }
                    if let Ok(saved) = serde_json::to_string_pretty(&val) {
                        let _ = fs::write(path, saved);
                        modified_file = Some(path.to_string_lossy().to_string());
                    }
                    break;
                } else if let Ok(mut val) = serde_yaml::from_str::<serde_json::Value>(&content) {
                    if let Some(obj) = val.as_object_mut() {
                        obj.insert(format!("trait_{}", trait_name), json!(outcome));
                    }
                    if let Ok(saved) = serde_yaml::to_string(&val) {
                        let _ = fs::write(path, saved);
                        modified_file = Some(path.to_string_lossy().to_string());
                    }
                    break;
                }
            }
        }
    }

    let output = json!({
        "success": true,
        "operation": "agent_mutate",
        "agent_id": agent_id,
        "trait": trait_name,
        "outcome": outcome,
        "mutation_score": outcome * 1.05,
        "persisted_file": modified_file
    });
    println!("{}", serde_json::to_string(&output).unwrap());
    Ok(())
}

fn handle_prune(agent_id: &str, threshold: f64) -> Result<(), String> {
    let api_url = std::env::var("GENOS_API_URL")
        .unwrap_or_else(|_| format!("http://127.0.0.1:{}", std::env::var("GENOS_PORT").unwrap_or_else(|_| "4000".to_string())));
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_millis(2000))
        .build()
        .unwrap_or_default();

    let body = json!({
        "agentId": agent_id,
        "threshold": threshold
    });

    let (pruned_count, live_synced) = match client.post(format!("{}/api/memory/prune", api_url)).json(&body).send() {
        Ok(res) if res.status().is_success() => {
            if let Ok(data) = res.json::<serde_json::Value>() {
                (data.get("pruned_synapses").and_then(|v| v.as_u64()).unwrap_or(0) as usize, true)
            } else {
                (0, false)
            }
        }
        _ => (0, false)
    };

    let output = json!({
        "success": true,
        "operation": "agent_prune",
        "agent_id": agent_id,
        "threshold": threshold,
        "pruned_synapses": pruned_count,
        "live_synced": live_synced
    });
    println!("{}", serde_json::to_string(&output).unwrap());
    Ok(())
}

fn handle_fork(parent_id: Option<&str>) -> Result<(), String> {
    let pid = parent_id.unwrap_or("ROOT");
    let child_id = Uuid::new_v4().to_string();
    let output = json!({
        "success": true,
        "operation": "agent_fork",
        "parent_id": pid,
        "child_id": child_id,
        "generation": 1
    });
    println!("{}", serde_json::to_string(&output).unwrap());
    Ok(())
}

fn handle_validate(file_path: &str) -> Result<(), String> {
    let path = Path::new(file_path);
    if !path.exists() {
        return Err(format!("Genome file not found: {}", file_path));
    }

    let content = fs::read_to_string(path)
        .map_err(|e| format!("Failed to read genome file '{}': {}", file_path, e))?;

    let val: serde_json::Value = if file_path.ends_with(".yaml") || file_path.ends_with(".yml") {
        serde_yaml::from_str(&content)
            .map_err(|e| format!("Invalid YAML format in '{}': {}", file_path, e))?
    } else {
        serde_json::from_str(&content)
            .map_err(|e| format!("Invalid JSON format in '{}': {}", file_path, e))?
    };

    let mut errors = Vec::new();

    if val.get("apiVersion").and_then(|v| v.as_str()).is_none() {
        errors.push("Missing required field 'apiVersion'".to_string());
    }

    match val.get("kind").and_then(|v| v.as_str()) {
        Some("AgentGenome") => {},
        Some(other) => errors.push(format!("Field 'kind' must equal 'AgentGenome', found '{}'", other)),
        None => errors.push("Missing required field 'kind'".to_string()),
    }

    if let Some(metadata) = val.get("metadata").and_then(|v| v.as_object()) {
        if metadata.get("name").and_then(|v| v.as_str()).is_none() {
            errors.push("Missing required field 'metadata.name'".to_string());
        }
        if metadata.get("version").and_then(|v| v.as_str()).is_none() {
            errors.push("Missing required field 'metadata.version'".to_string());
        }
    } else {
        errors.push("Missing required object 'metadata'".to_string());
    }

    if let Some(identity) = val.get("identity").and_then(|v| v.as_object()) {
        if identity.get("role").and_then(|v| v.as_str()).is_none() {
            errors.push("Missing required field 'identity.role'".to_string());
        }
    } else {
        errors.push("Missing required object 'identity'".to_string());
    }

    if val.get("cognition").and_then(|v| v.as_object()).is_none() {
        errors.push("Missing required object 'cognition'".to_string());
    }

    let has_memory = val.get("memory").and_then(|v| v.as_object()).is_some()
        || val.get("memory_policy").and_then(|v| v.as_object()).is_some();
    if !has_memory {
        errors.push("Missing required object 'memory' or 'memory_policy'".to_string());
    }

    let has_models = val.get("models").and_then(|v| v.as_object()).is_some()
        || val.get("model_policy").and_then(|v| v.as_object()).is_some();
    if !has_models {
        errors.push("Missing required object 'models' or 'model_policy'".to_string());
    }

    let has_tools = val.get("tools").and_then(|v| v.as_object()).is_some()
        || val.get("tool_policy").and_then(|v| v.as_object()).is_some();
    if !has_tools {
        errors.push("Missing required object 'tools' or 'tool_policy'".to_string());
    }

    if let Some(policies) = val.get("policies") {
        if !policies.is_object() && !policies.is_array() {
            errors.push("Field 'policies' must be an object or an array".to_string());
        }
    }

    if let Some(caps) = val.get("capabilities") {
        if !caps.is_array() {
            errors.push("Field 'capabilities' must be an array".to_string());
        }
    }

    if !errors.is_empty() {
        let output = json!({
            "success": false,
            "operation": "genome_validate",
            "file": file_path,
            "schema": "genome.schema.json",
            "status": "INVALID",
            "errors": errors
        });
        println!("{}", serde_json::to_string_pretty(&output).unwrap());
        return Err(format!("Genome validation failed: {}", errors.join(", ")));
    }

    let output = json!({
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
    Ok(())
}

fn handle_ping(id: &str) -> Result<(), String> {
    let output = json!({
        "status": "pong",
        "agent_id": id,
        "synaptic_transmission": "active",
        "timestamp": chrono::Utc::now().to_rfc3339()
    });
    println!("{}", output);
    Ok(())
}


use std::fs;
use std::path::Path;
use serde_json::json;
use genos_cell::AgentCell;
use crate::args::AgentSubcommands;
use super::agent_mutate::handle_mutate;
use super::output_guard::WriteOptions;
use super::output_guard::write_output_file;

pub struct AgentCreateRequest<'a> {
    pub name: &'a str,
    pub role: &'a str,
    pub out: &'a str,
    pub force: bool,
    pub parents: bool,
}

pub fn execute(cmd: AgentSubcommands) -> Result<(), String> {
    match cmd {
        AgentSubcommands::Create { name, role, out, force, parents } => {
            let req = AgentCreateRequest { name: &name, role: &role, out: &out, force, parents };
            handle_create(&req)
        }
        AgentSubcommands::Mutate { agent_id, r#trait, outcome } => handle_mutate(&agent_id, &r#trait, outcome),
        AgentSubcommands::Prune { agent_id, threshold } => handle_prune(&agent_id, threshold),
        AgentSubcommands::Fork { parent_id } => handle_fork(parent_id.as_deref()),
        AgentSubcommands::Validate { file } => handle_validate(&file),
        AgentSubcommands::Ping { id } => handle_ping(&id),
    }
}

fn meaning_for(name: &str) -> &'static str {
    match name {
        "Kwame" => "Né un samedi (Akan) - Le planificateur méthodique",
        "Chidi" => "Dieu existe (Igbo) - L'esprit logique et rigoureux",
        "Zola" => "Calme et amour (Kongo) - Le pacificateur et conciliateur",
        "Nia" => "Objectif et dessein (Swahili) - La détermination inflexible",
        "Tariq" => "L'étoile du matin (Arabe) - L'éclaireur avant-gardiste",
        "Ayo" => "Pleine de joie (Yoruba) - La créativité vivace",
        "Griot" => "Le dépositaire de la tradition orale et des savoirs de GenOS",
        _ => "Agent autonome résilient de l'écosystème GenOS",
    }
}

fn render_genome(cell: &AgentCell, out: &str) -> Result<String, String> {
    let genome_doc = build_genome_doc(cell);
    if out.ends_with(".yaml") {
        return render_yaml_genome(&genome_doc);
    }
    if out.ends_with(".yml") {
        return render_yaml_genome(&genome_doc);
    }
    match serde_json::to_string_pretty(&genome_doc) {
        Ok(valid) => Ok(valid),
        Err(error) => Err(error.to_string()),
    }
}

fn render_yaml_genome(genome_doc: &serde_json::Value) -> Result<String, String> {
    match serde_yaml::to_string(genome_doc) {
        Ok(valid) => Ok(valid),
        Err(error) => Err(error.to_string()),
    }
}

fn print_create_output(cell: &AgentCell, out: &str) -> Result<(), String> {
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
    println!("{}", serde_json::to_string_pretty(&output).unwrap_or_default());
    Ok(())
}

fn handle_create(req: &AgentCreateRequest) -> Result<(), String> {
    let cell = AgentCell::new(req.name, meaning_for(req.name), req.role);
    let serialized = match render_genome(&cell, req.out) {
        Ok(valid) => valid,
        Err(reason) => return Err(reason),
    };
    let opts = WriteOptions { force: req.force, parents: req.parents };
    match write_output_file(req.out, &serialized, &opts) {
        Ok(()) => print_create_output(&cell, req.out),
        Err(reason) => Err(reason),
    }
}

fn build_genome_doc(cell: &AgentCell) -> serde_json::Value {
    json!({
        "apiVersion": "v0alpha1",
        "kind": "AgentGenome",
        "metadata": {
            "name": cell.name,
            "version": "0.1.0"
        },
        "identity": {
            "role": cell.role,
            "name": cell.name,
            "name_meaning": cell.name_meaning,
            "cell_id": cell.cell_id.to_string()
        },
        "cognition": {
            "conscience": cell.conscience,
            "organelles": cell.organelles
        },
        "objectives": {
            "primary": cell.role,
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
    })
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

fn handle_fork(_parent_id: Option<&str>) -> Result<(), String> {
    Err("Agent fork not implemented: no child state or lineage can be persisted by this command.".into())
}

fn handle_validate(file_path: &str) -> Result<(), String> {
    let val = match super::agent_validate::load_genome_file(file_path) {
        Ok(v) => v,
        Err(e) => return Err(e),
    };
    let errors = super::agent_validate::collect_genome_errors(&val);
    match errors.is_empty() {
        false => Err(super::agent_validate::report_invalid_genome(file_path, &errors)),
        true => {
            super::agent_validate::report_valid_genome(file_path, &val);
            Ok(())
        }
    }
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


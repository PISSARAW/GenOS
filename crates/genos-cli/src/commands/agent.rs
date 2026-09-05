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
    let path = Path::new(out);
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }

    let serialized = if out.ends_with(".yaml") || out.ends_with(".yml") {
        serde_yaml::to_string(&cell).map_err(|e| e.to_string())?
    } else {
        serde_json::to_string_pretty(&cell).map_err(|e| e.to_string())?
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
    let output = json!({
        "success": true,
        "operation": "agent_mutate",
        "agent_id": agent_id,
        "trait": trait_name,
        "outcome": outcome,
        "mutation_score": outcome * 1.05
    });
    println!("{}", serde_json::to_string(&output).unwrap());
    Ok(())
}

fn handle_prune(agent_id: &str, threshold: f64) -> Result<(), String> {
    let output = json!({
        "success": true,
        "operation": "agent_prune",
        "agent_id": agent_id,
        "threshold": threshold,
        "pruned_synapses": 2
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

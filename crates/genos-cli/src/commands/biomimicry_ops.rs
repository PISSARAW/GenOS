use serde_json::json;
use uuid::Uuid;

use genos_biology::ecology::{CollusionCheck, EvolutionaryEcology};
use genos_biology::redundancy::RedundancySystem;
use genos_biology::spore::{Spore, SporeType};
use genos_biology::tissue::{TaskDelegation, Tissue};
use genos_genome::Genome;

pub fn handle_spore(action: &str, agent_id: &str, spore_type: Option<&str>, conditions: (bool, bool)) {
    let genome = Genome::new(agent_id);
    let stype = match spore_type.unwrap_or("bacterial") {
        "fungal" => SporeType::FungalReproductive,
        _ => SporeType::BacterialEndospore,
    };
    if action == "germinate" {
        let spore = match stype {
            SporeType::BacterialEndospore => Spore::create_bacterial_endospore(&genome),
            SporeType::FungalReproductive => Spore::create_fungal_spores(&genome, 1).pop().unwrap(),
        };
        let (warm_and_wet, nutrients) = conditions;
        let res = spore.germinate(warm_and_wet, nutrients);
        print_json(json!({
            "success": res.is_ok(), "operation": "spore_germinate",
            "agent_id": agent_id, "role": res.map(|c| c.role).unwrap_or_default(),
            "status": "vegetative"
        }));
    } else {
        let bunker = Spore::create_bacterial_endospore(&genome);
        print_json(json!({
            "success": true, "operation": "spore_create",
            "agent_id": agent_id, "bunker_armor": bunker.bunker_armor,
            "spore_type": format!("{:?}", bunker.spore_type), "status": "dormant"
        }));
    }
}

pub fn handle_tissue(action: &str, name: &str, role: Option<&str>, params: (Option<&str>, Option<&str>, Option<&str>)) {
    let (stem_id, worker_id, task) = params;
    let stem_uuid = stem_id.and_then(|s| Uuid::parse_str(s).ok()).unwrap_or_else(Uuid::new_v4);
    let worker_uuid = worker_id.and_then(|w| Uuid::parse_str(w).ok()).unwrap_or_else(Uuid::new_v4);
    let mut tissue = Tissue::new(name, role.unwrap_or("Collective"), stem_uuid);
    tissue.integrate_cell(worker_uuid);

    if action == "delegate" {
        let res = tissue.delegate_task(TaskDelegation {
            from_id: stem_uuid,
            to_id: worker_uuid,
            task: task.unwrap_or("default_task"),
        });
        print_json(json!({
            "success": res.is_ok(), "operation": "tissue_delegate",
            "name": name, "result": res.unwrap_or_else(|e| e)
        }));
    } else {
        print_json(json!({
            "success": true, "operation": "tissue_create",
            "name": name, "stem_cell_id": stem_uuid.to_string(),
            "somatic_cells": [worker_uuid.to_string()], "status": "formed"
        }));
    }
}

pub fn handle_bio_feature(feature: &str, action: &str, param: &[String]) {
    match feature {
        "spore" => {
            let genome = Genome::new("BIO_FEATURE_SPORE");
            let spore = Spore::create_bacterial_endospore(&genome);
            print_json(json!({
                "success": true, "feature": "spore", "action": action,
                "bunker_armor": spore.bunker_armor, "status": "executed"
            }));
        }
        "anti_collusion" | "ecology" => {
            let mut ecology = EvolutionaryEcology::new();
            let check = CollusionCheck { consumed_tokens: 600, physical_test_passed: true };
            let res = ecology.enforce_anti_collusion("Agent_Subject", check);
            print_json(json!({
                "success": res.is_ok(), "feature": feature, "action": action,
                "verdict": res.unwrap_or_else(|e| e)
            }));
        }
        "redundancy" => {
            let redundancy = RedundancySystem::new();
            let res = redundancy.execute_instruction_with_redundancy("search_web", "searhc_web");
            print_json(json!({
                "success": res.is_ok(), "feature": "redundancy", "action": action,
                "silent_mutation": res.is_ok()
            }));
        }
        _ => {
            crate::commands::biomimicry_features::handle_bio_feature(feature, action, param);
        }
    }
}

pub fn parse_uuid(input: &str) -> Uuid {
    Uuid::parse_str(input).unwrap_or_else(|_| Uuid::new_v4())
}

pub fn print_json(val: serde_json::Value) {
    println!("{}", serde_json::to_string_pretty(&val).unwrap());
}

pub fn handle_network_quorum(agent_id: &str, threshold: f64, action_id: &str) -> Result<(), String> {
    let sanitized: String = action_id
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .collect();
    let root = crate::commands::root_resolver::resolve_matrix_root();
    let quorum_dir = root.join("quorum");
    if !quorum_dir.exists() {
        let _ = std::fs::create_dir_all(&quorum_dir);
    }
    let file_path = quorum_dir.join(format!("{}.json", sanitized));

    let mut voters: Vec<String> = if file_path.exists() {
        let content = std::fs::read_to_string(&file_path).unwrap_or_default();
        serde_json::from_str::<serde_json::Value>(&content)
            .ok()
            .and_then(|v| v.get("voters").and_then(|arr| arr.as_array()).map(|arr| {
                arr.iter().filter_map(|x| x.as_str().map(|s| s.to_string())).collect()
            }))
            .unwrap_or_default()
    } else {
        Vec::new()
    };

    if !voters.iter().any(|v| v == agent_id) {
        voters.push(agent_id.to_string());
    }

    let voter_count = voters.len();
    let quorum_reached = (voter_count as f64) >= threshold;
    let payload = json!({
        "success": true,
        "operation": "network_quorum",
        "action_id": action_id,
        "agent_id": agent_id,
        "threshold": threshold,
        "voter_count": voter_count,
        "voters": voters,
        "quorum_reached": quorum_reached,
        "status": if quorum_reached { "quorum_reached" } else { "accumulating" }
    });

    let _ = std::fs::write(&file_path, serde_json::to_string_pretty(&payload).unwrap_or_default());
    print_json(payload);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_handle_network_quorum() {
        let action = format!("test_act_{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos());
        let res1 = handle_network_quorum("agent_alpha", 2.0, &action);
        assert!(res1.is_ok());
        let res2 = handle_network_quorum("agent_beta", 2.0, &action);
        assert!(res2.is_ok());
    }
}

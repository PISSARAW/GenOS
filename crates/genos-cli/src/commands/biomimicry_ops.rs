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
            print_json(json!({
                "success": true, "operation": "bio_feature",
                "feature": feature, "action": action, "params": param, "status": "executed"
            }));
        }
    }
}

pub fn parse_uuid(input: &str) -> Uuid {
    Uuid::parse_str(input).unwrap_or_else(|_| Uuid::new_v4())
}

pub fn print_json(val: serde_json::Value) {
    println!("{}", serde_json::to_string_pretty(&val).unwrap());
}

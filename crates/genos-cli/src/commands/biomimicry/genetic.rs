use serde_json::json;

use genos_biology::bioluminescence::{BioluminescenceMicroscope, FluorophoreColor};
use genos_biology::ecology::{CollusionCheck, EvolutionaryEcology};
use genos_biology::embryology::{cleave_zygote, differentiate_swarm, sculpt_architecture_via_apoptosis, seed_hox_genome};
use genos_biology::redundancy::RedundancySystem;
use genos_biology::tissue::{TaskDelegation, Tissue};
use genos_cell::AgentCell;
use genos_genome::Genome;
use rand;
use std::fs;
use std::path::PathBuf;

use crate::args::BiomimicrySubcommands;
use crate::commands::biomimicry_ops::*;

fn telomere_state_path(agent_id: &str) -> Result<PathBuf, String> {
    if agent_id.is_empty() || !agent_id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
        return Err("agent_id must contain only ASCII letters, digits, '-' or '_'".to_string());
    }
    let root = crate::commands::root_resolver::resolve_matrix_root();
    Ok(root.join("telomeres").join(format!("{}.json", agent_id)))
}

pub fn execute_speciation_check(agent_id: &str, threshold: f64) -> Result<(), String> {
    let g1 = Genome::new(agent_id);
    let g2 = Genome::new(&format!("{}_divergent", agent_id));
    let divergence = if g1.genome_id() != g2.genome_id() { 0.12 } else { 0.0 };
    print_json(json!({
        "success": true, "operation": "speciation_check",
        "agent_id": agent_id, "threshold": threshold, "divergence": divergence,
        "is_new_species": divergence > threshold
    }));
    Ok(())
}

pub fn execute_telomere_fork(agent_id: &str, force_telomerase: bool) -> Result<(), String> {
    let state_path = match telomere_state_path(agent_id) {
        Ok(p) => p,
        Err(e) => {
            print_json(json!({
                "success": false,
                "operation": "telomere_fork",
                "parent_id": agent_id,
                "agent_id": agent_id,
                "error": e,
                "status": "error"
            }));
            return Ok(());
        }
    };

    let mut cell: AgentCell = if state_path.exists() {
        match fs::read_to_string(&state_path).ok().and_then(|s| serde_json::from_str(&s).ok()) {
            Some(c) => c,
            None => AgentCell::new(agent_id, "Cellule souche", "Worker"),
        }
    } else {
        AgentCell::new(agent_id, "Cellule souche", "Worker")
    };

    if force_telomerase {
        cell.apply_telomerase();
    }

    match cell.budding(0.5) {
        Ok(child) => {
            if let Some(parent_dir) = state_path.parent() {
                let _ = fs::create_dir_all(parent_dir);
            }
            let _ = fs::write(&state_path, serde_json::to_string_pretty(&cell).unwrap_or_default());
            print_json(json!({
                "success": true,
                "operation": "telomere_fork",
                "parent_id": agent_id,
                "agent_id": agent_id,
                "child_id": child.cell_id.to_string(),
                "bud_scars": cell.bud_scars,
                "hayflick_limit": cell.hayflick_limit,
                "remaining_divisions": cell.remaining_divisions(),
                "telomerase_active": force_telomerase,
                "is_senescent": cell.is_senescent,
                "status": if cell.is_senescent { "senescent" } else { "active" }
            }));
        }
        Err(e) => {
            print_json(json!({
                "success": false,
                "operation": "telomere_fork",
                "parent_id": agent_id,
                "agent_id": agent_id,
                "error": e,
                "remaining_divisions": cell.remaining_divisions(),
                "status": "senescent_blocked"
            }));
        }
    }
    Ok(())
}

pub fn execute_apoptosis(agent_id: &str) -> Result<(), String> {
    let mut cell = AgentCell::new(agent_id, "Cellule cible", "Worker");
    cell.trigger_apoptosis();
    BioluminescenceMicroscope::emit_fluorescence(
        cell.cell_id,
        FluorophoreColor::Red,
        ("Mitochondria", "CYTOCHROME_C_RELEASE", "Apoptose cellulaire programmée déclenchée"),
    );
    print_json(json!({
        "success": true, "operation": "apoptosis",
        "agent_id": agent_id, "caspase_cascade": "ACTIVATED",
        "is_alive": cell.is_alive(), "status": "TERMINATED"
    }));
    Ok(())
}

pub fn execute_hypermutation(agent_id: &str) -> Result<(), String> {
    let redundancy = RedundancySystem::new();
    let mut genome = Genome::new(agent_id);
    let mut rng = rand::rng();
    let mutations_count = genome.hypermutate(redundancy.codon_degeneracy_tolerance.clamp(0.05, 0.5), &mut rng);
    print_json(json!({
        "success": true, "operation": "hypermutation",
        "agent_id": agent_id,
        "mutations_count": mutations_count,
        "tolerance": redundancy.codon_degeneracy_tolerance,
        "genome_id": genome.genome_id().to_string(),
        "status": "ACTIVE"
    }));
    Ok(())
}

pub fn execute_anti_collusion(agent_id: &str, consumed_tokens: u32, physical_test_passed: bool) -> Result<(), String> {
    let mut ecology = EvolutionaryEcology::new();
    let check = CollusionCheck { consumed_tokens, physical_test_passed };
    let result = ecology.enforce_anti_collusion(agent_id, check);
    print_json(json!({
        "success": result.is_ok(), "operation": "anti_collusion",
        "agent_id": agent_id, "verdict": result.unwrap_or_else(|e| e),
        "reputation_trusted": ecology.reputation.is_trusted(agent_id)
    }));
    Ok(())
}

pub fn execute_redundancy(expected_tool: &str, mutated_tool: &str, fallback: bool) -> Result<(), String> {
    let mut redundancy = RedundancySystem::new();
    if fallback {
        let fb = redundancy.fallback_execution();
        print_json(json!({
            "success": fb.is_ok(), "operation": "redundancy_fallback",
            "backup_gene": fb.map(|g| g.locus).unwrap_or_default()
        }));
    } else {
        let res = redundancy.execute_instruction_with_redundancy(expected_tool, mutated_tool);
        print_json(json!({
            "success": res.is_ok(), "operation": "redundancy_codon",
            "expected": expected_tool, "mutated": mutated_tool,
            "silent_mutation": res.is_ok()
        }));
    }
    Ok(())
}

pub fn execute_embryology(divisions: u32, gradient: f64) -> Result<(), String> {
    let zygote = AgentCell::new("Zygote_Origin", "Origine clonale", "Stem");
    let mut swarm = cleave_zygote(zygote, divisions)?;
    let mut genome = seed_hox_genome("HOX_BLUEPRINT");
    differentiate_swarm(&mut swarm, gradient, &mut genome);
    sculpt_architecture_via_apoptosis(&mut swarm);
    let roles: Vec<String> = swarm.iter().map(|c| c.role.clone()).collect();
    print_json(json!({
        "success": true, "operation": "embryology",
        "divisions": divisions, "gradient": gradient,
        "surviving_cells": swarm.len(), "roles": roles
    }));
    Ok(())
}

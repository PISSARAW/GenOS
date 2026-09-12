use serde_json::json;
use std::fs;
use std::path::PathBuf;

use genos_biology::bioluminescence::{BioluminescenceMicroscope, FluorophoreColor};
use genos_biology::glial::{glial_cell, Astrocyte, GlialEnvironment, GlialPipeline, Microglia, MicrogliaState};
use genos_biology::neurobiology::{DendriticTree, NervousSystem, NeuroSignal, Neurotransmitter, PsychoactiveSubstance, SubstancePharmacokinetics};
use genos_biology::signaling::{ExtracellularMatrix, TerritoryClaim};
use genos_genome::{ChromatinState, Gene, Genome};

use crate::commands::biomimicry_ops::{parse_uuid, print_json};

pub fn chromatin_state_path(agent_id: &str) -> Result<PathBuf, String> {
    if agent_id.is_empty() || !agent_id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
        return Err("agent_id must contain only ASCII letters, digits, '-' or '_'".to_string());
    }
    let root = crate::commands::root_resolver::resolve_matrix_root();
    Ok(root.join("chromatin").join(format!("{}.json", agent_id)))
}

pub fn parse_chromatin_state(value: &str) -> Result<ChromatinState, String> {
    match value.trim().to_ascii_lowercase().as_str() {
        "euchromatin" => Ok(ChromatinState::Euchromatin),
        "heterochromatin_facultative" | "facultative" => Ok(ChromatinState::HeterochromatinFacultative),
        "heterochromatin_constitutive" | "constitutive" => Ok(ChromatinState::HeterochromatinConstitutive),
        _ => Err("state must be euchromatin, heterochromatin_facultative, or heterochromatin_constitutive".to_string()),
    }
}

pub fn cerebellum_state_path(agent_id: &str) -> Result<PathBuf, String> {
    if agent_id.is_empty() || !agent_id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
        return Err("agent_id must contain only ASCII letters, digits, '-' or '_'".to_string());
    }
    let root = crate::commands::root_resolver::resolve_matrix_root();
    Ok(root.join("cerebellum").join(format!("{}.json", agent_id)))
}

pub fn stigmergy_state_path(agent_id: &str) -> Result<PathBuf, String> {
    if agent_id.is_empty() || !agent_id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
        return Err("agent_id must contain only ASCII letters, digits, '-' or '_'".to_string());
    }
    let root = crate::commands::root_resolver::resolve_matrix_root();
    Ok(root.join("stigmergy").join(format!("{}.json", agent_id)))
}

pub fn load_or_create_stigmergy_field(path: &PathBuf) -> Result<genos_signal::StigmergyField, String> {
    if path.exists() {
        let content = fs::read_to_string(path).map_err(|e| format!("Failed to read stigmergy state: {}", e))?;
        genos_signal::StigmergyField::from_json(&content).map_err(|e| format!("Failed to parse stigmergy state: {}", e))
    } else {
        Ok(genos_signal::StigmergyField::default())
    }
}

pub fn save_stigmergy_field(path: &PathBuf, field: &genos_signal::StigmergyField) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create stigmergy directory: {}", e))?;
    }
    let content = field.to_json().map_err(|e| format!("Failed to serialize stigmergy field: {}", e))?;
    fs::write(path, content).map_err(|e| format!("Failed to write stigmergy state: {}", e))?;
    Ok(())
}

pub fn handle_stigmergy_deposit(agent_id: &str, target_file: &str, opts: (&str, f64, bool)) -> Result<(), String> {
    let (pheromone_type, amount, is_repellent) = opts;
    let path = stigmergy_state_path(agent_id)?;
    let mut field = load_or_create_stigmergy_field(&path)?;
    let intensity = if amount > 0.0 { amount } else { 1.0 };
    if is_repellent {
        field.deposit_repellent(target_file, intensity);
    } else {
        field.deposit(target_file, intensity);
    }
    save_stigmergy_field(&path, &field)?;

    let current_intensity = field.read(target_file);
    let mut ecm = ExtracellularMatrix::new();
    let cell_id = parse_uuid(agent_id);
    let claim_res = ecm.claim_territory(TerritoryClaim {
        cell_id,
        filepath: target_file,
        position: 0,
    });

    print_json(json!({
        "success": true,
        "operation": "stigmergy_deposit",
        "agent_id": agent_id,
        "target_file": target_file,
        "pheromone_type": pheromone_type,
        "deposited_intensity": intensity,
        "is_repellent": is_repellent,
        "current_intensity": current_intensity,
        "active_pheromones_count": field.pheromones.len(),
        "territory_claimed": claim_res.is_ok(),
        "persisted_path": path.to_string_lossy()
    }));
    Ok(())
}

pub fn handle_stigmergy_read(agent_id: &str, target_file: &str) -> Result<(), String> {
    let path = stigmergy_state_path(agent_id)?;
    let field = load_or_create_stigmergy_field(&path)?;
    let intensity = field.read(target_file);
    let p_opt = field.get_pheromone(target_file);

    print_json(json!({
        "success": true,
        "operation": "stigmergy_read",
        "agent_id": agent_id,
        "target_file": target_file,
        "intensity": intensity,
        "pheromone": p_opt,
        "active_pheromones_count": field.pheromones.len()
    }));
    Ok(())
}

pub fn handle_stigmergy_evaporate(agent_id: &str, dt_seconds: Option<f64>) -> Result<(), String> {
    let path = stigmergy_state_path(agent_id)?;
    let mut field = load_or_create_stigmergy_field(&path)?;
    if let Some(dt) = dt_seconds {
        field.evaporate_dt(dt);
    } else {
        field.evaporate();
    }
    save_stigmergy_field(&path, &field)?;

    print_json(json!({
        "success": true,
        "operation": "stigmergy_evaporate",
        "agent_id": agent_id,
        "dt_seconds": dt_seconds,
        "remaining_pheromones_count": field.pheromones.len()
    }));
    Ok(())
}

pub fn handle_cerebellum(agent_id: &str, values: (f64, f64), latencies: (f64, f64)) -> Result<(), String> {
    let (target_value, current_value) = values;
    let (expected_latency, actual_latency) = latencies;
    let path = cerebellum_state_path(agent_id)?;
    let mut tree = if path.exists() {
        let content = fs::read_to_string(&path)
            .map_err(|e| format!("Impossible de lire l'état du cervelet: {}", e))?;
        serde_json::from_str::<DendriticTree>(&content).unwrap_or_else(|_| DendriticTree::new())
    } else {
        DendriticTree::new()
    };

    let error = (target_value - current_value).abs();
    let latency_diff = (expected_latency - actual_latency).abs();
    let feedforward_gain = 1.0 + (latency_diff / expected_latency.max(1.0));
    let compensated_error = error * feedforward_gain;

    let parallel_fiber_id = format!("{}_parallel_fiber", agent_id);
    let amplified = tree.process_signal_on_compartment(&parallel_fiber_id, compensated_error, "apical_oblique");

    let climbing_fiber_id = format!("{}_climbing_fiber", agent_id);
    if error > 0.05 {
        tree.apply_postsynaptic_stdp(&parallel_fiber_id, -15.0, 0.15);
        tree.process_signal_on_compartment(&climbing_fiber_id, error, "distal_tuft");
    } else {
        tree.apply_postsynaptic_stdp(&parallel_fiber_id, 10.0, 0.20);
    }
    tree.apply_structural_plasticity();

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let serialized = serde_json::to_string_pretty(&tree).map_err(|e| e.to_string())?;
    fs::write(&path, serialized).map_err(|e| e.to_string())?;

    let converged = error < 0.1 && latency_diff <= 5.0;
    print_json(json!({
        "success": true, "operation": "cerebellum_coprocessor",
        "agent_id": agent_id, "error": error, "latency_diff": latency_diff,
        "feedforward_gain": (feedforward_gain * 100.0).round() / 100.0,
        "feedforward_amplification": (amplified * 100.0).round() / 100.0,
        "dendritic_branches": tree.total_spines(),
        "persisted_path": path.to_string_lossy(),
        "smith_predictor_converged": converged
    }));
    Ok(())
}

pub fn handle_glial_cleanup(agent_id: &str, intensity: Option<&str>) -> Result<(), String> {
    let mode = intensity.unwrap_or("standard");
    let cell_id = parse_uuid(agent_id);
    BioluminescenceMicroscope::emit_fluorescence(
        cell_id,
        FluorophoreColor::Yellow,
        "Microglia",
        "GLIAL_PHAGOCYTOSIS",
        &format!("Nettoyage synaptique intensité {}", mode),
    );
    let severity = match mode {
        "high" | "aggressive" => 0.9,
        "low" | "gentle" => 0.3,
        _ => 0.6,
    };
    let terminal_count = 20usize;
    let terminals = (0..terminal_count)
        .map(|index| glial_cell::Synapse {
            c3_opsonization: if (index as f64 / terminal_count as f64) < severity { 0.8 } else { 0.1 },
            cd47_expression: 0.4,
        })
        .collect();
    let mut agent = glial_cell::GlialCell {
        cell_id: agent_id.to_string(),
        metabolism: glial_cell::Metabolism { atp_budget: 100.0 },
        astrocyte: Some(Astrocyte { glycogen_reserve: 50.0, is_reactive: false, protected_neurons: vec![agent_id.to_string()] }),
        myelinator: None,
        microglia: Some(Microglia {
            state: MicrogliaState::Amoeboid,
            plaque_accumulation: severity * 12.0,
            inflammatory_cytokines: 0.0,
            c4_overexpression: false,
            is_pro_inflammatory: false,
        }),
        ependymal: None,
        nervous_system: Some(glial_cell::NervousSystem {
            location: glial_cell::NervousSystemLocation::Central,
            axon: glial_cell::Axon { terminals, myelination_level: 0.8, is_severed: false, nogo_inhibited: false },
            dendritic_tree: Some(DendriticTree::new()),
        }),
    };
    let mut bhe_integrity = 1.0;
    let mut amyloid_plaques = severity * 10.0;
    let mut csf_volume = 10.0;
    let mut csf_pressure = 10.0;
    GlialPipeline::new().process_all(std::slice::from_mut(&mut agent), GlialEnvironment {
        bhe_integrity: &mut bhe_integrity,
        amyloid_plaques: &mut amyloid_plaques,
        csf_volume: &mut csf_volume,
        csf_pressure: &mut csf_pressure,
        is_sleeping: false,
        drainage_blocked: false,
    });
    let remaining_synapses = agent.nervous_system.as_ref().map(|ns| ns.axon.terminals.len()).unwrap_or(0);
    let dead_cells = if agent.metabolism.atp_budget <= 0.0 { 1 } else { 0 };
    let debris_cleared_pct = ((terminal_count.saturating_sub(remaining_synapses)) as f64 / terminal_count as f64) * 100.0;
    let inflammatory_cytokines = agent.microglia.as_ref().map(|m| m.inflammatory_cytokines).unwrap_or(0.0);

    let api_url = std::env::var("GENOS_API_URL")
        .unwrap_or_else(|_| format!("http://127.0.0.1:{}", std::env::var("GENOS_PORT").unwrap_or_else(|_| "4000".to_string())));
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_millis(1500))
        .build()
        .unwrap_or_default();
    let live_pruned = match client.post(format!("{}/api/memory/prune", api_url))
        .json(&json!({ "agentId": agent_id, "threshold": severity }))
        .send() {
        Ok(res) if res.status().is_success() => {
            res.json::<serde_json::Value>().ok().and_then(|v| v.get("pruned_synapses").and_then(|c| c.as_u64())).unwrap_or(0) as usize
        }
        _ => 0
    };

    print_json(json!({
        "success": true, "operation": "glial_cleanup",
        "agent_id": agent_id, "intensity": mode,
        "phagocytized_dead_cells": dead_cells,
        "debris_cleared_percent": debris_cleared_pct,
        "inflammatory_cytokines": inflammatory_cytokines,
        "bhe_integrity_restored": bhe_integrity,
        "synaptic_debris_cleared": true,
        "live_synapses_phagocytized": live_pruned
    }));
    Ok(())
}

pub fn handle_gene_regulatory_network(agent_id: &str, condition: &str, action_script: &str) -> Result<(), String> {
    let state_path = chromatin_state_path(agent_id)?;
    let genome = if state_path.exists() {
        serde_json::from_str(&fs::read_to_string(&state_path).map_err(|e| format!("Failed to read chromatin state: {}", e))?)
            .map_err(|e| format!("Invalid persisted chromatin state: {}", e))?
    } else {
        Genome::new(agent_id)
    };
    let gene_count = genome.genes.len();
    print_json(json!({
        "success": true, "operation": "gene_regulatory_network",
        "agent_id": agent_id, "condition": condition,
        "action_script": action_script, "active_genes": gene_count,
        "plasmids_count": genome.plasmids.len(),
        "expression_level": "UP_REGULATED"
    }));
    Ok(())
}

pub fn handle_epigenetic_chromatin(agent_id: &str, locus: &str, opts: (&str, bool)) -> Result<(), String> {
    let (state, pioneer_factor) = opts;
    let chromatin_state = parse_chromatin_state(state)?;
    let state_path = chromatin_state_path(agent_id)?;
    let mut genome = if state_path.exists() {
        serde_json::from_str(&fs::read_to_string(&state_path).map_err(|e| format!("Failed to read chromatin state: {}", e))?)
            .map_err(|e| format!("Invalid persisted chromatin state: {}", e))?
    } else {
        Genome::new(agent_id)
    };

    if let Some(existing_gene) = genome.genes.get(locus) {
        if existing_gene.chromatin_state == ChromatinState::HeterochromatinConstitutive
            && chromatin_state == ChromatinState::Euchromatin
            && !pioneer_factor
        {
            return Err(format!(
                "Epigenetic Violation: locus '{}' is locked in HeterochromatinConstitutive and cannot be transitioned to Euchromatin without a pioneer_factor",
                locus
            ));
        }
    }

    let (is_methylated, developmentally_locked) = {
        let gene = genome.genes.entry(locus.to_string()).or_insert_with(|| Gene::new(locus, agent_id));
        gene.chromatin_state = chromatin_state.clone();
        gene.developmentally_locked = chromatin_state != ChromatinState::Euchromatin;
        gene.is_methylated = chromatin_state != ChromatinState::Euchromatin;
        (gene.is_methylated, gene.developmentally_locked)
    };
    if let Some(parent) = state_path.parent() { fs::create_dir_all(parent).map_err(|e| format!("Failed to create chromatin store: {}", e))?; }
    fs::write(&state_path, serde_json::to_string_pretty(&genome).map_err(|e| format!("Failed to serialize chromatin state: {}", e))?)
        .map_err(|e| format!("Failed to persist chromatin state: {}", e))?;

    let mut synced_with_platform = false;
    let api_url = std::env::var("GENOS_API_URL")
        .unwrap_or_else(|_| format!("http://127.0.0.1:{}", std::env::var("GENOS_PORT").unwrap_or_else(|_| "4000".to_string())));
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_millis(1500))
        .build()
        .unwrap_or_default();
    let mut req = client.post(format!("{}/api/platform/permissions", api_url));
    if let Ok(token) = std::env::var("GENOS_API_TOKEN").or_else(|_| std::env::var("GENOS_ACCESS_KEY")) {
        req = req.header("Authorization", format!("Bearer {}", token));
    }
    let denied_tools = if developmentally_locked { vec![locus.to_string()] } else { vec![] };
    let permissions = if developmentally_locked { vec![] } else { vec![locus.to_string()] };
    if let Ok(res) = req.json(&json!({
        "agentId": agent_id,
        "permissions": permissions,
        "deniedTools": denied_tools,
        "taintPolicy": "block_external"
    })).send() {
        synced_with_platform = res.status().is_success();
    }

    print_json(json!({
        "success": true, "operation": "epigenetic_chromatin",
        "agent_id": agent_id, "locus": locus, "state": state,
        "methylation_applied": is_methylated, "developmentally_locked": developmentally_locked,
        "genome_id": genome.genome_id().to_string(), "state_path": state_path,
        "synced_with_platform": synced_with_platform
    }));
    Ok(())
}

pub fn handle_nootropic_infusion(agent_id: &str, substance: &str, dose_mg: f64) -> Result<(), String> {
    let sub_lower = substance.to_lowercase();
    let mut ns = NervousSystem::new(agent_id);
    let is_stack = sub_lower.contains("stack") || sub_lower.contains("smart") || (sub_lower.contains("caffeine") && sub_lower.contains("theanine"));
    let (label, details) = if is_stack {
        let (caf, thea) = (dose_mg * 0.333, dose_mg * 0.667);
        ns.administer_substance(PsychoactiveSubstance::Caffeine, caf);
        ns.administer_substance(PsychoactiveSubstance::Theanine, thea);
        ("Smart Caffeine Stack (Caféine + L-Théanine)", json!({
            "caffeine_mg": (caf * 10.0).round() / 10.0, "theanine_mg": (thea * 10.0).round() / 10.0,
            "ratio": "1:2", "mechanism": "Synergie nootropique: élimination du jitter, éveil calme et induction d'état de Flow"
        }))
    } else {
        let parsed = match sub_lower.as_str() {
            "theanine" | "l-theanine" | "l_theanine" | "théanine" => PsychoactiveSubstance::Theanine,
            "theine" | "théine" => PsychoactiveSubstance::Theine,
            "theobromine" | "théobromine" => PsychoactiveSubstance::Theobromine,
            "paraxanthine" => PsychoactiveSubstance::Paraxanthine,
            _ => PsychoactiveSubstance::Caffeine,
        };
        ns.administer_substance(parsed, dose_mg);
        let p = SubstancePharmacokinetics::profile_for(parsed);
        (format!("{}", parsed).leak() as &str, json!({
            "substance": format!("{}", parsed), "half_life_ticks": p.half_life_ticks,
            "glutamate_multiplier": p.glutamate_multiplier, "gaba_multiplier": p.gaba_multiplier,
            "sustained_release": p.sustained_release, "jitter_risk": p.jitter_risk
        }))
    };
    let state = ns.cognitive_state();
    let resting = ns.soma.current_potential;
    ns.receive_neurotransmitter("syn-test", &NeuroSignal { transmitter: Neurotransmitter::Glutamate, amount: 1.0 });
    let delta = ns.soma.current_potential - resting;
    print_json(json!({
        "success": true, "operation": "nootropic_infusion", "agent_id": agent_id,
        "infusion_name": label, "administered_dose_mg": dose_mg, "cognitive_state": format!("{:?}", state),
        "substance_details": details, "membrane_potential_mv": (ns.soma.current_potential * 100.0).round() / 100.0,
        "excitatory_delta_mv": (delta * 100.0).round() / 100.0, "active_compounds": ns.active_substances.len(),
        "status": "neuromodulated"
    }));
    Ok(())
}


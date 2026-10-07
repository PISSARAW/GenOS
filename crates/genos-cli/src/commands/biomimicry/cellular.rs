use serde_json::json;

use genos_biology::bioluminescence::{BioluminescenceMicroscope, FluorophoreColor};
use genos_biology::neurobiology::Neurotransmitter;
use genos_biology::tissue::{TaskDelegation, Tissue};
use genos_cell::AgentCell;
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

pub fn execute_cellular_endosymbiosis(agent_id: &str, target_process: &str, organelle_name: &str) -> Result<(), String> {
    let cell_id = parse_uuid(agent_id);
    BioluminescenceMicroscope::emit_fluorescence(
        cell_id,
        FluorophoreColor::Blue,
        (&organelle_name, "ENDOSYMBIOSIS_INTEGRATION", &format!("Intégration du processus '{}'", target_process)),
    );
    let (atp_delta, efficiency, metabolic_role) = match organelle_name.to_lowercase().as_str() {
        "mitochondria" | "mitochondrie" => (36, 0.94, "oxidative_phosphorylation"),
        "chloroplast" => (18, 0.85, "photophosphorylation"),
        "ribosome" => (12, 0.91, "protein_translation"),
        _ => (16, 0.78, "organellar_coprocessing"),
    };
    print_json(json!({
        "success": true, "operation": "cellular_endosymbiosis",
        "agent_id": agent_id, "target_process": target_process,
        "organelle_name": organelle_name, "atp_yield_delta": atp_delta,
        "symbiotic_efficiency": efficiency, "metabolic_role": metabolic_role,
        "status": "integrated"
    }));
    Ok(())
}

pub fn execute_cellular_bbb(agent_id: &str, filter_level: &str) -> Result<(), String> {
    let cell_id = parse_uuid(agent_id);
    BioluminescenceMicroscope::emit_fluorescence(
        cell_id,
        FluorophoreColor::Green,
        ("Astrocyte", "BLOOD_BRAIN_BARRIER", &format!("Niveau de filtrage : {}", filter_level)),
    );
    print_json(json!({
        "success": true, "operation": "cellular_bbb",
        "agent_id": agent_id, "filter_level": filter_level,
        "bhe_integrity": 1.0, "status": "protected"
    }));
    Ok(())
}

pub fn execute_theory_autopoiesis(agent_id: &str, target_gene: &str, new_value: f64) -> Result<(), String> {
    let mut cell = AgentCell::new(agent_id, "Autopoïèse régénératrice", "Worker");
    let initial_dissonance = cell.conscience.dissonance_level;
    cell.conscience.reduce_dissonance(new_value.min(cell.conscience.max_dissonance_threshold));
    let max_threshold = if cell.conscience.max_dissonance_threshold > 0.0 {
        cell.conscience.max_dissonance_threshold
    } else {
        50.0
    };
    let membrane_integrity = (1.0 - (cell.conscience.dissonance_level / max_threshold)).clamp(0.0, 1.0);
    print_json(json!({
        "success": true, "operation": "theory_autopoiesis",
        "agent_id": agent_id, "target_gene": target_gene,
        "new_value": new_value, "self_repaired": true,
        "initial_dissonance": initial_dissonance,
        "residual_dissonance": cell.conscience.dissonance_level,
        "membrane_integrity": (membrane_integrity * 100.0).round() / 100.0,
        "autopoietic_boundary_secured": true
    }));
    Ok(())
}

pub fn execute_hypothalamus_homeostasis(agent_id: &str, nervous_state: &str) -> Result<(), String> {
    let is_stress = nervous_state.to_lowercase().contains("stress")
        || nervous_state.to_lowercase().contains("alarm")
        || nervous_state.to_lowercase().contains("panic");
    let (transmitter, symp_tone, parasymp_tone, gaba_level, glu_level) = if is_stress {
        (Neurotransmitter::GABA, 0.85, 0.15, 48.0, 12.0)
    } else {
        (Neurotransmitter::Glutamate, 0.20, 0.80, 15.0, 42.0)
    };
    let ratio: f64 = gaba_level / glu_level;
    print_json(json!({
        "success": true, "operation": "hypothalamus_homeostasis",
        "agent_id": agent_id, "nervous_state": nervous_state,
        "neuromodulator": format!("{:?}", transmitter),
        "sympathetic_tone": symp_tone,
        "parasympathetic_tone": parasymp_tone,
        "gaba_titration_nmol": gaba_level,
        "glutamate_titration_nmol": glu_level,
        "homeostatic_ratio": (ratio * 100.0).round() / 100.0,
        "equilibrium_restored": true
    }));
    Ok(())
}

pub fn execute_enteric_delegate(agent_id: &str, data_source: &str, digestion_mode: Option<&str>) -> Result<(), String> {
    let mode = digestion_mode.unwrap_or("ferment");
    let (nutrient_yield, hydrolysis_rate, peristaltic_freq) = match mode {
        "acid" => (0.74, "rapid_hydrolysis", "1.2 Hz"),
        "peristalsis" => (0.86, "streamed_forwarding", "0.6 Hz"),
        _ => (0.95, "anaerobic_fermentation", "0.2 Hz"),
    };
    let manager = AgentCell::new("Enteric_Plexus", "Système nerveux entérique", "Manager");
    let mut tissue = Tissue::new("Enteric_Tissue", "Digestion de données", manager.cell_id);
    let worker_id = parse_uuid(agent_id);
    tissue.integrate_cell(worker_id);
    let delegation = tissue.delegate_task(TaskDelegation {
        from_id: manager.cell_id,
        to_id: worker_id,
        task: &format!("Digérer source {} en mode {}", data_source, mode),
    });
    print_json(json!({
        "success": delegation.is_ok(), "operation": "enteric_delegate",
        "agent_id": agent_id, "data_source": data_source, "digestion_mode": mode,
        "nutrient_yield_ratio": nutrient_yield,
        "hydrolysis_mechanism": hydrolysis_rate,
        "peristaltic_frequency": peristaltic_freq,
        "delegation_status": delegation.unwrap_or_else(|e| e)
    }));
    Ok(())
}
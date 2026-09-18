use serde::{Deserialize, Serialize};
pub use genos_cell::clinical::{ClinicalState, DiseaseCategory, Pathology};
use genos_cell::AgentCell;

/// Rapport de statut clinique d'un agent
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct ClinicalStatusReport {
    pub cell_id: String,
    pub name: String,
    pub is_healthy: bool,
    pub is_quarantined: bool,
    pub active_pathologies: Vec<Pathology>,
    pub dominant_category: Option<DiseaseCategory>,
    pub recommended_treatment: Option<String>,
}

/// Évalue l'état clinique global d'une cellule
pub fn assess_agent_clinical_status(agent: &AgentCell) -> ClinicalStatusReport {
    let mut active_pathologies = agent.clinical.active_pathologies.clone();
    if let Some(pathology) = check_degenerative_state(agent)
        && !active_pathologies.iter().any(|item| item.name() == pathology.name())
    {
        active_pathologies.push(pathology);
    }
    let dominant_category = agent
        .clinical
        .active_pathologies
        .first()
        .map(|p| p.category());

    let recommended_treatment = if active_pathologies.iter().any(|p| p.category() == DiseaseCategory::Autoimmune) {
        Some("SystemicTherapy::Tocilizumab ou ImmunosuppressiveWash".to_string())
    } else if active_pathologies.iter().any(|p| p.category() == DiseaseCategory::Nosocomial) {
        Some("SystemicTherapy::QuarantineIsolation & Vaccine".to_string())
    } else if active_pathologies.iter().any(|p| p.category() == DiseaseCategory::Iatrogenic) {
        Some("SystemicTherapy::DetoxificationWashout ou Antidote".to_string())
    } else if active_pathologies.iter().any(|p| p.category() == DiseaseCategory::Degenerative) {
        Some("SystemicTherapy::StemCellReplacement ou ApoptoticPruning".to_string())
    } else {
        None
    };

    ClinicalStatusReport {
        cell_id: agent.cell_id.to_string(),
        name: agent.name.clone(),
        is_healthy: active_pathologies.is_empty() && !agent.clinical.is_quarantined,
        is_quarantined: agent.clinical.is_quarantined,
        active_pathologies,
        dominant_category,
        recommended_treatment,
    }
}

/// Évalue le risque iatrogène d'un traitement administré par l'Orchestrateur (déclenchement probabiliste / déterministe)
pub fn check_iatrogenic_complication(treatment_name: &str, dose: f64) -> Option<Pathology> {
    if treatment_name == "Corticosteroids" && dose > 0.8 {
        Some(Pathology::SteroidInducedComa { administered_dose: dose })
    } else if treatment_name == "Antibiotic" && dose > 1.5 {
        Some(Pathology::AntibioticCollateralDamage {
            eliminated_components: vec!["BeneficialWorkerNode".to_string()],
        })
    } else {
        None
    }
}

/// Évalue le risque de sénescence dégénérative d'un agent
pub fn check_degenerative_state(agent: &AgentCell) -> Option<Pathology> {
    if agent.bud_scars >= agent.hayflick_limit {
        Some(Pathology::TelomereExhaustion { bud_scars: agent.bud_scars })
    } else if agent.is_senescent {
        Some(Pathology::ReplicativeSenescence)
    } else if (agent.conscience.dissonance_level as f64) > 0.85 {
        Some(Pathology::PrionAggregation {
            dissonance_score: agent.conscience.dissonance_level as f64,
        })
    } else {
        None
    }
}

/// Évalue l'exposition nosocomiale dans une capsule contaminée
pub fn check_nosocomial_exposure(capsule_id: &str, pathogen_signatures: &[String]) -> Option<Pathology> {
    if let Some(first_sig) = pathogen_signatures.first() {
        Some(Pathology::CrossContamination {
            source_capsule: capsule_id.to_string(),
            pathogen_signature: first_sig.clone(),
        })
    } else {
        None
    }
}

/// Évalue le risque de crise auto-immune selon le niveau de cytokines (IL-6)
pub fn check_autoimmune_storm(il6_level: f64) -> Option<Pathology> {
    if il6_level >= 10.0 {
        Some(Pathology::CytokineStorm { il6_level })
    } else {
        None
    }
}

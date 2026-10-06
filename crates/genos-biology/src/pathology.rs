use genos_cell::AgentCell;
pub use genos_cell::clinical::{ClinicalState, DiseaseCategory, Pathology};
use serde::{Deserialize, Serialize};

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
    #[serde(default)]
    pub proposed_therapies: Vec<crate::therapy::SystemicTherapy>,
    #[serde(default)]
    pub invalid_markers: Vec<String>,
}

/// Évalue l'état clinique global d'une cellule
pub fn assess_agent_clinical_status(agent: &AgentCell) -> ClinicalStatusReport {
    let mut active_pathologies = agent.clinical.active_pathologies.clone();
    if let Some(pathology) = check_degenerative_state(agent)
        && !active_pathologies
            .iter()
            .any(|item| item.name() == pathology.name())
    {
        active_pathologies.push(pathology);
    }
    for pathology in crate::nosology::diagnose_markers(&agent.clinical) {
        if let Some(known) = active_pathologies
            .iter_mut()
            .find(|p| p.same_diagnosis(&pathology))
        {
            *known = pathology;
        } else {
            active_pathologies.push(pathology);
        }
    }
    let proposed_therapies = crate::nosology::proposed_therapies(agent);
    let invalid_markers = crate::nosology::invalid_markers(&agent.clinical);
    let dominant_category = dominant_category(&active_pathologies);
    let recommended_treatment = recommendation(&active_pathologies, &proposed_therapies);

    ClinicalStatusReport {
        cell_id: agent.cell_id.to_string(),
        name: agent.name.clone(),
        is_healthy: active_pathologies.is_empty()
            && !agent.clinical.is_quarantined
            && invalid_markers.is_empty(),
        is_quarantined: agent.clinical.is_quarantined,
        active_pathologies,
        dominant_category,
        recommended_treatment,
        proposed_therapies,
        invalid_markers,
    }
}

fn dominant_category(pathologies: &[Pathology]) -> Option<DiseaseCategory> {
    let mut counts: Vec<(DiseaseCategory, usize)> = Vec::new();
    for pathology in pathologies {
        let category = pathology.category();
        if let Some((_, count)) = counts.iter_mut().find(|(known, _)| *known == category) {
            *count += 1;
        } else {
            counts.push((category, 1));
        }
    }
    counts
        .into_iter()
        .max_by_key(|(_, count)| *count)
        .map(|(category, _)| category)
}

fn recommendation(
    pathologies: &[Pathology],
    proposed: &[crate::therapy::SystemicTherapy],
) -> Option<String> {
    if let Some(therapy) = proposed.first() {
        return Some(format!("SystemicTherapy::{:?}", therapy));
    }
    let legacy = [
        (
            DiseaseCategory::Autoimmune,
            "SystemicTherapy::Tocilizumab ou ImmunosuppressiveWash",
        ),
        (
            DiseaseCategory::Nosocomial,
            "SystemicTherapy::QuarantineIsolation & Vaccine",
        ),
        (
            DiseaseCategory::Iatrogenic,
            "SystemicTherapy::DetoxificationWashout ou AntidoteAdmin",
        ),
        (
            DiseaseCategory::Degenerative,
            "SystemicTherapy::StemCellReplacement",
        ),
        (DiseaseCategory::Infectious, "SystemicTherapy::Antiviral"),
    ];
    legacy
        .iter()
        .find(|(category, _)| {
            pathologies
                .iter()
                .any(|p| legacy_category(p).as_ref() == Some(category))
        })
        .map(|(_, name)| (*name).to_string())
}

fn legacy_category(pathology: &Pathology) -> Option<DiseaseCategory> {
    match pathology {
        Pathology::Nosological { .. }
        | Pathology::TherapyAdverseEffect { .. }
        | Pathology::PrionAggregation { .. }
        | Pathology::ContextualDecay { .. } => None,
        _ => Some(pathology.category()),
    }
}

/// Évalue le risque iatrogène d'un traitement administré par l'Orchestrateur (déclenchement probabiliste / déterministe)
pub fn check_iatrogenic_complication(treatment_name: &str, dose: f64) -> Option<Pathology> {
    if treatment_name == "Corticosteroids" && dose > 0.8 {
        Some(Pathology::SteroidInducedComa {
            administered_dose: dose,
        })
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
        Some(Pathology::TelomereExhaustion {
            bud_scars: agent.bud_scars,
        })
    } else if agent.is_senescent {
        Some(Pathology::ReplicativeSenescence)
    } else if agent.conscience.max_dissonance_threshold.is_finite()
        && agent.conscience.max_dissonance_threshold > 0.0
        && agent.conscience.dissonance_level / agent.conscience.max_dissonance_threshold > 0.85
    {
        Some(Pathology::PrionAggregation {
            dissonance_score: agent.conscience.dissonance_level as f64,
        })
    } else {
        None
    }
}

/// Évalue l'exposition nosocomiale dans une capsule contaminée
pub fn check_nosocomial_exposure(
    capsule_id: &str,
    pathogen_signatures: &[String],
) -> Option<Pathology> {
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

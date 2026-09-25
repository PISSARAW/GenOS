//! Diagnostic causal avant tout changement de topologie.
//!
//! Interdit les reflexes naifs (`echec -> plus de workers`).
//! La cause est d'abord classee, puis le changement est decide.

use crate::kernel_state::OrchestratorState;
use serde::{Deserialize, Serialize};

/// Causes racines distinguees par l'orchestrateur.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum FailureType {
    Epistemic,
    Cognitive,
    Strategic,
    Capability,
    Model,
    Resource,
    Communication,
    Topology,
    Procedural,
    Pathological,
    Environmental,
    None,
}

/// Resultat du diagnostic : une cause + un niveau de confiance.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Diagnosis {
    pub failure: FailureType,
    pub confidence: f64,
    pub detail: String,
}

/// Entrees du diagnostic regroupees (respect du gate : 3 params max).
pub struct DiagnosisInput<'a> {
    pub state: &'a OrchestratorState,
    pub no_progress: bool,
    pub worker_error_rate: f64,
}

impl Diagnosis {
    pub fn healthy() -> Self {
        Self {
            failure: FailureType::None,
            confidence: 1.0,
            detail: String::from("nominal"),
        }
    }
}

/// Point d'entree : classifie la cause dominante.
pub fn diagnose(input: &DiagnosisInput<'_>) -> Diagnosis {
    if let Some(epistemic) = diagnose_epistemic(input) {
        return epistemic;
    }
    if let Some(structural) = diagnose_structural(input) {
        return structural;
    }
    diagnose_residual(input)
}

fn diagnose_epistemic(input: &DiagnosisInput<'_>) -> Option<Diagnosis> {
    let state = input.state;
    if state.epistemics.contradictions.is_empty().eq(&false) {
        return Some(Diagnosis {
            failure: FailureType::Epistemic,
            confidence: 0.85,
            detail: String::from("contradiction non resolue"),
        });
    }
    if state.epistemics.evidence_gaps.is_empty().eq(&false) {
        return Some(Diagnosis {
            failure: FailureType::Epistemic,
            confidence: 0.7,
            detail: String::from("preuves manquantes"),
        });
    }
    if state.epistemics.independence_gaps.is_empty().eq(&false) {
        return Some(Diagnosis {
            failure: FailureType::Model,
            confidence: 0.7,
            detail: String::from("independance des verifieurs faible"),
        });
    }
    None
}

fn diagnose_structural(input: &DiagnosisInput<'_>) -> Option<Diagnosis> {
    let state = input.state;
    if state.capabilities.missing.is_empty().eq(&false) {
        return Some(Diagnosis {
            failure: FailureType::Capability,
            confidence: 0.8,
            detail: state
                .capabilities
                .missing
                .first()
                .cloned()
                .unwrap_or_default(),
        });
    }
    if state.resources.cpu_pressure > 0.9 {
        return Some(Diagnosis {
            failure: FailureType::Resource,
            confidence: 0.8,
            detail: String::from("pression ressources"),
        });
    }
    if state.budget_pressure() > 0.9 {
        return Some(Diagnosis {
            failure: FailureType::Resource,
            confidence: 0.75,
            detail: String::from("pression budgetaire"),
        });
    }
    if state.cognition.diversity_score < 0.25 {
        return Some(Diagnosis {
            failure: FailureType::Cognitive,
            confidence: 0.7,
            detail: String::from("monoculture cognitive"),
        });
    }
    None
}

fn diagnose_residual(input: &DiagnosisInput<'_>) -> Diagnosis {
    let state = input.state;
    if state.environment.drift.is_empty().eq(&false) {
        return Diagnosis {
            failure: FailureType::Environmental,
            confidence: 0.6,
            detail: String::from("derive environnementale"),
        };
    }
    if state.resilience.degraded_components.is_empty().eq(&false) {
        return Diagnosis {
            failure: FailureType::Pathological,
            confidence: 0.7,
            detail: String::from("pathologie detectee"),
        };
    }
    if input.no_progress && input.worker_error_rate > 0.5 {
        return Diagnosis {
            failure: FailureType::Strategic,
            confidence: 0.6,
            detail: String::from("strategie inefficace"),
        };
    }
    if input.no_progress {
        return Diagnosis {
            failure: FailureType::Topology,
            confidence: 0.4,
            detail: String::from("topologie suspecte"),
        };
    }
    Diagnosis::healthy()
}

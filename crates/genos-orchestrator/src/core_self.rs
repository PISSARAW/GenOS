//! CoreSelf — la frontière Self/World et l'attribution d'agency.
//!
//! Pièce centrale de l'audit P1 : relie les changements du monde, les
//! changements de l'état interne et l'attribution des actions.
//!
//! Chaîne causale par action :
//!
//!   Intention → PredictedOutcome → Action → ObservedOutcome → Comparator
//!        → AgencyAttribution { attributed_to_self, prediction_error, ... }
//!
//! La distinction produite : « quelque chose s'est produit » ≠ « je l'ai causé ».
//! Chaque donnée porte une provenance Self/World explicite.

use serde::{Deserialize, Serialize};

// ═══════════════════════════════════════════════════════════════════════════════
// Provenance cognitive — frontière Self/World
// ═══════════════════════════════════════════════════════════════════════════════

/// Origine de chaque donnée qui entre dans le système cognitif.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum CognitiveProvenance {
    /// Produit par l'agent lui-même (décision, plan, raisonnement).
    SelfGenerated,
    /// Observation par l'agent de son propre état interne.
    SelfObserved,
    /// Fourni par un humain (instruction, correction, approbation).
    HumanProvided,
    /// Hérité d'un agent parent (lignée, génome, politiques).
    ParentInherited,
    /// Fourni par un agent pair (communication, consensus).
    PeerProvided,
    /// Récupéré d'une source externe (web, outil, API).
    RetrievedExternal,
    /// Observé dans l'environnement (fichiers, télémétrie, résultats).
    EnvironmentObserved,
    /// Rappelé depuis la mémoire autobiographique.
    MemoryRecalled,
}

/// Une donnée cognitive avec sa provenance obligatoire.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Claim {
    pub content: String,
    pub provenance: CognitiveProvenance,
    pub owner: String,
    pub confidence: f64,
}

impl Claim {
    pub fn is_self_origin(&self) -> bool {
        matches!(
            self.provenance,
            CognitiveProvenance::SelfGenerated | CognitiveProvenance::SelfObserved
        )
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Sense of agency — comparator intention/action/outcome
// ═══════════════════════════════════════════════════════════════════════════════

/// Une intention avant action, avec le résultat prédit.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Intention {
    pub action_id: String,
    pub action: String,
    pub predicted_outcome: f64,
    pub confidence: f64,
}

/// Le résultat observé d'une action (ou l'absence d'action de l'agent).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ObservedOutcome {
    pub action_id: String,
    pub outcome: f64,
    /// L'agent a-t-il réellement exécuté cette action ?
    pub action_executed: bool,
}

/// Attribution d'agency produite par le comparator.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct AgencyAttribution {
    pub action_id: String,
    pub intended: bool,
    pub predicted_outcome: f64,
    pub observed_outcome: f64,
    pub prediction_error: f64,
    /// Confiance causale : |prédit - observé| faible + action exécutée
    /// → forte évidence que l'agent a causé le résultat.
    pub causal_confidence: f64,
    pub attributed_to_self: bool,
}

/// Le comparator : confronte intention et observation.
pub struct AgencyComparator {
    /// Seuil au-delà duquel la prédiction est validée comme causale.
    pub tolerance: f64,
}

impl Default for AgencyComparator {
    fn default() -> Self {
        Self { tolerance: 0.25 }
    }
}

impl AgencyComparator {
    /// Attribue (ou non) un résultat observé à l'action de l'agent.
    ///
    /// Règles causales explicites :
    /// 1. Pas d'action exécutée → rien n'est attribué au soi, même si
    ///    le résultat correspond à la prédiction (coïncidence ≠ causalité).
    /// 2. Action exécutée + erreur de prédiction faible → attribution au soi.
    /// 3. Action exécutée + erreur forte → événement survenu mais non
    ///    attribué au soi (le monde a fait autre chose que prévu).
    pub fn compare(&self, intention: &Intention, observed: &ObservedOutcome) -> AgencyAttribution {
        let prediction_error = (observed.outcome - intention.predicted_outcome).abs();
        let causal_confidence = if observed.action_executed {
            (1.0 - (prediction_error / self.tolerance.max(1e-9)).clamp(0.0, 1.0)).clamp(0.0, 1.0)
        } else {
            0.0
        };
        let attributed_to_self = observed.action_executed && prediction_error <= self.tolerance;
        AgencyAttribution {
            action_id: intention.action_id.clone(),
            intended: true,
            predicted_outcome: intention.predicted_outcome,
            observed_outcome: observed.outcome,
            prediction_error,
            causal_confidence,
            attributed_to_self,
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CoreSelfState — l'état complet d'un cycle action
// ═══════════════════════════════════════════════════════════════════════════════

/// État du soi central autour d'un événement : avant/perçu/intention/
/// prédit/après/monde-après/attribution.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct CoreSelfState {
    pub self_state_before: Vec<f64>,
    pub perceived_event: Option<Claim>,
    pub intended_action: Option<Intention>,
    pub predicted_effect: Option<f64>,
    pub self_state_after: Vec<f64>,
    pub world_state_after: Vec<f64>,
    pub agency_attribution: Option<AgencyAttribution>,
    pub ownership_attribution: Option<bool>,
}

/// Le CoreSelf maintient l'historique des cycles et la calibration.
#[derive(Clone, Debug, Default)]
pub struct CoreSelf {
    pub history: Vec<CoreSelfState>,
    /// Nombre d'attributions correctes vs incorrectes (calibration réelle).
    pub attributed: u32,
    pub misattributed: u32,
}

impl CoreSelf {
    pub fn new() -> Self {
        Self::default()
    }

    /// Enregistre un cycle complet (self avant → événement → intention →
    /// action → self après → monde après) et produit l'attribution.
    pub fn record_cycle(
        &mut self,
        before: Vec<f64>,
        event: Option<Claim>,
        intention: Option<Intention>,
        observed: Option<ObservedOutcome>,
        after: Vec<f64>,
        world_after: Vec<f64>,
    ) -> CoreSelfState {
        let comparator = AgencyComparator::default();
        let attribution = match (&intention, &observed) {
            (Some(i), Some(o)) => Some(comparator.compare(i, o)),
            _ => None,
        };
        if let Some(a) = &attribution {
            if a.attributed_to_self {
                self.attributed += 1;
            }
        }
        let state = CoreSelfState {
            self_state_before: before,
            perceived_event: event,
            intended_action: intention.clone(),
            predicted_effect: intention.as_ref().map(|i| i.predicted_outcome),
            self_state_after: after,
            world_state_after: world_after,
            agency_attribution: attribution.clone(),
            ownership_attribution: attribution.as_ref().map(|a| a.attributed_to_self),
        };
        self.history.push(state.clone());
        state
    }

    /// Calibration réelle du sense of agency : proportion d'actions
    /// réellement attribuées au soi sur l'histoire — pas une confiance
    /// qui croît mécaniquement avec le volume.
    pub fn agency_calibration(&self) -> f64 {
        let total = self.attributed + self.misattributed;
        if total == 0 {
            return 0.0;
        }
        (self.attributed as f64 / total as f64).clamp(0.0, 1.0)
    }
}

#[cfg(test)]
#[path = "core_self_tests.rs"]
mod tests;

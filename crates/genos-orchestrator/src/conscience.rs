pub use genos_cell::cognitive_regulation::{CognitiveRegulationState, EvaluationDelta};
use serde::{Deserialize, Serialize};

/// Type alias for backward compatibility.
pub type ConscienceState = CognitiveRegulationState;

#[derive(Clone, Copy, Debug, Default)]
pub struct BranchMetrics {
    pub errors_in_loop: u32,
    pub progress_score: f64,
    pub repetition_score: f64,
    pub semantic_drift: f64,
    pub health_score: f64,
}

/// Le modèle d'évaluation (Conscience) qui juge la qualité cognitive d'une branche.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct Conscience {
    pub max_dissonance_threshold: f64,
    pub baseline_budget: f64,
}

impl Conscience {
    pub fn new(max_dissonance_threshold: f64, baseline_budget: f64) -> Self {
        Self {
            max_dissonance_threshold,
            baseline_budget,
        }
    }

    /// Évalue un clone / une branche isolée en fonction de son activité récente.
    /// - errors_in_loop : Le nombre d'erreurs d'exécution, d'API ou de boucle
    /// - progress_score : Heuristique de progression (nouveaux fichiers créés, tests passés)
    pub fn evaluate_branch(&self, state: &mut ConscienceState, metrics: BranchMetrics) {
        self.evaluate_branch_extended(state, metrics);
    }

    /// Évalue un clone avec métriques cognitives avancées (répétition, dérive, santé).
    pub fn evaluate_branch_extended(&self, state: &mut ConscienceState, metrics: BranchMetrics) {
        if state.is_apoptotic {
            return;
        }

        state.max_dissonance_threshold = self.max_dissonance_threshold;
        state.baseline_budget = self.baseline_budget;

        let repetition_score = bounded_score(metrics.repetition_score, 0.0);
        let semantic_drift = bounded_score(metrics.semantic_drift, 0.0);
        let health_score = bounded_score(metrics.health_score, 0.0);
        let progress_score = bounded_score(metrics.progress_score, 0.0).min(10.0);
        let repetition_penalty = if repetition_score > 0.15 { 5.0 } else { 0.0 };
        let drift_penalty = semantic_drift * 6.0;
        let health_penalty = if health_score < 0.5 {
            (0.5 - health_score) * 10.0
        } else {
            0.0
        };

        let penalty = metrics.errors_in_loop.min(100) as f64 * 2.5
            + repetition_penalty
            + drift_penalty
            + health_penalty;
        let relief = progress_score * 3.0;

        // Transition centralisée dans ConscienceState (source unique de vérité).
        state.apply_evaluation(EvaluationDelta { penalty, relief, budget_cost: 1.0 });
    }

    /// Enregistre une illumination (Eurêka) et divise la dissonance par deux.
    pub fn trigger_eureka(&self, state: &mut ConscienceState, evidence_validated: bool) -> bool {
        state.trigger_eureka(evidence_validated)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_conscience_evaluation_and_apoptosis() {
        let conscience = Conscience::new(50.0, 100.0);
        let mut state = ConscienceState::default();

        assert_eq!(state.dissonance_level, 0.0);
        assert_eq!(state.revision, 0);
        assert!(!state.is_apoptotic);

        // Erreurs en boucle
        conscience.evaluate_branch(&mut state, BranchMetrics { errors_in_loop: 10, ..Default::default() });
        assert_eq!(state.dissonance_level, 25.0);
        assert_eq!(state.revision, 1);
        assert!(!state.is_apoptotic);

        // Eurêka
        assert!(conscience.trigger_eureka(&mut state, true));
        assert_eq!(state.dissonance_level, 12.5);
        assert_eq!(state.eureka_moments, 1);
        assert_eq!(state.revision, 2);

        // Évaluation avancée avec dérive et répétition
        conscience.evaluate_branch_extended(&mut state, BranchMetrics { repetition_score: 0.20, semantic_drift: 1.0, health_score: 0.4, ..Default::default() });
        // penalty = 0 + 5.0 + 6.0 + 1.0 = 12.0 -> dissonance = 12.5 + 12.0 = 24.5
        assert_eq!(state.dissonance_level, 24.5);
        assert_eq!(state.revision, 3);

        // Dépasser le seuil
        conscience.evaluate_branch(&mut state, BranchMetrics { errors_in_loop: 20, ..Default::default() });
        assert!(state.dissonance_level >= 50.0);
        assert!(state.is_apoptotic);
        assert_eq!(state.current_budget, 0.0);
        assert_eq!(state.revision, 4);
    }

    #[test]
    fn test_negative_progress_is_neutralized() {
        let conscience = Conscience::new(50.0, 100.0);
        let mut state = ConscienceState::default();
        // Les scores de progression négatifs sont neutralisés avant le calcul.
        conscience.evaluate_branch_extended(&mut state, BranchMetrics { progress_score: -2.0, health_score: 1.0, ..Default::default() });
        assert_eq!(state.dissonance_level, 0.0);
        assert_eq!(state.revision, 1);
    }
}

fn bounded_score(value: f64, fallback: f64) -> f64 {
    if value.is_finite() {
        value.clamp(0.0, 1.0)
    } else {
        fallback
    }
}

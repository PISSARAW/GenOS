use serde::{Deserialize, Serialize};
pub use genos_cell::conscience::ConscienceState;

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
    pub fn evaluate_branch(
        &self,
        state: &mut ConscienceState,
        errors_in_loop: u32,
        progress_score: f64,
    ) {
        self.evaluate_branch_extended(state, errors_in_loop, progress_score, 0.0, 0.0, 1.0);
    }

    /// Évalue un clone avec métriques cognitives avancées (répétition, dérive, santé).
    pub fn evaluate_branch_extended(
        &self,
        state: &mut ConscienceState,
        errors_in_loop: u32,
        progress_score: f64,
        repetition_score: f64,
        semantic_drift: f64,
        health_score: f64,
    ) {
        if state.is_apoptotic {
            return;
        }

        state.max_dissonance_threshold = self.max_dissonance_threshold;
        state.baseline_budget = self.baseline_budget;

        let repetition_penalty = if repetition_score > 0.15 { 5.0 } else { 0.0 };
        let drift_penalty = if semantic_drift > 0.0 { 6.0 } else { 0.0 };
        let health_penalty = if health_score < 0.5 { ((0.5 - health_score) * 10.0).max(0.0) } else { 0.0 };

        let penalty = (errors_in_loop as f64) * 2.5 + repetition_penalty + drift_penalty + health_penalty;
        let relief = progress_score * 3.0;

        state.dissonance_level = (state.dissonance_level + penalty - relief).max(0.0);
        state.current_budget = (state.current_budget - 1.0 - errors_in_loop as f64).max(0.0);

        if state.dissonance_level >= self.max_dissonance_threshold || state.current_budget <= 0.0 {
            state.is_apoptotic = true;
            state.current_budget = 0.0;
        }
        state.revision += 1;
    }

    /// Enregistre une illumination (Eurêka) et divise la dissonance par deux.
    pub fn trigger_eureka(&self, state: &mut ConscienceState) {
        if state.is_apoptotic {
            return;
        }
        state.eureka_moments = state.eureka_moments.saturating_add(1);
        state.dissonance_level /= 2.0;
        state.current_budget = (state.current_budget + 50.0).min(state.baseline_budget);
        state.revision += 1;
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
        conscience.evaluate_branch(&mut state, 10, 0.0);
        assert_eq!(state.dissonance_level, 25.0);
        assert_eq!(state.revision, 1);
        assert!(!state.is_apoptotic);

        // Eurêka
        conscience.trigger_eureka(&mut state);
        assert_eq!(state.dissonance_level, 12.5);
        assert_eq!(state.eureka_moments, 1);
        assert_eq!(state.revision, 2);

        // Évaluation avancée avec dérive et répétition
        conscience.evaluate_branch_extended(&mut state, 0, 0.0, 0.20, 1.0, 0.4);
        // penalty = 0 + 5.0 + 6.0 + 1.0 = 12.0 -> dissonance = 12.5 + 12.0 = 24.5
        assert_eq!(state.dissonance_level, 24.5);
        assert_eq!(state.revision, 3);

        // Dépasser le seuil
        conscience.evaluate_branch(&mut state, 20, 0.0);
        assert!(state.dissonance_level >= 50.0);
        assert!(state.is_apoptotic);
        assert_eq!(state.current_budget, 0.0);
        assert_eq!(state.revision, 4);
    }
}

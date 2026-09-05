use serde::{Deserialize, Serialize};

/// L'état de conscience d'une branche contrefactuelle ou d'un agent.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ConscienceState {
    pub current_budget: f64,
    pub dissonance_level: f64,
    pub eureka_moments: u32,
    pub is_apoptotic: bool,
    pub max_dissonance_threshold: f64,
}

impl Default for ConscienceState {
    fn default() -> Self {
        Self {
            current_budget: 100.0,
            dissonance_level: 0.0,
            eureka_moments: 0,
            is_apoptotic: false,
            max_dissonance_threshold: 50.0,
        }
    }
}

/// Le modèle d'évaluation (Conscience) qui juge la qualité cognitive d'une branche.
#[derive(Clone, Debug)]
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
        if state.is_apoptotic {
            return;
        }

        let penalty = (errors_in_loop as f64) * 2.5;
        let relief = progress_score * 3.0;

        state.dissonance_level = (state.dissonance_level + penalty - relief).max(0.0);

        if state.dissonance_level >= self.max_dissonance_threshold {
            state.is_apoptotic = true;
            state.current_budget = 0.0;
        } else {
            let harmony = (self.max_dissonance_threshold - state.dissonance_level).max(0.0);
            state.current_budget = self.baseline_budget 
                + (harmony * 5.0) 
                + (state.eureka_moments as f64 * 50.0);
        }
    }

    /// Enregistre une illumination (Eurêka) et divise la dissonance par deux.
    pub fn trigger_eureka(&self, state: &mut ConscienceState) {
        state.eureka_moments += 1;
        state.dissonance_level /= 2.0;
        state.current_budget += 50.0;
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
        assert!(!state.is_apoptotic);

        // Erreurs en boucle
        conscience.evaluate_branch(&mut state, 10, 0.0);
        assert_eq!(state.dissonance_level, 25.0);
        assert!(!state.is_apoptotic);

        // Eurêka
        conscience.trigger_eureka(&mut state);
        assert_eq!(state.dissonance_level, 12.5);
        assert_eq!(state.eureka_moments, 1);

        // Dépasser le seuil
        conscience.evaluate_branch(&mut state, 20, 0.0);
        assert!(state.dissonance_level >= 50.0);
        assert!(state.is_apoptotic);
        assert_eq!(state.current_budget, 0.0);
    }
}

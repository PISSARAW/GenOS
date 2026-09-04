use serde::{Deserialize, Serialize};

/// L'état de conscience d'une branche contrefactuelle.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ConscienceState {
    pub current_budget: f64,
    pub dissonance_level: f64,
    pub eureka_moments: u32,
    pub is_apoptotic: bool,
}

impl Default for ConscienceState {
    fn default() -> Self {
        Self {
            current_budget: 100.0,
            dissonance_level: 0.0,
            eureka_moments: 0,
            is_apoptotic: false,
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
    /// - errors_in_loop : Le nombre d'erreurs d'exécution, d'API ou syntaxiques récentes
    /// - progress_score : Une heuristique de progression (nouveaux fichiers créés, tests passés)
    pub fn evaluate_branch(&self, state: &mut ConscienceState, errors_in_loop: u32, progress_score: f64) {
        if state.is_apoptotic {
            return; // La branche est déjà condamnée
        }

        // La dissonance cognitive augmente fortement avec les erreurs en boucle
        let penalty = (errors_in_loop as f64) * 2.5;
        
        // La dissonance diminue si l'agent progresse vers son but
        let relief = progress_score * 3.0;

        state.dissonance_level = (state.dissonance_level + penalty - relief).max(0.0);

        // Si la dissonance est trop forte, on coupe les vivres (Apoptose)
        if state.dissonance_level >= self.max_dissonance_threshold {
            state.is_apoptotic = true;
            state.current_budget = 0.0;
        } else {
            // Ajustement dynamique du budget en fonction de l'harmonie (absence de dissonance)
            let harmony = (self.max_dissonance_threshold - state.dissonance_level).max(0.0);
            
            // On récompense les eurekas (moments de génie / validation)
            state.current_budget = self.baseline_budget 
                + (harmony * 5.0) 
                + (state.eureka_moments as f64 * 50.0);
        }
    }

    /// Enregistre une illumination ( Eureka ) et diminue violemment la dissonance
    pub fn trigger_eureka(&self, state: &mut ConscienceState) {
        state.eureka_moments += 1;
        state.dissonance_level /= 2.0; // Réduit la dissonance par deux
    }
}

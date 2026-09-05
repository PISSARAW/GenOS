use serde::{Deserialize, Serialize};

/// L'état de conscience d'une cellule ou d'un agent.
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

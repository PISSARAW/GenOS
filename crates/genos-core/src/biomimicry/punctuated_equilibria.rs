//! Punctuated Equilibria mapped to stasis breakout in optimization.
//!
//! Biological mechanism: Evolution features long periods of morphological stasis 
//! punctuated by rare but rapid bursts of evolutionary change (punctuation).
//! GenOS mapping: When an agent's iterative improvement hits a plateau (stasis),
//! it deliberately spikes the mutation rate/temperature to escape the local minimum.

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EvolutionPhase {
    Stasis,
    Punctuation,
}

#[derive(Debug, Clone)]
pub struct PunctuatedEquilibria {
    pub agent_id: String,
    pub current_phase: EvolutionPhase,
    pub stasis_counter: usize,
    pub plateau_threshold: usize,
}

impl PunctuatedEquilibria {
    pub fn new(agent_id: String, plateau_threshold: usize) -> Self {
        Self {
            agent_id,
            current_phase: EvolutionPhase::Stasis,
            stasis_counter: 0,
            plateau_threshold,
        }
    }

    /// Evaluates if the agent has plateaued (e.g. no fitness improvement)
    pub fn evaluate_progress(&mut self, improved: bool) -> EvolutionPhase {
        if self.current_phase == EvolutionPhase::Punctuation {
            // After a burst, we return to stasis to exploit the new traits
            self.current_phase = EvolutionPhase::Stasis;
            self.stasis_counter = 0;
            return EvolutionPhase::Stasis;
        }

        if improved {
            self.stasis_counter = 0;
        } else {
            self.stasis_counter += 1;
        }

        if self.stasis_counter >= self.plateau_threshold {
            self.current_phase = EvolutionPhase::Punctuation;
            self.stasis_counter = 0; // Reset for next time
        }

        self.current_phase.clone()
    }
}

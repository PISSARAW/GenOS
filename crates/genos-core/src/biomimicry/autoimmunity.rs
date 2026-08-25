//! Auto-Immunity mapped to defensive false-positive meta-surveillance.
//!
//! Biological mechanism: Sometimes the immune system attacks healthy tissues
//! (auto-immune disease) due to misidentifying self as non-self. Regulatory T-cells
//! normally suppress this overreaction.
//! GenOS mapping: Defensive mechanisms (like Apoptosis or Inflammation) might
//! aggressively kill valid agent workflows due to false positives. The Autoimmunity
//! module acts as a "Regulatory T-cell", evaluating if defensive triggers are
//! actually harming the system's own healthy operations, and overriding them.

#[derive(Debug, Clone)]
pub struct AutoImmunityRegulator {
    pub agent_id: String,
    pub false_positive_threshold: usize,
    pub recent_defensive_kills: usize,
}

impl AutoImmunityRegulator {
    pub fn new(agent_id: String, false_positive_threshold: usize) -> Self {
        Self {
            agent_id,
            false_positive_threshold,
            recent_defensive_kills: 0,
        }
    }

    /// Logs a defensive action (e.g. Apoptosis triggered by observer).
    pub fn log_defensive_action(&mut self) {
        self.recent_defensive_kills += 1;
    }

    /// Evaluates if the immune system is overreacting and attacking the host.
    pub fn is_autoimmune_overreaction(&self) -> bool {
        self.recent_defensive_kills >= self.false_positive_threshold
    }

    /// Resets the counter, acting as a Regulatory T-Cell suppression signal.
    pub fn suppress_immune_response(&mut self) {
        self.recent_defensive_kills = 0;
    }
}

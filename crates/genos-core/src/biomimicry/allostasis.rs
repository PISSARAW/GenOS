//! Allostasis mapped to prospective workload anticipation.
//!
//! Biological mechanism: Homeostasis reacts to a deficit. Allostasis *anticipates*
//! needs before they happen (e.g., sweating before getting hot, increasing heart
//! rate before a sprint based on cues).
//! GenOS mapping: Instead of auto-scaling compute only after a CPU spike,
//! the swarm anticipates load spikes (based on calendar, upstream cues, or
//! prompt complexity patterns) and pre-allocates context/tokens.

#[derive(Debug, Clone)]
pub struct AllostasisEngine {
    pub swarm_id: String,
    pub base_budget: u64,
}

impl AllostasisEngine {
    pub fn new(swarm_id: String, base_budget: u64) -> Self {
        Self {
            swarm_id,
            base_budget,
        }
    }

    /// Calculates a pre-allocated budget based on an anticipatory stress cue [0.0, 1.0]
    pub fn anticipate_load(&self, stress_cue: f64) -> u64 {
        let multiplier = 1.0 + (stress_cue.clamp(0.0, 1.0) * 3.0); // Up to 4x budget
        (self.base_budget as f64 * multiplier) as u64
    }
}

//! Neuromodulation mapped to Reward Prediction Error (RPE) in MCTS.
//!
//! Biological mechanism: Dopamine neurons encode Reward Prediction Error.
//! If an outcome is better than expected, dopamine spikes, reinforcing the
//! neural pathway. If worse, dopamine dips, inducing LTD (long-term depression).
//! GenOS mapping: In the MCTS planner, instead of purely relying on UCB1 visits
//! and values, we emit a "Dopamine Spike" if the actual fitness of a rollout
//! significantly exceeds the node's prior expected value.

#[derive(Debug, Clone, PartialEq)]
pub struct RpeSignal {
    pub expected_reward: f64,
    pub actual_reward: f64,
}

#[derive(Debug, Clone)]
pub struct DopaminergicSystem {
    pub baseline_dopamine: f64,
    pub learning_rate: f64,
}

impl DopaminergicSystem {
    pub fn new(baseline: f64, learning_rate: f64) -> Self {
        Self {
            baseline_dopamine: baseline,
            learning_rate,
        }
    }

    /// Computes the Reward Prediction Error and the resulting dopamine level
    pub fn compute_rpe(&self, signal: RpeSignal) -> f64 {
        let rpe = signal.actual_reward - signal.expected_reward;
        
        // Dopamine level spikes above baseline if RPE is positive, dips if negative.
        let dopamine_level = self.baseline_dopamine + (rpe * self.learning_rate);
        dopamine_level.clamp(0.0, 1.0)
    }

    /// Evaluates if the dopamine spike is strong enough to flag the pathway
    /// for priority exploration (Long-Term Potentiation equivalent).
    pub fn is_priority_pathway(&self, dopamine_level: f64) -> bool {
        dopamine_level > (self.baseline_dopamine * 1.5)
    }
}

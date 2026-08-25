//! Hippocampal Replay mapped to off-line causal DAG consolidation.
//!
//! Biological mechanism: During sleep (Slow-Wave Sleep), the hippocampus replays
//! the day's experiences to the neocortex to consolidate them into long-term memory.
//! GenOS mapping: When the agent is idle, it replays successful causal DAG trajectories
//! (event histories) to extract generalized rules, optimize prompts, and build macros.

#[derive(Debug, Clone)]
pub struct HippocampalReplay {
    pub agent_id: String,
    pub replay_speed_multiplier: f64,
}

impl HippocampalReplay {
    pub fn new(agent_id: String) -> Self {
        Self {
            agent_id,
            replay_speed_multiplier: 10.0, // Replay is much faster than real-time
        }
    }

    /// Evaluates a trajectory (DAG sequence). If it was highly successful,
    /// it extracts a generalized macro or heuristic.
    pub fn consolidate_memory(&self, dag_trajectory: &[String], success_score: f64) -> Result<String, String> {
        if dag_trajectory.is_empty() {
            return Err("Empty trajectory".to_string());
        }
        
        if success_score > 0.8 {
            // Highly successful, consolidate into a macro
            let macro_name = format!("macro_consolidated_{}", dag_trajectory[0].substring_safe(0, 8));
            Ok(format!("Consolidated {} steps into macro: {}", dag_trajectory.len(), macro_name))
        } else {
            Ok("Trajectory score too low for long-term consolidation. Pruned.".to_string())
        }
    }
}

trait StringSafe {
    fn substring_safe(&self, start: usize, len: usize) -> &str;
}

impl StringSafe for String {
    fn substring_safe(&self, start: usize, len: usize) -> &str {
        if start >= self.len() { return "" }
        let end = std::cmp::min(start + len, self.len());
        &self[start..end]
    }
}

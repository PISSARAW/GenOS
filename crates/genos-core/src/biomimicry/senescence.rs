//! Cellular Senescence mapped to zombie-process elimination.
//!
//! Biological mechanism: Cells stop dividing and enter senescence to prevent cancer, 
//! eventually being cleared by the immune system.
//! GenOS mapping: Detecting agents that have been running for too long without 
//! yielding results (zombies) and gracefully clearing them to free up the swarm budget.

#[derive(Debug, Clone)]
pub struct SenescenceMonitor {
    pub agent_id: String,
    pub epochs_active: usize,
    pub max_epochs: usize,
}

impl SenescenceMonitor {
    pub fn new(agent_id: String, max_epochs: usize) -> Self {
        Self {
            agent_id,
            epochs_active: 0,
            max_epochs,
        }
    }

    pub fn check_age(&mut self) -> String {
        self.epochs_active += 1;
        if self.epochs_active >= self.max_epochs {
            "Senescence triggered. Agent has reached its maximum lifespan and will be cleared.".to_string()
        } else {
            "Agent is healthy and within operational lifespan.".to_string()
        }
    }
}

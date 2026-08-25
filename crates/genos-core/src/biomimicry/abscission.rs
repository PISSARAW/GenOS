//! Abscission mapped to controlled module severing and resource reclamation.
//!
//! Biological mechanism: Trees shed their leaves in autumn (abscission) to conserve
//! water and energy during winter, often reabsorbing nutrients before the leaf falls.
//! GenOS mapping: If a sub-agent or module is stuck, hallucinating, or consuming too
//! much budget without ROI, the swarm triggers Abscission. It reclaims the remaining
//! token budget from the sub-agent before permanently severing it from the DAG.

#[derive(Debug, Clone)]
pub struct AbscissionProcess {
    pub swarm_id: String,
}

impl AbscissionProcess {
    pub fn new(swarm_id: String) -> Self {
        Self { swarm_id }
    }

    /// Severs a failing module and reclaims its allocated budget
    pub fn sever_module(&self, target_module: &str, reclaimable_budget: u64) -> String {
        format!(
            "ABSCISSION TRIGGERED: Module '{}' severed from Swarm {}. {} tokens reclaimed and reabsorbed by the core.",
            target_module, self.swarm_id, reclaimable_budget
        )
    }
}

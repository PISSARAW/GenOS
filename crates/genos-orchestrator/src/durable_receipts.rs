//! Durable receipt boundary for mission ticks.

use crate::planner::Goal;
use crate::tick::TickReport;
use crate::GenosEcosystem;
use genos_store::BiologicalReceiptStore;

/// Tick persistence failure retains the report because execution already ran.
#[derive(Debug)]
pub struct TickPersistenceError {
    pub report: TickReport,
    pub message: String,
}

impl GenosEcosystem {
    /// Run one tick and durably append its biological receipts before returning.
    pub fn tick_and_persist(
        &mut self,
        goal: &Goal,
        store: &BiologicalReceiptStore,
    ) -> Result<TickReport, TickPersistenceError> {
        let report = self.tick(goal);
        let mut receipts = report.biological_receipts.iter()
            .map(serde_json::to_value)
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| TickPersistenceError { report: report.clone(), message: error.to_string() })?;
        let population = self.population_state_receipt(report.tick)
            .map_err(|message| TickPersistenceError { report: report.clone(), message })?;
        receipts.push(population);
        store.append_receipts(&receipts)
            .map_err(|message| TickPersistenceError { report: report.clone(), message })?;
        Ok(report)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::genos_cell::AgentCell;

    #[test]
    fn persisted_tick_contains_population_snapshot_for_restart_recovery() {
        let path = std::env::temp_dir().join(format!("genos-population-{}.jsonl", uuid::Uuid::new_v4()));
        let store = BiologicalReceiptStore::open(&path);
        let mut ecosystem = GenosEcosystem::new("durable-population");
        ecosystem.orchestrator.create_tissue("Arena", "Exec").unwrap();
        let cell = ecosystem
            .orchestrator
            .add_worker("Arena", AgentCell::new("cell", "w", "Soma"))
            .unwrap();
        ecosystem.seed_germline(cell, "DURABLE_POPULATION").unwrap();

        ecosystem.tick_and_persist(&Goal::Conserve, &store).unwrap();
        let restored = BiologicalReceiptStore::open(&path).read_all().unwrap();
        assert!(restored.iter().any(|receipt| receipt["schema"] == "genos.population-state/v1"));
        let _ = std::fs::remove_file(path);
    }
}

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
        let receipts = report.biological_receipts.iter()
            .map(serde_json::to_value)
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| TickPersistenceError { report: report.clone(), message: error.to_string() })?;
        store.append_receipts(&receipts)
            .map_err(|message| TickPersistenceError { report: report.clone(), message })?;
        Ok(report)
    }
}

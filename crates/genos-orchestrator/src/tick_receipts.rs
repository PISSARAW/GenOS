use crate::planner::Concept;
use crate::tick::BiologicalExecutionReceipt;
use crate::GenosEcosystem;
use serde_json::json;
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;
impl GenosEcosystem {
    pub(crate) fn execution_receipt(
        &self,
        concept: Concept,
        consumed: bool,
        completed: bool,
    ) -> BiologicalExecutionReceipt {
        let cell_id = Some(self.orchestrator.orchestrator_id)
            .filter(|cell_id| self.orchestrator.active_cells.contains_key(cell_id));
        let genome_id = cell_id
            .and_then(|cell_id| self.orchestrator.active_cells.get(&cell_id)?.genome_id)
            .filter(|genome_id| self.orchestrator.genomes.contains_key(genome_id));
        let genome_fingerprint = genome_id
            .and_then(|genome_id| self.orchestrator.genomes.get(&genome_id))
            .and_then(|genome| genome.fingerprint().ok())
            .map(|fingerprint| fingerprint.content_hash);
        BiologicalExecutionReceipt {
            schema: "genos.biological-execution-receipt/v1".to_string(),
            receipt_id: Uuid::new_v4(),
            mission_id: self.mission_id,
            cell_id,
            genome_id,
            genome_fingerprint,
            population_json: None,
            tick: 0,
            execution_scope: "organism".to_string(),
            operation: format!("{concept:?}"),
            metabolic_register: "rust_orchestrator_metabolism".to_string(),
            cost: concept.cost(),
            cost_unit: "atp_token".to_string(),
            consumed,
            completed,
            observed_at_unix_ms: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis(),
        }
    }

    pub(crate) fn record_biological_receipt(&mut self, receipt: &BiologicalExecutionReceipt) {
        self.record_event(
            "BIOLOGICAL_EXECUTION_RECEIPT",
            json!({
                "schema": receipt.schema,
                "receiptId": receipt.receipt_id,
                "missionId": receipt.mission_id,
                "cellId": receipt.cell_id,
                "genomeId": receipt.genome_id,
                "genomeFingerprint": receipt.genome_fingerprint,
                "tick": receipt.tick,
                "executionScope": receipt.execution_scope,
                "operation": receipt.operation,
                "metabolicRegister": receipt.metabolic_register,
                "cost": receipt.cost,
                "costUnit": receipt.cost_unit,
                "consumed": receipt.consumed,
                "completed": receipt.completed,
                "observedAtUnixMs": receipt.observed_at_unix_ms
            }),
        );
    }
}

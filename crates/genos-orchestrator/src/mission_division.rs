//! Mission entrypoint for attested cell division with a durable receipt.

use crate::reproduction_cycle::{
    REPRODUCTION_ATP_COST, ReproductionBlocked, ReproductionOutcome,
};
use crate::GenosEcosystem;
use genos_store::BiologicalReceiptStore;
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct CellDivisionReceipt {
    pub schema: String,
    pub receipt_id: Uuid,
    pub mission_id: Uuid,
    pub parent_cell_id: Option<Uuid>,
    pub daughter_cell_id: Option<Uuid>,
    pub parent_genome_id: Option<Uuid>,
    pub daughter_genome_id: Option<Uuid>,
    pub lineage_id: Option<Uuid>,
    pub generation: Option<u32>,
    pub requested_cost: f64,
    pub consumed_cost: f64,
    pub cost_unit: String,
    pub completed: bool,
    pub reason: Option<String>,
    pub observed_at_unix_ms: u128,
}

#[derive(Debug)]
pub enum MissionDivisionError {
    MissionIdentityMissing,
    Persistence { receipt: CellDivisionReceipt, message: String },
}

struct DivisionReceiptInput {
    mission_id: Uuid,
    outcome: Result<ReproductionOutcome, ReproductionBlocked>,
    consumed_cost: f64,
}

impl GenosEcosystem {
    /// Divide the eligible cell during a mission and persist its measured receipt.
    pub fn divide_for_mission(
        &mut self,
        store: &BiologicalReceiptStore,
    ) -> Result<CellDivisionReceipt, MissionDivisionError> {
        let mission_id = self.mission_id.ok_or(MissionDivisionError::MissionIdentityMissing)?;
        let consumed_before = self.orchestrator.metabolism.consumed_total;
        let outcome = self.autonomous_reproduction_cycle();
        let consumed_cost = self.orchestrator.metabolism.consumed_total - consumed_before;
        let receipt = self.division_receipt(DivisionReceiptInput { mission_id, outcome, consumed_cost });
        let encoded = serde_json::to_value(&receipt).map_err(|error| {
            MissionDivisionError::Persistence { receipt: receipt.clone(), message: error.to_string() }
        })?;
        store.append_receipts(&[encoded]).map_err(|message| {
            MissionDivisionError::Persistence { receipt: receipt.clone(), message }
        })?;
        Ok(receipt)
    }

    fn division_receipt(&self, input: DivisionReceiptInput) -> CellDivisionReceipt {
        let DivisionReceiptInput { mission_id, outcome, consumed_cost } = input;
        let (parent_cell_id, daughter_cell_id, lineage_id, generation, reason) = match outcome {
            Ok(value) => (Some(value.mother_id), Some(value.daughter_id), Some(value.lineage_id), Some(value.generation), None),
            Err(reason) => (None, None, None, None, Some(format!("{reason:?}"))),
        };
        let parent_genome_id = parent_cell_id.and_then(|id| self.orchestrator.active_cells.get(&id))
            .and_then(|cell| cell.genome_id);
        let daughter_genome_id = daughter_cell_id.and_then(|id| self.orchestrator.active_cells.get(&id))
            .and_then(|cell| cell.genome_id);
        CellDivisionReceipt {
            schema: "genos.cell-division-receipt/v1".into(),
            receipt_id: Uuid::new_v4(), mission_id, parent_cell_id, daughter_cell_id,
            parent_genome_id, daughter_genome_id, lineage_id, generation,
            requested_cost: REPRODUCTION_ATP_COST, consumed_cost,
            cost_unit: "atp_token".into(), completed: daughter_cell_id.is_some(), reason,
            observed_at_unix_ms: SystemTime::now().duration_since(UNIX_EPOCH)
                .unwrap_or_default().as_millis(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn mission_division_returns_and_persists_parent_child_lineage() {
        let nonce = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
        let path = std::env::temp_dir().join(format!("genos-division-{nonce}.jsonl"));
        let store = BiologicalReceiptStore::open(&path);
        let mut ecosystem = GenosEcosystem::new("division-test");
        ecosystem.set_mission_id(Uuid::new_v4());
        ecosystem.seed_germline(ecosystem.orchestrator.orchestrator_id, "mission germline").unwrap();

        let receipt = ecosystem.divide_for_mission(&store).unwrap();

        assert!(receipt.completed);
        assert!(receipt.parent_cell_id.is_some() && receipt.daughter_cell_id.is_some());
        assert!(receipt.parent_genome_id.is_some() && receipt.daughter_genome_id.is_some());
        assert!(receipt.lineage_id.is_some() && receipt.generation.is_some());
        assert_eq!(receipt.consumed_cost, REPRODUCTION_ATP_COST);
        assert_eq!(store.read_all().unwrap()[0]["schema"], "genos.cell-division-receipt/v1");
        let _ = std::fs::remove_file(path);
    }
}

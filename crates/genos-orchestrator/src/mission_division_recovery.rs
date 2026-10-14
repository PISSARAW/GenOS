//! Restart recovery for a mission division and its population snapshot.

use crate::mission_division::{
    CellDivisionReceipt, DivisionStateBackup, MissionDivisionError,
};
use crate::GenosEcosystem;
use genos_store::BiologicalReceiptStore;
use serde::Serialize;
use serde_json::Value;
use uuid::Uuid;

const LINK_SCHEMA: &str = "genos.cell-division-recovery/v1";
const DIVISION_SCHEMA: &str = "genos.cell-division-receipt/v1";
const POPULATION_SCHEMA: &str = "genos.population-state/v1";

struct DivisionRollback {
    backup: DivisionStateBackup,
    receipt: CellDivisionReceipt,
}

impl GenosEcosystem {
    /// Persist division, its resulting population, and a link that gates recovery.
    pub fn divide_for_mission_with_snapshot(
        &mut self,
        store: &BiologicalReceiptStore,
        tick: u64,
    ) -> Result<CellDivisionReceipt, MissionDivisionError> {
        let backup = DivisionStateBackup::capture(self);
        let receipt = self.perform_mission_division()?;
        let encoded = match serde_json::to_value(&receipt) {
            Ok(encoded) => encoded,
            Err(error) => return rollback_division(self, DivisionRollback { backup, receipt }, error.to_string()),
        };
        let snapshot = match self.population_state_receipt(tick) {
            Ok(snapshot) => snapshot,
            Err(message) => return rollback_division(self, DivisionRollback { backup, receipt }, message),
        };
        let link = match division_link(&receipt, tick) {
            Ok(link) => link,
            Err(message) => return rollback_division(self, DivisionRollback { backup, receipt }, message),
        };
        if let Err(message) = store.append_receipts(&[encoded, snapshot, link]) {
            backup.restore(self);
            return Err(MissionDivisionError::Persistence { receipt, message });
        }
        Ok(receipt)
    }

    /// Restore only when a durable division receipt is paired with its population.
    pub fn restore_mission_division(
        &mut self,
        store: &BiologicalReceiptStore,
    ) -> Result<CellDivisionReceipt, String> {
        let entries = store.read_all()?;
        let (receipt, tick) = linked_division(&entries)?;
        if self.mission_id.is_some_and(|mission| mission != receipt.mission_id) {
            return Err("division mission mismatch".into());
        }
        validate_linked_snapshot(&entries, &receipt, tick)?;
        self.restore_population(store)?;
        validate_restored_division(self, &receipt)?;
        Ok(receipt)
    }
}

fn rollback_division(
    ecosystem: &mut GenosEcosystem,
    rollback: DivisionRollback,
    message: String,
) -> Result<CellDivisionReceipt, MissionDivisionError> {
    rollback.backup.restore(ecosystem);
    Err(MissionDivisionError::Persistence { receipt: rollback.receipt, message })
}

#[derive(Serialize)]
struct DivisionRecoveryLink {
    schema: &'static str,
    division_receipt_id: Uuid,
    mission_id: Uuid,
    tick: u64,
}

fn division_link(receipt: &CellDivisionReceipt, tick: u64) -> Result<Value, String> {
    serde_json::to_value(DivisionRecoveryLink {
        schema: LINK_SCHEMA,
        division_receipt_id: receipt.receipt_id,
        mission_id: receipt.mission_id,
        tick,
    }).map_err(|error| error.to_string())
}

fn linked_division(entries: &[Value]) -> Result<(CellDivisionReceipt, u64), String> {
    let (link_index, link) = latest_division_link(entries)?;
    let receipt = linked_receipt(entries, link_index, link)?;
    let tick = link["tick"].as_u64().ok_or("division snapshot tick missing")?;
    Ok((receipt, tick))
}

fn latest_division_link(entries: &[Value]) -> Result<(usize, &Value), String> {
    entries.iter().enumerate().rev()
        .find(|(_, item)| item["schema"] == LINK_SCHEMA)
        .ok_or_else(|| "division recovery link missing".to_string())
}

fn linked_receipt(
    entries: &[Value],
    link_index: usize,
    link: &Value,
) -> Result<CellDivisionReceipt, String> {
    let receipt_id = link["division_receipt_id"].as_str()
        .ok_or_else(|| "division receipt id missing".to_string())?;
    let receipt_value = entries[..link_index].iter().rev()
        .find(|item| item["schema"] == DIVISION_SCHEMA && item["receipt_id"] == receipt_id)
        .ok_or_else(|| "linked division receipt missing".to_string())?;
    let receipt: CellDivisionReceipt = serde_json::from_value(receipt_value.clone())
        .map_err(|error| error.to_string())?;
    if !receipt.completed || link["mission_id"] != receipt.mission_id.to_string() {
        return Err("division recovery link mismatch".into());
    }
    Ok(receipt)
}

fn validate_linked_snapshot(
    entries: &[Value],
    receipt: &CellDivisionReceipt,
    tick: u64,
) -> Result<(), String> {
    let snapshot = linked_population(entries, receipt, tick)?;
    validate_snapshot_ids(snapshot, "cell_id", [receipt.parent_cell_id, receipt.daughter_cell_id])?;
    validate_snapshot_ids(snapshot, "genome_id", [receipt.parent_genome_id, receipt.daughter_genome_id])
}

fn linked_population<'a>(
    entries: &'a [Value],
    receipt: &CellDivisionReceipt,
    tick: u64,
) -> Result<&'a Value, String> {
    let snapshot = entries.iter().rev()
        .find(|item| item["schema"] == POPULATION_SCHEMA)
        .ok_or_else(|| "division population snapshot missing".to_string())?;
    if snapshot["tick"] != tick || snapshot["mission_id"] != receipt.mission_id.to_string() {
        return Err("division population snapshot mismatch".into());
    }
    Ok(snapshot)
}

fn validate_snapshot_ids(
    snapshot: &Value,
    key: &str,
    expected_ids: [Option<Uuid>; 2],
) -> Result<(), String> {
    for id in expected_ids {
        if !snapshot_contains(snapshot, key, id.map(|value| value.to_string()))? {
            return Err(format!("division population does not contain linked {key}s"));
        }
    }
    Ok(())
}

fn snapshot_contains(snapshot: &Value, key: &str, expected: Option<String>) -> Result<bool, String> {
    let expected = expected.ok_or_else(|| "division receipt is missing lineage identity".to_string())?;
    let entries = snapshot["active_cells"].as_array()
        .ok_or_else(|| "division population cells missing".to_string())?;
    Ok(entries.iter().any(|cell| cell[key] == expected))
}

fn validate_restored_division(
    ecosystem: &GenosEcosystem,
    receipt: &CellDivisionReceipt,
) -> Result<(), String> {
    let identity = division_identity(receipt)?;
    validate_restored_cells(ecosystem, &identity)?;
    validate_genome_lineage(ecosystem, identity.parent_genome, receipt)?;
    validate_genome_lineage(ecosystem, identity.daughter_genome, receipt)?;
    validate_daughter_generation(ecosystem, identity.daughter_genome, receipt)
}

struct DivisionIdentity {
    parent_cell: Uuid,
    daughter_cell: Uuid,
    parent_genome: Uuid,
    daughter_genome: Uuid,
}

fn division_identity(receipt: &CellDivisionReceipt) -> Result<DivisionIdentity, String> {
    Ok(DivisionIdentity {
        parent_cell: receipt.parent_cell_id.ok_or("division parent missing")?,
        daughter_cell: receipt.daughter_cell_id.ok_or("division daughter missing")?,
        parent_genome: receipt.parent_genome_id.ok_or("division parent genome missing")?,
        daughter_genome: receipt.daughter_genome_id.ok_or("division daughter genome missing")?,
    })
}

fn validate_restored_cells(
    ecosystem: &GenosEcosystem,
    identity: &DivisionIdentity,
) -> Result<(), String> {
    let parent = ecosystem.orchestrator.active_cells.get(&identity.parent_cell)
        .ok_or("restored division parent missing")?;
    let daughter = ecosystem.orchestrator.active_cells.get(&identity.daughter_cell)
        .ok_or("restored division daughter missing")?;
    if parent.genome_id != Some(identity.parent_genome)
        || daughter.genome_id != Some(identity.daughter_genome)
    {
        return Err("restored division genome identity mismatch".into());
    }
    Ok(())
}

fn validate_genome_lineage(
    ecosystem: &GenosEcosystem,
    genome_id: Uuid,
    receipt: &CellDivisionReceipt,
) -> Result<(), String> {
    let genome = ecosystem.orchestrator.genomes.get(&genome_id)
        .ok_or("restored division genome missing")?;
    if Some(genome.lineage_id()) != receipt.lineage_id {
        return Err("restored division lineage mismatch".into());
    }
    Ok(())
}

fn validate_daughter_generation(
    ecosystem: &GenosEcosystem,
    genome_id: Uuid,
    receipt: &CellDivisionReceipt,
) -> Result<(), String> {
    let genome = ecosystem.orchestrator.genomes.get(&genome_id)
        .ok_or("restored division daughter genome missing")?;
    if Some(genome.generation) != receipt.generation {
        return Err("restored division generation mismatch".into());
    }
    Ok(())
}

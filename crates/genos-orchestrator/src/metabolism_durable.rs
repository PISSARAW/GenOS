//! Mission-bound metabolic commits stored with the population snapshot.

use crate::metabolism::{consume_cell_pool, MissionMetabolicPoolDemand, MissionMetabolicPoolReceipt};
use crate::GenosEcosystem;
use genos_store::BiologicalReceiptStore;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

const POPULATION_SCHEMA: &str = "genos.population-state/v1";

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct MissionMetabolicPoolCommand {
    pub idempotency_key: String,
    pub tick: u64,
    pub demand: MissionMetabolicPoolDemand,
}

impl GenosEcosystem {
    /// Commits the changed cell pool and its idempotency receipt in one journal line.
    /// Population recovery then restores the exact post-operation cell state.
    pub fn consume_mission_metabolic_pool_durable(
        &mut self,
        store: &BiologicalReceiptStore,
        command: MissionMetabolicPoolCommand,
    ) -> Result<MissionMetabolicPoolReceipt, String> {
        let mission_id = self.mission_id.ok_or("mission required for metabolic pool consumption")?;
        validate_key(&command.idempotency_key)?;
        if let Some(previous) = existing_receipt(store, mission_id, &command)? {
            return Ok(previous);
        }
        let (receipt, previous_pool) = apply_demand(self, mission_id, &command)?;
        persist_commit(self, PendingCommit { store, command: &command, receipt: &receipt, previous_pool })?;
        self.record_event("MISSION_METABOLIC_POOL_RECEIPT", serde_json::to_value(&receipt).map_err(|error| error.to_string())?);
        Ok(receipt)
    }
}

struct PendingCommit<'a> {
    store: &'a BiologicalReceiptStore,
    command: &'a MissionMetabolicPoolCommand,
    receipt: &'a MissionMetabolicPoolReceipt,
    previous_pool: genos_cell::autopoiesis::MetabolicPool,
}

fn existing_receipt(
    store: &BiologicalReceiptStore,
    mission_id: Uuid,
    command: &MissionMetabolicPoolCommand,
) -> Result<Option<MissionMetabolicPoolReceipt>, String> {
    store.find_idempotent_receipt(POPULATION_SCHEMA, &command.idempotency_key)?
        .map(|snapshot| replay_receipt(snapshot, mission_id, command))
        .transpose()
}

fn apply_demand(
    ecosystem: &mut GenosEcosystem,
    mission_id: Uuid,
    command: &MissionMetabolicPoolCommand,
) -> Result<(MissionMetabolicPoolReceipt, genos_cell::autopoiesis::MetabolicPool), String> {
    let cell = ecosystem.orchestrator.active_cells.get_mut(&command.demand.cell_id)
        .ok_or("metabolic pool cell is not active")?;
    let previous_pool = cell.metabolism.clone();
    let (before, accepted, refusal_reason) = consume_cell_pool(cell, &command.demand);
    let receipt = MissionMetabolicPoolReceipt {
        schema: "genos.mission-metabolic-pool-receipt/v1".into(),
        mission_id,
        cell_id: command.demand.cell_id,
        operation: command.demand.operation.clone(),
        requested_amino_acids: valid_amount(command.demand.amino_acids),
        amino_acids_before: before,
        amino_acids_after: cell.metabolism.amino_acids,
        accepted,
        refusal_reason,
    };
    Ok((receipt, previous_pool))
}

fn persist_commit(ecosystem: &mut GenosEcosystem, pending: PendingCommit<'_>) -> Result<(), String> {
    let snapshot = match operation_snapshot(ecosystem, pending.command, pending.receipt) {
        Ok(snapshot) => snapshot,
        Err(error) => {
            restore_pool(ecosystem, pending.command.demand.cell_id, pending.previous_pool)?;
            return Err(error);
        }
    };
    if let Err(error) = pending.store.append_idempotent_receipt(&snapshot) {
        restore_pool(ecosystem, pending.command.demand.cell_id, pending.previous_pool)?;
        return Err(error);
    }
    Ok(())
}

fn operation_snapshot(
    ecosystem: &GenosEcosystem,
    command: &MissionMetabolicPoolCommand,
    receipt: &MissionMetabolicPoolReceipt,
) -> Result<Value, String> {
    let mut snapshot = ecosystem.population_state_receipt(command.tick)?;
    attach_operation(&mut snapshot, &command.idempotency_key, receipt)?;
    Ok(snapshot)
}

fn validate_key(key: &str) -> Result<(), String> {
    if key.trim().is_empty() { return Err("metabolic pool idempotency key is required".into()); }
    Ok(())
}

fn attach_operation(
    snapshot: &mut Value,
    key: &str,
    receipt: &MissionMetabolicPoolReceipt,
) -> Result<(), String> {
    snapshot["idempotency_key"] = Value::String(key.to_string());
    snapshot["metabolic_operation"] = serde_json::to_value(receipt).map_err(|error| error.to_string())?;
    Ok(())
}

fn replay_receipt(
    snapshot: Value,
    mission_id: Uuid,
    command: &MissionMetabolicPoolCommand,
) -> Result<MissionMetabolicPoolReceipt, String> {
    if snapshot["mission_id"] != mission_id.to_string()
        || snapshot["idempotency_key"] != command.idempotency_key
        || snapshot["tick"] != command.tick
    {
        return Err("metabolic pool idempotency receipt identity mismatch".into());
    }
    let receipt: MissionMetabolicPoolReceipt = serde_json::from_value(snapshot["metabolic_operation"].clone())
        .map_err(|error| format!("metabolic pool receipt is incomplete: {error}"))?;
    if receipt.mission_id != mission_id
        || receipt.cell_id != command.demand.cell_id
        || receipt.operation != command.demand.operation
        || receipt.requested_amino_acids != valid_amount(command.demand.amino_acids)
    {
        return Err("metabolic pool idempotency key conflicts with this operation".into());
    }
    Ok(receipt)
}

fn restore_pool(
    ecosystem: &mut GenosEcosystem,
    cell_id: Uuid,
    pool: genos_cell::autopoiesis::MetabolicPool,
) -> Result<(), String> {
    let cell = ecosystem.orchestrator.active_cells.get_mut(&cell_id)
        .ok_or("metabolic pool rollback cell is no longer active")?;
    cell.metabolism = pool;
    Ok(())
}

fn valid_amount(amount: f64) -> f64 {
    if amount.is_finite() && amount >= 0.0 { amount } else { 0.0 }
}

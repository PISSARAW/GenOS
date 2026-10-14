//! Mission-bound guard-cell backpressure with durable replay.

use crate::metabolism::{consume_cell_pool, MissionMetabolicPoolDemand};
use crate::GenosEcosystem;
use genos_biology::{StomatalPore, ThrottleResult};
use genos_store::BiologicalReceiptStore;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

const SNAPSHOT_SCHEMA: &str = "genos.population-state/v1";
const RECEIPT_SCHEMA: &str = "genos.guard-cell-mission-flux/v1";

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct MissionGuardFluxCommand {
    pub idempotency_key: String,
    pub tick: u64,
    pub requested_flux: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MissionGuardFluxReceipt {
    pub schema: String,
    pub mission_id: Uuid,
    pub idempotency_key: String,
    pub tick: u64,
    pub cell_id: Uuid,
    pub requested_flux: f64,
    pub result: ThrottleResult,
    pub resource_availability: f64,
    pub atp_available_before: f64,
    pub atp_cost: f64,
    pub amino_acids_before: f64,
    pub amino_acids_after: f64,
    pub accepted: bool,
    pub refusal_reason: Option<String>,
    pub guard_state_after: StomatalPore,
}

impl GenosEcosystem {
    /// Runs the guard-cell control, debits the root-cell pool, and commits state plus receipt.
    pub fn throttle_flux_for_mission_durable(
        &mut self,
        store: &BiologicalReceiptStore,
        command: MissionGuardFluxCommand,
    ) -> Result<MissionGuardFluxReceipt, String> {
        let mission_id = self.mission_id.ok_or("mission required for guard-cell flux")?;
        validate_command(&command)?;
        if let Some(receipt) = replay(store, mission_id, &command)? {
            self.guard_cell = receipt.guard_state_after.clone();
            return Ok(receipt);
        }
        let receipt = execute_flux(self, GuardExecution { store, mission_id, command })?;
        self.record_event("GUARD_CELL_FLUX_DURABLE", serde_json::to_value(&receipt).map_err(|error| error.to_string())?);
        Ok(receipt)
    }

    /// Restores the pore state committed with the latest population snapshot.
    pub fn restore_guard_cell_state(&mut self, store: &BiologicalReceiptStore) -> Result<(), String> {
        let mission_id = self.mission_id.ok_or("mission required for guard-cell recovery")?;
        let snapshot = guard_state_snapshot(store, mission_id)?;
        let receipt: MissionGuardFluxReceipt = serde_json::from_value(snapshot["guard_flux_operation"].clone())
            .map_err(|error| format!("guard-cell operation receipt missing or invalid: {error}"))?;
        validate_guard_snapshot(&snapshot, &receipt, mission_id)?;
        let state: StomatalPore = serde_json::from_value(snapshot["guard_cell_state"].clone())
            .map_err(|error| format!("guard-cell state missing or invalid: {error}"))?;
        let atp_state: crate::metabolism::MetabolismCheckpoint = serde_json::from_value(snapshot["guard_atp_state"].clone())
            .map_err(|error| format!("guard-cell ATP state missing or invalid: {error}"))?;
        self.orchestrator.metabolism.restore_checkpoint(atp_state)?;
        self.guard_cell = state;
        Ok(())
    }
}

fn guard_state_snapshot(store: &BiologicalReceiptStore, mission_id: Uuid) -> Result<Value, String> {
    store.read_all()?.into_iter().rev()
        .find(|item| item["schema"] == SNAPSHOT_SCHEMA
            && item["mission_id"] == mission_id.to_string()
            && !item["guard_flux_operation"].is_null())
        .ok_or_else(|| "guard-cell mission snapshot missing".into())
}

fn validate_guard_snapshot(snapshot: &Value, receipt: &MissionGuardFluxReceipt, mission_id: Uuid) -> Result<(), String> {
    let guard_state = serde_json::to_value(&receipt.guard_state_after).map_err(|error| error.to_string())?;
    if receipt.schema != RECEIPT_SCHEMA
        || receipt.mission_id != mission_id
        || snapshot["mission_id"] != mission_id.to_string()
        || snapshot["tick"] != receipt.tick
        || snapshot["idempotency_key"] != receipt.idempotency_key
        || snapshot["guard_cell_state"] != guard_state
    {
        return Err("guard-cell recovery snapshot identity mismatch".into());
    }
    Ok(())
}

struct GuardFluxPlan {
    mission_id: Uuid,
    command: MissionGuardFluxCommand,
    cell_id: Uuid,
    atp_before: f64,
    pool_before: f64,
    availability: f64,
    cost: f64,
    pore_before: StomatalPore,
    candidate: StomatalPore,
    checkpoint: crate::metabolism::MetabolismCheckpoint,
    result: ThrottleResult,
}

struct GuardExecution<'a> {
    store: &'a BiologicalReceiptStore,
    mission_id: Uuid,
    command: MissionGuardFluxCommand,
}

fn execute_flux(eco: &mut GenosEcosystem, execution: GuardExecution<'_>) -> Result<MissionGuardFluxReceipt, String> {
    let plan = plan_flux(eco, execution.mission_id, execution.command)?;
    let Some(receipt) = apply_flux(eco, &plan)? else { return Err("guard flux ATP changed during single-threaded commit".into()); };
    if let Err(error) = persist(eco, execution.store, &receipt) {
        rollback(eco, &plan)?;
        return Err(error);
    }
    Ok(receipt)
}

fn plan_flux(eco: &mut GenosEcosystem, mission_id: Uuid, command: MissionGuardFluxCommand) -> Result<GuardFluxPlan, String> {
    let pore_before = eco.guard_cell.clone();
    let cell_id = eco.orchestrator.orchestrator_id;
    let atp_before = eco.atp();
    let checkpoint = eco.orchestrator.metabolism.checkpoint();
    let pool_before = cell_pool(eco, cell_id)?;
    let availability = availability(atp_before, eco.orchestrator.metabolism.capacity, pool_before);
    let mut candidate = pore_before.clone();
    candidate.regulate(availability, 1.0 - availability);
    let result = candidate.throttle_flux(command.requested_flux);
    let cost = result.admitted_flux.max(0.0) * 0.01;
    Ok(GuardFluxPlan { mission_id, command, cell_id, atp_before, pool_before, availability, cost, pore_before, candidate, checkpoint, result })
}

fn apply_flux(eco: &mut GenosEcosystem, plan: &GuardFluxPlan) -> Result<Option<MissionGuardFluxReceipt>, String> {
    if plan.command.requested_flux > 0.0 && plan.result.admitted_flux == 0.0 {
        return Ok(Some(refused_receipt(plan, "guard-cell backpressure admitted no flux".into())));
    }
    if let Some(reason) = refusal_reason(&plan.command, plan.atp_before, plan.cost) {
        return Ok(Some(refused_receipt(plan, reason)));
    }
    let (accepted, refusal) = debit_pool(eco, plan)?;
    if accepted && !eco.orchestrator.metabolism.consumption_receipts.last().is_some_and(|entry| entry.accepted) {
        rollback(eco, plan)?;
        return Ok(None);
    }
    Ok(Some(receipt_after_flux(eco, ReceiptAfterFlux { plan, accepted, refusal })?))
}

fn debit_pool(eco: &mut GenosEcosystem, plan: &GuardFluxPlan) -> Result<(bool, Option<String>), String> {
    let demand = MissionMetabolicPoolDemand { cell_id: plan.cell_id, operation: "guard_cell.admitted_flux".into(), amino_acids: plan.cost };
    let cell = eco.orchestrator.active_cells.get_mut(&plan.cell_id).ok_or("guard cell pool is not active")?;
    let (_, accepted, refusal) = consume_cell_pool(cell, &demand);
    if !accepted { return Ok((false, refusal)); }
    if !eco.orchestrator.metabolism.consume_for("guard_cell.admitted_flux", plan.cost) {
        rollback(eco, plan)?;
        return Err("guard flux ATP changed during single-threaded commit".into());
    }
    eco.guard_cell = plan.candidate.clone();
    Ok((true, None))
}

struct ReceiptAfterFlux<'a> {
    plan: &'a GuardFluxPlan,
    accepted: bool,
    refusal: Option<String>,
}

fn receipt_after_flux(eco: &GenosEcosystem, input: ReceiptAfterFlux<'_>) -> Result<MissionGuardFluxReceipt, String> {
    let plan = input.plan;
    let mut result = plan.result.clone();
    if !input.accepted { close_flux(&mut result, plan.command.requested_flux); }
    let amino_after = cell_pool(eco, plan.cell_id)?;
    let draft = GuardReceiptDraft { mission_id: plan.mission_id, cell_id: plan.cell_id, command: &plan.command, availability: plan.availability, atp_before: plan.atp_before, cost: plan.cost, amino_before: plan.pool_before, amino_after, accepted: input.accepted, refusal: input.refusal, guard_state: eco.guard_cell.clone() };
    Ok(make_receipt(draft, result))
}

fn refused_receipt(plan: &GuardFluxPlan, reason: String) -> MissionGuardFluxReceipt {
    let mut result = plan.result.clone();
    close_flux(&mut result, plan.command.requested_flux);
    let draft = GuardReceiptDraft { mission_id: plan.mission_id, cell_id: plan.cell_id, command: &plan.command, availability: plan.availability, atp_before: plan.atp_before, cost: plan.cost, amino_before: plan.pool_before, amino_after: plan.pool_before, accepted: false, refusal: Some(reason), guard_state: plan.pore_before.clone() };
    make_receipt(draft, result)
}

fn rollback(eco: &mut GenosEcosystem, plan: &GuardFluxPlan) -> Result<(), String> {
    restore(eco, GuardRollback { pore: plan.pore_before.clone(), checkpoint: plan.checkpoint.clone(), cell_id: plan.cell_id, amino_acids: plan.pool_before })
}

fn validate_command(command: &MissionGuardFluxCommand) -> Result<(), String> {
    if command.idempotency_key.trim().is_empty() { return Err("guard-cell idempotency key is required".into()); }
    if !command.requested_flux.is_finite() || command.requested_flux < 0.0 {
        return Err("guard-cell flux must be finite and non-negative".into());
    }
    Ok(())
}

fn replay(store: &BiologicalReceiptStore, mission_id: Uuid, command: &MissionGuardFluxCommand) -> Result<Option<MissionGuardFluxReceipt>, String> {
    let Some(snapshot) = store.find_idempotent_receipt(SNAPSHOT_SCHEMA, &command.idempotency_key)? else { return Ok(None); };
    if snapshot["mission_id"] != mission_id.to_string() || snapshot["tick"] != command.tick {
        return Err("guard-cell idempotency receipt identity mismatch".into());
    }
    let receipt: MissionGuardFluxReceipt = serde_json::from_value(snapshot["guard_flux_operation"].clone())
        .map_err(|error| format!("guard-cell receipt incomplete: {error}"))?;
    if receipt.requested_flux != command.requested_flux || receipt.idempotency_key != command.idempotency_key {
        return Err("guard-cell idempotency key conflicts with this operation".into());
    }
    Ok(Some(receipt))
}

fn cell_pool(eco: &GenosEcosystem, cell_id: Uuid) -> Result<f64, String> {
    eco.orchestrator.active_cells.get(&cell_id).map(|cell| cell.metabolism.amino_acids)
        .ok_or_else(|| "guard-cell metabolic pool is not active".into())
}

fn availability(atp: f64, atp_capacity: f64, amino_acids: f64) -> f64 {
    let atp_ratio = if atp_capacity.is_finite() && atp_capacity > 0.0 { (atp / atp_capacity).clamp(0.0, 1.0) } else { 0.0 };
    let pool_ratio = if amino_acids.is_finite() { (amino_acids / 100.0).clamp(0.0, 1.0) } else { 0.0 };
    atp_ratio.min(pool_ratio)
}

fn refusal_reason(command: &MissionGuardFluxCommand, atp: f64, cost: f64) -> Option<String> {
    if !command.requested_flux.is_finite() { return Some("invalid requested flux".into()); }
    if atp + 1e-9 < cost { return Some("insufficient ATP energy reserve".into()); }
    None
}

fn close_flux(result: &mut ThrottleResult, requested: f64) {
    result.admitted_flux = 0.0;
    result.throttled_flux = requested;
    result.backpressure_active = true;
    result.status = "STOMATA_CLOSED_METABOLIC_POOL_REFUSED".into();
}

struct GuardReceiptDraft<'a> {
    mission_id: Uuid,
    cell_id: Uuid,
    command: &'a MissionGuardFluxCommand,
    availability: f64,
    atp_before: f64,
    cost: f64,
    amino_before: f64,
    amino_after: f64,
    accepted: bool,
    refusal: Option<String>,
    guard_state: StomatalPore,
}

fn make_receipt(draft: GuardReceiptDraft<'_>, result: ThrottleResult) -> MissionGuardFluxReceipt {
    MissionGuardFluxReceipt { schema: RECEIPT_SCHEMA.into(), mission_id: draft.mission_id, idempotency_key: draft.command.idempotency_key.clone(), tick: draft.command.tick, cell_id: draft.cell_id, requested_flux: draft.command.requested_flux, result, resource_availability: draft.availability, atp_available_before: draft.atp_before, atp_cost: if draft.accepted { draft.cost } else { 0.0 }, amino_acids_before: draft.amino_before, amino_acids_after: draft.amino_after, accepted: draft.accepted, refusal_reason: draft.refusal, guard_state_after: draft.guard_state }
}

fn persist(eco: &GenosEcosystem, store: &BiologicalReceiptStore, receipt: &MissionGuardFluxReceipt) -> Result<(), String> {
    let mut snapshot = eco.population_state_receipt(receipt.tick)?;
    snapshot["idempotency_key"] = Value::String(receipt.idempotency_key.clone());
    snapshot["guard_flux_operation"] = serde_json::to_value(receipt).map_err(|error| error.to_string())?;
    snapshot["guard_cell_state"] = serde_json::to_value(&eco.guard_cell).map_err(|error| error.to_string())?;
    snapshot["guard_atp_state"] = serde_json::to_value(eco.orchestrator.metabolism.checkpoint()).map_err(|error| error.to_string())?;
    store.append_idempotent_receipt(&snapshot)?;
    Ok(())
}

struct GuardRollback {
    pore: StomatalPore,
    checkpoint: crate::metabolism::MetabolismCheckpoint,
    cell_id: Uuid,
    amino_acids: f64,
}

fn restore(eco: &mut GenosEcosystem, rollback: GuardRollback) -> Result<(), String> {
    eco.guard_cell = rollback.pore;
    eco.orchestrator.metabolism.restore_checkpoint(rollback.checkpoint)?;
    eco.orchestrator.active_cells.get_mut(&rollback.cell_id).ok_or("guard rollback cell is inactive")?.metabolism.amino_acids = rollback.amino_acids;
    Ok(())
}

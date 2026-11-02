use super::{Binding, Event, Store, digest};
use super::process::ProcessReceipt;
#[path = "allostasis_store.rs"]
mod data;
use data::{integer, sql};
use rusqlite::{OptionalExtension, Transaction, params};
use serde::{Deserialize, Serialize};
use serde_json::json;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct Limits { pub process_slots: u64, pub wall_ms: u64 }

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct Allocation { pub allocation_id: String, pub limits: Limits, pub protected_slots: u64, pub protected_ms: u64 }

pub struct Exposure<'a> { pub allocation_id: &'a str, pub operation_id: &'a str, pub maximum_ms: u64 }

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct ExposureReceipt { pub operation_id: String, pub status: String, pub new_dispatch_authorized: bool }

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct UsageReceipt { pub operation_id: String, pub elapsed_ms: u64, pub pid: u32, pub receipt_hash: String }

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct State { pub spent_ms: u64, pub held_ms: u64, pub active_slots: u64, pub observed_processes: u64, pub released: bool }

pub fn reserve(store: &mut Store, binding: &Binding, limits: Limits) -> Result<Allocation, String> {
    let allocation = allocation(binding, limits)?;
    store.transaction(binding, |tx| reserve_tx(tx, binding, &allocation))
}

fn allocation(binding: &Binding, limits: Limits) -> Result<Allocation, String> {
    if limits.process_slots < 2 || limits.wall_ms < 2 { return Err("ALLOSTASIS_PROTECTED_RESERVE_REQUIRED".into()); }
    integer(limits.process_slots)?; integer(limits.wall_ms)?;
    Ok(Allocation { allocation_id: data::scope(binding)?, protected_slots: limits.process_slots.div_ceil(20),
        protected_ms: limits.wall_ms.div_ceil(20), limits })
}

fn reserve_tx(tx: &Transaction<'_>, binding: &Binding, allocation: &Allocation) -> Result<Allocation, String> {
    data::ensure(tx)?;
    let previous = pool_limits(tx, &allocation.allocation_id)?;
    if let Some(value) = previous {
        if value != (digest(binding)?, allocation.limits.process_slots, allocation.limits.wall_ms) {
            return Err("ALLOSTASIS_ALLOCATION_CONFLICT".into());
        }
        return Ok(allocation.clone());
    }
    insert_pool(tx, binding, allocation)?;
    Store::event(tx, binding, Event { protocol: "ALLOSTASIS", phase: "ALLOCATE", payload: json!(allocation) })?;
    Ok(allocation.clone())
}

fn pool_limits(tx: &Transaction<'_>, id: &str) -> Result<Option<(String,u64,u64)>, String> {
    sql(tx.query_row("SELECT binding_hash,slots,wall_ms FROM protocol_allostasis_pools WHERE scope=$1", [id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?))).optional())
}

fn insert_pool(tx: &Transaction<'_>, binding: &Binding, allocation: &Allocation) -> Result<(), String> {
    let history = data::history(tx, binding)?;
    data::limit_transfer(tx, (binding, allocation.limits.process_slots, allocation.limits.wall_ms))?;
    sql(tx.execute("INSERT INTO protocol_allostasis_pools(scope,mission_id,binding_hash,slots,wall_ms,reserve_slots,reserve_ms,baseline_ms,baseline_processes)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)", params![allocation.allocation_id, binding.mission_id, digest(binding)?, allocation.limits.process_slots,
        allocation.limits.wall_ms, allocation.protected_slots, allocation.protected_ms, history.0, history.1]))?;
    Ok(())
}

pub fn expose(store: &mut Store, binding: &Binding, input: Exposure<'_>) -> Result<ExposureReceipt, String> {
    if input.operation_id.trim().is_empty() || input.maximum_ms == 0 { return Err("ALLOSTASIS_EXPOSURE_INVALID".into()); }
    integer(input.maximum_ms)?;
    store.transaction(binding, |tx| expose_tx(tx, binding, &input))
}

fn expose_tx(tx: &Transaction<'_>, binding: &Binding, input: &Exposure<'_>) -> Result<ExposureReceipt, String> {
    data::ensure(tx)?;
    let key = data::assert_pool(tx, binding)?;
    if key != input.allocation_id { return Err("ALLOSTASIS_ALLOCATION_MISMATCH".into()); }
    let previous: Option<(u64, String)> = sql(tx.query_row("SELECT maximum_ms,status FROM protocol_allostasis_exposures
        WHERE scope=$1 AND operation_id=$2", params![key, input.operation_id], |row| Ok((row.get(0)?, row.get(1)?))).optional())?;
    if let Some((maximum, status)) = previous { return exposure_replay(input, (maximum, status)); }
    create_exposure(tx, binding, input)
}

fn exposure_replay(input: &Exposure<'_>, previous: (u64,String)) -> Result<ExposureReceipt, String> {
    if previous.0 != input.maximum_ms { return Err("ALLOSTASIS_EXPOSURE_CONFLICT".into()); }
    Ok(ExposureReceipt { operation_id: input.operation_id.into(), status: previous.1, new_dispatch_authorized: false })
}

fn create_exposure(tx: &Transaction<'_>, binding: &Binding, input: &Exposure<'_>) -> Result<ExposureReceipt, String> {
    data::history(tx, binding)?;
    let key = data::scope(binding)?;
    let changed = sql(tx.execute("UPDATE protocol_allostasis_pools SET held_ms=held_ms+$1,active_slots=active_slots+1
        WHERE scope=$2 AND released=0 AND active_slots+1<=slots-reserve_slots
        AND observed_processes+baseline_processes+active_slots<3
        AND $3<=wall_ms-reserve_ms-baseline_ms-spent_ms-held_ms", params![input.maximum_ms, key, input.maximum_ms]))?;
    if changed != 1 { return Err("ALLOSTASIS_BUDGET_UNAVAILABLE".into()); }
    sql(tx.execute("INSERT INTO protocol_allostasis_exposures(scope,operation_id,maximum_ms,status)
        VALUES($1,$2,$3,'exposed')", params![key, input.operation_id, input.maximum_ms]))?;
    let receipt = ExposureReceipt { operation_id: input.operation_id.into(), status: "exposed".into(), new_dispatch_authorized: true };
    Store::event(tx, binding, Event { protocol: "ALLOSTASIS", phase: "EXPOSE", payload: json!(receipt) })?;
    Ok(receipt)
}

pub fn settle(store: &mut Store, binding: &Binding, receipt: &ProcessReceipt) -> Result<UsageReceipt, String> {
    receipt.assert_observation(binding)?;
    let hash = digest(receipt)?;
    let result = UsageReceipt { operation_id: receipt.operation_id().into(), elapsed_ms: receipt.elapsed_ms(),
        pid: receipt.pid(), receipt_hash: hash };
    store.observation_transaction(binding, |tx| {
        data::ensure(tx)?;
        let key = data::assert_pool(tx, binding)?;
        let previous: Option<String> = sql(tx.query_row("SELECT receipt_hash FROM protocol_allostasis_exposures
            WHERE scope=$1 AND operation_id=$2", params![key, receipt.operation_id()], |row| row.get(0)))?;
        if let Some(hash) = previous {
            if hash != result.receipt_hash { return Err("ALLOSTASIS_RECEIPT_CONFLICT".into()); }
            return Ok(result.clone());
        }
        data::record_usage(tx, (&key, receipt.operation_id()), (&result.receipt_hash, result.elapsed_ms, result.pid))?;
        Store::event(tx, binding, Event { protocol: "ALLOSTASIS", phase: "USAGE_OBSERVED", payload: json!(result) })?;
        Ok(result.clone())
    })
}

pub fn unknown(store: &mut Store, binding: &Binding, operation_id: &str) -> Result<(), String> {
    store.observation_transaction(binding, |tx| {
        data::ensure(tx)?; let key = data::assert_pool(tx, binding)?;
        let changed = sql(tx.execute("UPDATE protocol_allostasis_exposures SET status='unknown'
            WHERE scope=$1 AND operation_id=$2 AND status='exposed'", params![key, operation_id]))?;
        let exists: bool = sql(tx.query_row("SELECT EXISTS(SELECT 1 FROM protocol_allostasis_exposures
            WHERE scope=$1 AND operation_id=$2)", params![key, operation_id], |row| row.get(0)))?;
        if !exists { return Err("ALLOSTASIS_EXPOSURE_REQUIRED".into()); }
        if changed == 1 { Store::event(tx, binding, Event { protocol: "ALLOSTASIS", phase: "OUTCOME_UNKNOWN", payload: json!({"operation_id":operation_id}) })?; }
        Ok(())
    })
}

pub fn state(store: &mut Store, binding: &Binding) -> Result<State, String> {
    store.observation_transaction(binding, |tx| {
        data::ensure(tx)?; let key = data::assert_pool(tx, binding)?;
        sql(tx.query_row("SELECT spent_ms+baseline_ms,held_ms,active_slots,observed_processes+baseline_processes,released
            FROM protocol_allostasis_pools WHERE scope=$1", [key], |row| Ok(State { spent_ms: row.get(0)?, held_ms: row.get(1)?,
            active_slots: row.get(2)?, observed_processes: row.get(3)?, released: row.get(4)? })))
    })
}

pub fn release(store: &mut Store, binding: &Binding, allocation_id: &str) -> Result<State, String> {
    store.observation_transaction(binding, |tx| {
        data::ensure(tx)?; let key = data::assert_pool(tx, binding)?;
        if key != allocation_id { return Err("ALLOSTASIS_ALLOCATION_MISMATCH".into()); }
        let unresolved: u64 = sql(tx.query_row("SELECT COUNT(*) FROM protocol_allostasis_exposures
            WHERE scope=$1 AND status!='settled'", [&key], |row| row.get(0)))?;
        if unresolved != 0 { return Err("ALLOSTASIS_RECONCILIATION_REQUIRED".into()); }
        let changed = sql(tx.execute("UPDATE protocol_allostasis_pools SET released=1 WHERE scope=$1 AND released=0", [&key]))?;
        if changed == 1 { Store::event(tx, binding, Event { protocol: "ALLOSTASIS", phase: "RELEASE",
            payload: json!({"allocation_id":key,"consumption_refunded":false}) })?; }
        Ok(())
    })?;
    state(store, binding)
}

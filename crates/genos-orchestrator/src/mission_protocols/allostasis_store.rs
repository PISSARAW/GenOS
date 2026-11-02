use super::{Binding, digest};
use rusqlite::{Transaction, params};

pub(super) fn scope(binding: &Binding) -> Result<String, String> {
    digest(&(&binding.mission_id, &binding.run_id, &binding.actor_id))
}

pub(super) fn sql<T>(result: rusqlite::Result<T>) -> Result<T, String> {
    result.map_err(|error| error.to_string())
}

pub(super) fn integer(value: u64) -> Result<i64, String> {
    i64::try_from(value).map_err(|_| "ALLOSTASIS_AMOUNT_OUT_OF_RANGE".into())
}

pub(super) fn ensure(tx: &Transaction<'_>) -> Result<(), String> {
    sql(tx.execute_batch("CREATE TABLE IF NOT EXISTS protocol_allostasis_pools(
        scope TEXT PRIMARY KEY,mission_id TEXT NOT NULL,binding_hash TEXT NOT NULL,slots INTEGER NOT NULL,wall_ms INTEGER NOT NULL,
        reserve_slots INTEGER NOT NULL,reserve_ms INTEGER NOT NULL,held_ms INTEGER NOT NULL DEFAULT 0,
        spent_ms INTEGER NOT NULL DEFAULT 0,active_slots INTEGER NOT NULL DEFAULT 0,
        observed_processes INTEGER NOT NULL DEFAULT 0,released INTEGER NOT NULL DEFAULT 0,
        baseline_ms INTEGER NOT NULL DEFAULT 0,baseline_processes INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS protocol_allostasis_exposures(
        scope TEXT NOT NULL,operation_id TEXT NOT NULL,maximum_ms INTEGER NOT NULL,status TEXT NOT NULL,
        elapsed_ms INTEGER,pid INTEGER,receipt_hash TEXT,PRIMARY KEY(scope,operation_id));"))
}

pub(super) fn history(tx: &Transaction<'_>, binding: &Binding) -> Result<(u64, u64), String> {
    let row: (u64, u64, u64, u64) = sql(tx.query_row("SELECT COALESCE(SUM(spent_ms),0),COALESCE(SUM(observed_processes),0),
        COALESCE(SUM(held_ms),0),COALESCE(SUM(active_slots),0) FROM protocol_allostasis_pools
        WHERE mission_id=$1 AND scope!=$2", params![binding.mission_id, scope(binding)?],
        |row| Ok((row.get(0)?,row.get(1)?,row.get(2)?,row.get(3)?))))?;
    if row.2 != 0 || row.3 != 0 { return Err("ALLOSTASIS_PRIOR_INCARNATION_UNRESOLVED".into()); }
    Ok((row.0, row.1))
}

pub(super) fn limit_transfer(tx: &Transaction<'_>, input: (&Binding, u64, u64)) -> Result<(), String> {
    let admission = admission(tx, input.0)?;
    if input.1 > 3 || input.2 > admission.timeout_ms { return Err("ALLOSTASIS_ADMITTED_LIMIT_EXCEEDED".into()); }
    let limits: (Option<u64>, Option<u64>) = sql(tx.query_row("SELECT MIN(slots),MIN(wall_ms)
        FROM protocol_allostasis_pools WHERE mission_id=$1", [&input.0.mission_id], |row| Ok((row.get(0)?, row.get(1)?))))?;
    if limits.0.is_some_and(|value| input.1 > value) || limits.1.is_some_and(|value| input.2 > value) {
        return Err("ALLOSTASIS_HANDOFF_BUDGET_AMPLIFICATION".into());
    }
    Ok(())
}

fn admission(tx: &Transaction<'_>, binding: &Binding) -> Result<super::super::RunSpec, String> {
    let row: (String,String) = sql(tx.query_row("SELECT payload_json,digest FROM rust_protocol_events
        WHERE run_id=$1 AND protocol='RUNTIME' AND phase='ADMIT' ORDER BY sequence LIMIT 1",
        [&binding.run_id], |row| Ok((row.get(0)?,row.get(1)?))))?;
    let value: serde_json::Value = serde_json::from_str(&row.0).map_err(|error| error.to_string())?;
    if digest(&(binding,"RUNTIME","ADMIT",&value))? != row.1 { return Err("ALLOSTASIS_ADMISSION_CORRUPT".into()); }
    let spec: super::super::RunSpec = serde_json::from_value(value).map_err(|error| error.to_string())?;
    if digest(&spec)? != binding.request_hash { return Err("ALLOSTASIS_ADMISSION_MISMATCH".into()); }
    Ok(spec)
}

pub(super) fn assert_pool(tx: &Transaction<'_>, binding: &Binding) -> Result<String, String> {
    let key = scope(binding)?;
    let held: String = sql(tx.query_row("SELECT binding_hash FROM protocol_allostasis_pools WHERE scope=$1",
        [&key], |row| row.get(0)))?;
    if held != digest(binding)? { return Err("ALLOSTASIS_BINDING_CHANGED".into()); }
    Ok(key)
}

pub(super) fn record_usage(tx: &Transaction<'_>, input: (&str, &str), usage: (&str, u64, u32)) -> Result<(), String> {
    let (scope, operation) = input;
    let (receipt, elapsed, pid) = usage;
    let maximum: i64 = sql(tx.query_row("SELECT maximum_ms FROM protocol_allostasis_exposures
        WHERE scope=$1 AND operation_id=$2", params![scope, operation], |row| row.get(0)))?;
    sql(tx.execute("UPDATE protocol_allostasis_exposures SET status='settled',elapsed_ms=$1,pid=$2,receipt_hash=$3
        WHERE scope=$4 AND operation_id=$5", params![integer(elapsed)?, pid, receipt, scope, operation]))?;
    let spent: i64 = sql(tx.query_row("SELECT spent_ms FROM protocol_allostasis_pools WHERE scope=$1", [scope], |row| row.get(0)))?;
    let next = spent.checked_add(integer(elapsed)?).ok_or("ALLOSTASIS_ACCOUNTING_OVERFLOW")?;
    sql(tx.execute("UPDATE protocol_allostasis_pools SET held_ms=held_ms-$1,active_slots=active_slots-1,
        spent_ms=$2,observed_processes=observed_processes+1 WHERE scope=$3", params![maximum, next, scope]))?;
    Ok(())
}

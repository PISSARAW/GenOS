use super::store::{Store, current_checked, digest, now_ms};
use super::types::{Binding, Event};
use super::continuity_checkpoint::{CheckpointRef, load_checkpoint};
use rusqlite::{Connection, OptionalExtension, Transaction, params};
use serde::{Deserialize, Serialize};
use serde_json::json;

pub fn ensure_schema(connection: &Connection) -> Result<(), String> {
    connection.execute_batch(
        "CREATE TABLE IF NOT EXISTS rust_protocol_checkpoints(
          checkpoint_id TEXT PRIMARY KEY, binding_digest TEXT NOT NULL,
          snapshot_digest TEXT NOT NULL, snapshot_json TEXT NOT NULL);
         CREATE TABLE IF NOT EXISTS rust_protocol_handoffs(
          predecessor_run TEXT PRIMARY KEY, successor_run TEXT UNIQUE NOT NULL,
          predecessor_digest TEXT NOT NULL, successor_digest TEXT NOT NULL,
          checkpoint_id TEXT NOT NULL, receipt_json TEXT NOT NULL);
         CREATE TABLE IF NOT EXISTS rust_protocol_effects(
          effect_key TEXT PRIMARY KEY, request_digest TEXT NOT NULL,
          binding_digest TEXT NOT NULL, status TEXT NOT NULL,
          result_json TEXT);"
    ).map_err(|e| e.to_string())
}

pub fn fence(tx: &Transaction<'_>, binding: &Binding) -> Result<(), String> {
    current_checked(tx, binding)
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct HandoffRequest {
    pub successor: Binding,
    pub checkpoint: CheckpointRef,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
pub struct HandoffReceipt {
    pub predecessor_digest: String,
    pub successor_digest: String,
    pub checkpoint_id: String,
    pub generation: u64,
    pub receipt_digest: String,
}

fn validate_successor(old: &Binding, next: &Binding) -> Result<(), String> {
    let expected = old.generation.checked_add(1).ok_or("CONTINUITY generation exhausted")?;
    let same_identity = (&old.mission_id, &old.actor_id, &old.workspace)
        == (&next.mission_id, &next.actor_id, &next.workspace);
    let same_contract = (&old.policy_hash, &old.request_hash, &old.env_hash)
        == (&next.policy_hash, &next.request_hash, &next.env_hash);
    if !same_identity || !same_contract || next.run_id == old.run_id {
        return Err("CONTINUITY successor scope/contract mismatch".into());
    }
    if next.generation != expected || next.expires_ms <= now_ms() {
        return Err("CONTINUITY invalid successor generation/expiry".into());
    }
    Ok(())
}

fn registered_successor(tx: &Transaction<'_>, binding: &Binding) -> Result<(), String> {
    let raw: String = tx.query_row(
        "SELECT binding_json FROM rust_protocol_runs WHERE run_id=?1",
        [&binding.run_id], |row| row.get(0),
    ).map_err(|_| "CONTINUITY successor must be prepared by trusted admission".to_owned())?;
    let registered: Binding = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
    if digest(&registered)? != digest(binding)? {
        return Err("CONTINUITY prepared successor binding conflict".into());
    }
    Ok(())
}

impl Store {
    pub fn handoff(&mut self, old: &Binding, request: &HandoffRequest) -> Result<HandoffReceipt, String> {
        validate_successor(old, &request.successor)?;
        if self.current(old).is_err() {
            return self.transaction(&request.successor, |tx| {
                ensure_schema(tx)?;
                replay_handoff(tx, (old, request))?.ok_or("CONTINUITY predecessor no longer current".into())
            });
        }
        self.succession_transaction((old, &request.successor), |tx| handoff_transaction(tx, (old, request)))
    }
}

fn handoff_transaction(
    tx: &Transaction<'_>,
    input: (&Binding, &HandoffRequest),
) -> Result<HandoffReceipt, String> {
    let (old, request) = input;
    ensure_schema(tx)?;
    fence(tx, old)?;
    registered_successor(tx, &request.successor)?;
    validate_checkpoint(tx, (old, request))?;
    settled_effects(tx, old)?;
    let receipt = make_receipt(old, request)?;
    switch_current(tx, (old, request))?;
    persist_handoff(tx, (old, request, &receipt))?;
    Ok(receipt)
}

fn settled_effects(tx: &Transaction<'_>, binding: &Binding) -> Result<(), String> {
    let fingerprint = digest(binding)?;
    for (table, predicate) in [
        ("protocol_omega_operations", "status IN ('intent','outcome_unknown')"),
        ("protocol_allostasis_pools", "held_ms>0 OR active_slots>0"),
        ("protocol_llm_omega_operations", "status IN ('intent','outcome_unknown')"),
        ("protocol_llm_resource_pools", "held_tokens>0 OR held_calls>0 OR held_wall_ms>0"),
        ("protocol_llm_resource_exposures", "status IN ('active','outcome_unknown','unknown_usage')"),
    ] {
        if !table_exists(tx, table)? { continue; }
        let query = format!("SELECT EXISTS(SELECT 1 FROM {table} WHERE binding_hash=?1 AND ({predicate}))");
        let blocked: bool = tx.query_row(&query, [&fingerprint], |row| row.get(0))
            .map_err(|e| e.to_string())?;
        if blocked { return Err("CONTINUITY predecessor effect/exposure unresolved; handoff forbidden".into()); }
    }
    agentic_settled(tx, binding)
}

fn agentic_settled(tx:&Transaction<'_>, binding:&Binding) -> Result<(),String> {
    if table_exists(tx,"agentic_pools")? { agentic_pool_settled(tx,binding)?; }
    for (table,predicate) in [("agentic_models","status IN ('intent','dispatching','unknown')"),
        ("agentic_tools","status!='completed'"),
        ("protocol_agentic_parallel_waves","status!='joined'")] {
        if !table_exists(tx,table)? { continue; }
        let query=format!("SELECT EXISTS(SELECT 1 FROM {table} WHERE run_id=?1 AND ({predicate}))");
        let pending:bool=tx.query_row(&query,[&binding.run_id],|row|row.get(0)).map_err(|error|error.to_string())?;
        if pending { return Err("CONTINUITY agentic operation pending; handoff forbidden".into()); }
    }
    delegation_settled(tx,binding)
}

fn delegation_settled(tx:&Transaction<'_>,binding:&Binding)->Result<(),String> {
    #[cfg(feature="native-llm")]
    { super::agentic_delegation_exchange::require_settled_in(tx,binding) }
    #[cfg(not(feature="native-llm"))]
    { unverified_delegations(tx,binding) }
}

#[cfg(not(feature="native-llm"))]
fn unverified_delegations(tx:&Transaction<'_>,binding:&Binding)->Result<(),String> {
    if !table_exists(tx,"protocol_agentic_delegations")? { return Ok(()); }
    let found:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM protocol_agentic_delegations WHERE run_id=$1)",
        [&binding.run_id],|row|row.get(0)).map_err(|error|error.to_string())?;
    if found { return Err("CONTINUITY delegation verifier unavailable; handoff forbidden".into()); }
    Ok(())
}

fn agentic_pool_settled(tx:&Transaction<'_>, binding:&Binding) -> Result<(),String> {
    let pending:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM agentic_pools WHERE mission_id=?1 AND (
        coalesce(json_extract(value_json,'$.unknown_operations'),1)>0 OR
        coalesce(json_extract(value_json,'$.held.tokens'),1)>0 OR
        coalesce(json_extract(value_json,'$.held.model_calls'),1)>0 OR
        coalesce(json_extract(value_json,'$.held.tool_calls'),1)>0 OR
        coalesce(json_extract(value_json,'$.held.wall_ms'),1)>0))",
        [&binding.mission_id],|row|row.get(0)).map_err(|error|error.to_string())?;
    if pending { return Err("CONTINUITY agentic exposure unresolved; handoff forbidden".into()); }
    Ok(())
}

fn table_exists(tx: &Transaction<'_>, table: &str) -> Result<bool, String> {
    tx.query_row("SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name=?1)",
        [table], |row| row.get(0)).map_err(|e| e.to_string())
}

fn validate_checkpoint(tx: &Transaction<'_>, input: (&Binding, &HandoffRequest)) -> Result<(), String> {
    let (old, request) = input;
    load_checkpoint(tx, &request.checkpoint)?;
    if request.checkpoint.binding_digest != digest(old)? {
        return Err("CONTINUITY checkpoint belongs to another predecessor".into());
    }
    Ok(())
}

fn persist_handoff(tx: &Transaction<'_>, input: (&Binding, &HandoffRequest, &HandoffReceipt)) -> Result<(), String> {
    let (old, request, receipt) = input;
    insert_handoff(tx, (old, request, receipt))?;
    Store::event(tx, old, Event { protocol: "CONTINUITY", phase: "ACTIVATE_SUCCESSOR",
        payload: serde_json::to_value(receipt).map_err(|e| e.to_string())? })
}

fn insert_handoff(tx: &Transaction<'_>, input: (&Binding, &HandoffRequest, &HandoffReceipt)) -> Result<(), String> {
    let (old, request, receipt) = input;
    tx.execute(
        "INSERT INTO rust_protocol_handoffs VALUES(?1,?2,?3,?4,?5,?6)",
        params![old.run_id, request.successor.run_id, receipt.predecessor_digest,
            receipt.successor_digest, receipt.checkpoint_id,
            serde_json::to_string(&receipt).map_err(|e| e.to_string())?],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

fn make_receipt(old: &Binding, request: &HandoffRequest) -> Result<HandoffReceipt, String> {
    let mut receipt = HandoffReceipt {
        predecessor_digest: digest(old)?, successor_digest: digest(&request.successor)?,
        checkpoint_id: request.checkpoint.checkpoint_id.clone(),
        generation: request.successor.generation, receipt_digest: String::new(),
    };
    receipt.receipt_digest = digest(&json!({"profile":"genos.rust.continuity/handoff/v1", "receipt":receipt}))?;
    Ok(receipt)
}

fn replay_handoff(tx: &Transaction<'_>, input: (&Binding, &HandoffRequest)) -> Result<Option<HandoffReceipt>, String> {
    let (old, request) = input;
    let raw: Option<String> = tx.query_row(
        "SELECT receipt_json FROM rust_protocol_handoffs WHERE predecessor_run=?1",
        [&old.run_id], |row| row.get(0),
    ).optional().map_err(|e| e.to_string())?;
    let Some(raw) = raw else { return Ok(None); };
    let receipt: HandoffReceipt = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
    if receipt != make_receipt(old, request)? {
        return Err("CONTINUITY handoff idempotency conflict".into());
    }
    load_checkpoint(tx, &request.checkpoint)?;
    Ok(Some(receipt))
}

fn switch_current(tx: &Transaction<'_>, input: (&Binding, &HandoffRequest)) -> Result<(), String> {
    let (old, request) = input;
    let changed = tx.execute(
        "UPDATE rust_protocol_current SET run_id=?1,generation=?2
         WHERE mission_id=?3 AND run_id=?4 AND generation=?5",
        params![request.successor.run_id, request.successor.generation,
            old.mission_id, old.run_id, old.generation],
    ).map_err(|e| e.to_string())?;
    if changed != 1 { return Err("CONTINUITY successor CAS conflict".into()); }
    Ok(())
}

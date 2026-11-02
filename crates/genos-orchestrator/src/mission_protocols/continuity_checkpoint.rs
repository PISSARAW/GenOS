use super::continuity::{ensure_schema, fence};
use super::store::{Store, digest};
use super::types::{Binding, Event};
use rusqlite::{OptionalExtension, Transaction, params};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
pub struct CheckpointRef {
    pub checkpoint_id: String,
    pub binding_digest: String,
    pub snapshot_digest: String,
}

pub(crate) fn load_checkpoint(tx: &Transaction<'_>, checkpoint: &CheckpointRef) -> Result<Value, String> {
    let (binding, snapshot, raw) = checkpoint_record(tx, checkpoint)?;
    let value: Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
    let expected_id = checkpoint_id(&binding, &snapshot)?;
    if binding != checkpoint.binding_digest || snapshot != checkpoint.snapshot_digest
        || digest(&value)? != snapshot || expected_id != checkpoint.checkpoint_id {
        return Err("CONTINUITY checkpoint integrity/binding conflict".into());
    }
    Ok(value)
}

fn checkpoint_record(tx: &Transaction<'_>, checkpoint: &CheckpointRef) -> Result<(String, String, String), String> {
    tx.query_row(
        "SELECT binding_digest,snapshot_digest,snapshot_json
         FROM rust_protocol_checkpoints WHERE checkpoint_id=?1",
        [&checkpoint.checkpoint_id], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    ).map_err(|e| e.to_string())
}

fn checkpoint_id(binding: &str, snapshot: &str) -> Result<String, String> {
    digest(&json!({"profile":"genos.rust.continuity/checkpoint/v1",
        "binding_digest":binding,"snapshot_digest":snapshot}))
}

impl Store {
    pub fn checkpoint(&mut self, binding: &Binding, value: &Value) -> Result<CheckpointRef, String> {
        ensure_schema(&self.connection)?;
        let reference = reference_for(binding, value)?;
        self.transaction(binding, |tx| save_checkpoint(tx, (binding, &reference, value)))?;
        Ok(reference)
    }

    pub fn restore_checkpoint(&mut self, binding: &Binding, checkpoint: &CheckpointRef) -> Result<Value, String> {
        ensure_schema(&self.connection)?;
        self.transaction(binding, |tx| {
            fence(tx, binding)?;
            authorize_restore(tx, (binding, checkpoint))?;
            let value = load_checkpoint(tx, checkpoint)?;
            Store::event(tx, binding, Event { protocol: "CONTINUITY".into(), phase: "RESTORE_CHECKPOINT".into(),
                payload: serde_json::to_value(checkpoint).map_err(|e| e.to_string())? })?;
            Ok(value)
        })
    }
}

fn reference_for(binding: &Binding, value: &Value) -> Result<CheckpointRef, String> {
    let binding_digest = digest(binding)?;
    let snapshot_digest = digest(value)?;
    Ok(CheckpointRef { checkpoint_id: checkpoint_id(&binding_digest, &snapshot_digest)?,
        binding_digest, snapshot_digest })
}

fn save_checkpoint(tx: &Transaction<'_>, input: (&Binding, &CheckpointRef, &Value)) -> Result<(), String> {
    let (binding, reference, value) = input;
    fence(tx, binding)?;
    let inserted = insert_checkpoint(tx, (reference, value))?;
    load_checkpoint(tx, reference)?;
    if inserted == 1 {
        Store::event(tx, binding, Event { protocol: "CONTINUITY", phase: "SEAL_CHECKPOINT",
            payload: serde_json::to_value(reference).map_err(|e| e.to_string())? })?;
    }
    Ok(())
}

fn insert_checkpoint(tx: &Transaction<'_>, input: (&CheckpointRef, &Value)) -> Result<usize, String> {
    let (reference, value) = input;
    tx.execute(
        "INSERT OR IGNORE INTO rust_protocol_checkpoints VALUES(?1,?2,?3,?4)",
        params![reference.checkpoint_id, reference.binding_digest, reference.snapshot_digest,
            serde_json::to_string(value).map_err(|e| e.to_string())?],
    ).map_err(|e| e.to_string())
}

fn authorize_restore(tx: &Transaction<'_>, input: (&Binding, &CheckpointRef)) -> Result<(), String> {
    let (binding, checkpoint) = input;
    let current_digest = digest(binding)?;
    if current_digest == checkpoint.binding_digest { return Ok(()); }
    let permitted: Option<String> = tx.query_row(
        "SELECT checkpoint_id FROM rust_protocol_handoffs
         WHERE successor_run=?1 AND successor_digest=?2 AND predecessor_digest=?3",
        params![binding.run_id, current_digest, checkpoint.binding_digest], |row| row.get(0),
    ).optional().map_err(|e| e.to_string())?;
    if permitted.as_deref() != Some(&checkpoint.checkpoint_id) {
        return Err("CONTINUITY checkpoint restore requires exact authorized handoff".into());
    }
    Ok(())
}

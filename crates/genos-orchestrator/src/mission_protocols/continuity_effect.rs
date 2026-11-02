use super::continuity::{ensure_schema, fence};
use super::store::{Store, digest};
use super::types::{Binding, Event};
use rusqlite::{OptionalExtension, Transaction, params};
use serde_json::{Value, json};

#[derive(Clone, Debug, PartialEq)]
pub enum EffectAdmission {
    Start,
    Completed(Value),
}

fn effect_key(binding: &Binding, operation: &str) -> Result<String, String> {
    if operation.trim().is_empty() { return Err("CONTINUITY effect requires operation identity".into()); }
    digest(&json!({"mission_id":binding.mission_id,"workspace":binding.workspace,
        "actor_id":binding.actor_id,"request_hash":binding.request_hash,"operation":operation}))
}

impl Store {
    pub fn begin_effect(&mut self, binding: &Binding, input: (&str, &Value)) -> Result<EffectAdmission, String> {
        ensure_schema(&self.connection)?;
        let (operation, request) = input;
        let key = effect_key(binding, operation)?;
        let request_digest = digest(request)?;
        self.transaction(binding, |tx| {
            fence(tx, binding)?;
            if let Some(result) = prior_effect(tx, (&key, &request_digest))? { return Ok(result); }
            insert_intent(tx, (binding, &key, &request_digest))?;
            Store::event(tx, binding, Event { protocol: "CONTINUITY".into(), phase: "EFFECT_INTENT".into(),
                payload: json!({"operation":operation,"effect_key":key,"request_digest":request_digest}) })?;
            Ok(EffectAdmission::Start)
        })
    }

    pub fn complete_effect(&mut self, binding: &Binding, input: (&str, &Value)) -> Result<(), String> {
        ensure_schema(&self.connection)?;
        let (operation, result) = input;
        let key = effect_key(binding, operation)?;
        self.transaction(binding, |tx| {
            fence(tx, binding)?;
            let changed = finish_intent(tx, (binding, &key, result))?;
            if changed != 1 { return Err("CONTINUITY effect completion ownership/state conflict".into()); }
            Store::event(tx, binding, Event { protocol: "CONTINUITY".into(), phase: "EFFECT_COMPLETED".into(),
                payload: json!({"operation":operation,"effect_key":key,"result_digest":digest(result)?}) })?;
            Ok(())
        })
    }
}

fn insert_intent(tx: &Transaction<'_>, input: (&Binding, &str, &str)) -> Result<(), String> {
    let (binding, key, request_digest) = input;
    tx.execute("INSERT INTO rust_protocol_effects VALUES(?1,?2,?3,'running',NULL)",
        params![key, request_digest, digest(binding)?]).map_err(|e| e.to_string())?;
    Ok(())
}

fn finish_intent(tx: &Transaction<'_>, input: (&Binding, &str, &Value)) -> Result<usize, String> {
    let (binding, key, result) = input;
    tx.execute(
        "UPDATE rust_protocol_effects SET status='completed',result_json=?1
         WHERE effect_key=?2 AND binding_digest=?3 AND status='running'",
        params![serde_json::to_string(result).map_err(|e| e.to_string())?, key, digest(binding)?],
    ).map_err(|e| e.to_string())
}

fn prior_effect(tx: &Transaction<'_>, input: (&str, &str)) -> Result<Option<EffectAdmission>, String> {
    let (key, expected) = input;
    let row: Option<(String, String, Option<String>)> = tx.query_row(
        "SELECT request_digest,status,result_json FROM rust_protocol_effects WHERE effect_key=?1",
        [key], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    ).optional().map_err(|e| e.to_string())?;
    let Some((recorded, status, result)) = row else { return Ok(None); };
    if recorded != expected { return Err("CONTINUITY effect request conflict".into()); }
    if status != "completed" { return Err("CONTINUITY EFFECT_OUTCOME_UNKNOWN; automatic redispatch forbidden".into()); }
    let raw = result.ok_or("CONTINUITY completed effect missing result")?;
    Ok(Some(EffectAdmission::Completed(serde_json::from_str(&raw).map_err(|e| e.to_string())?)))
}

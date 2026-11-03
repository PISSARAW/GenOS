use super::super::{Binding, Event, Store, digest};
use super::super::llm_evidence::{ArtifactSubject, ArtifactEvidenceReceipt};
use rusqlite::{Connection, Transaction, OptionalExtension, params};
use serde_json::json;

pub(crate) fn prepare_in(tx: &Transaction<'_>, binding: &Binding, subject: &ArtifactSubject) -> Result<(),String> {
    super::super::llm_evidence::require_in(tx,binding,subject)?;
    let hash = digest(&(binding,subject,"llm:emit"))?;
    let previous: Option<String> = super::data::sql(tx.query_row("SELECT request_hash FROM protocol_llm_omega_operations
        WHERE mission_id=$1 AND operation_id='emit'", [&binding.mission_id], |row| row.get(0)).optional())?;
    if let Some(previous) = previous {
        if previous != hash { return Err("LLM_OMEGA_EMIT_SUBJECT_CONFLICT".into()); }
        return Ok(());
    }
    insert(tx,binding,(subject,&hash))?;
    Store::event(tx,binding,Event { protocol:"OMEGA",phase:"CHECK_CONTRACT",payload:json!({"subject":subject}) })?;
    Store::event(tx,binding,Event { protocol:"OMEGA",phase:"REQUEST_EMIT",payload:json!({"subject_hash":hash}) })
}

fn insert(tx: &Transaction<'_>, binding: &Binding, input: (&ArtifactSubject,&str)) -> Result<(),String> {
    let value = json!({"profile":"genos.llm.emit/v1","subject":input.0});
    super::data::sql(tx.execute("INSERT INTO protocol_llm_omega_operations VALUES($1,'emit',$2,$3,$4,$5,'intent',NULL,NULL)",
        params![binding.mission_id,digest(binding)?,input.1,serde_json::to_string(&value).map_err(|error| error.to_string())?,digest(&value)?]))?;
    Ok(())
}

pub(crate) fn complete_in(tx: &Transaction<'_>, binding: &Binding, evidence: &ArtifactEvidenceReceipt) -> Result<String,String> {
    let observed = super::observed_in(tx,binding,"infer")?;
    if observed.result_hash != evidence.subject.result_hash { return Err("LLM_OMEGA_EMIT_RESULT_CHANGED".into()); }
    let hash = digest(&(binding,&evidence.subject,"llm:emit"))?;
    let receipt = json!({"profile":"genos.llm.emit-receipt/v1","binding_hash":digest(binding)?,
        "subject":evidence.subject,"proof_hash":evidence.receipt_hash,"external_effects_authorized":false});
    let receipt_hash = digest(&receipt)?;
    let changed = super::data::sql(tx.execute("UPDATE protocol_llm_omega_operations SET status='completed',outcome_json=$1,outcome_hash=$2
        WHERE mission_id=$3 AND operation_id='emit' AND request_hash=$4 AND status='intent'",
        params![serde_json::to_string(&receipt).map_err(|error| error.to_string())?,receipt_hash,binding.mission_id,hash]))?;
    if changed != 1 { return Err("LLM_OMEGA_EMIT_INTENT_REQUIRED".into()); }
    Store::event(tx,binding,Event { protocol:"OMEGA",phase:"EFFECT_RECEIPT",payload:receipt })?;
    Ok(receipt_hash)
}

pub(crate) fn require_in(connection: &Connection, binding: &Binding, input: (&ArtifactEvidenceReceipt,&str)) -> Result<(),String> {
    let request_hash = digest(&(binding,&input.0.subject,"llm:emit"))?;
    let row: (String,String) = super::data::sql(connection.query_row("SELECT outcome_json,outcome_hash FROM protocol_llm_omega_operations
        WHERE mission_id=$1 AND operation_id='emit' AND binding_hash=$2 AND request_hash=$3 AND status='completed'",
        params![binding.mission_id,digest(binding)?,request_hash],|row|Ok((row.get(0)?,row.get(1)?))))?;
    validate_receipt(binding,input,row)
}

fn validate_receipt(binding: &Binding, input: (&ArtifactEvidenceReceipt,&str), row: (String,String)) -> Result<(),String> {
    let value: serde_json::Value = serde_json::from_str(&row.0).map_err(|error|error.to_string())?;
    let expected = json!({"profile":"genos.llm.emit-receipt/v1","binding_hash":digest(binding)?,
        "subject":input.0.subject,"proof_hash":input.0.receipt_hash,"external_effects_authorized":false});
    if value != expected || row.1 != input.1 || digest(&value)? != row.1 { return Err("LLM_OMEGA_EMIT_RECEIPT_CORRUPT".into()); }
    Ok(())
}

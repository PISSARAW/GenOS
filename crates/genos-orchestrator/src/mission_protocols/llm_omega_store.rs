use super::{ObservedArtifact, types::StoredIntent};
use super::super::{Binding, digest, raw_hash};
use rusqlite::{Connection, OptionalExtension, Transaction, params};
use serde_json::Value;

pub(super) fn sql<T>(result: rusqlite::Result<T>) -> Result<T,String> { result.map_err(|error| error.to_string()) }

pub(super) fn ensure(tx: &Transaction<'_>) -> Result<(),String> {
    sql(tx.execute_batch("CREATE TABLE IF NOT EXISTS protocol_llm_omega_operations(
        mission_id TEXT NOT NULL,operation_id TEXT NOT NULL,binding_hash TEXT NOT NULL,request_hash TEXT NOT NULL,
        intent_json TEXT NOT NULL,intent_hash TEXT NOT NULL,status TEXT NOT NULL,outcome_json TEXT,outcome_hash TEXT,
        PRIMARY KEY(mission_id,operation_id));
      CREATE TABLE IF NOT EXISTS protocol_llm_source_snapshots(
        mission_id TEXT PRIMARY KEY,source_hash TEXT NOT NULL,bytes BLOB NOT NULL);"))
}

pub(super) fn exists(connection: &Connection, binding: &Binding) -> Result<bool,String> {
    sql(connection.query_row("SELECT EXISTS(SELECT 1 FROM protocol_llm_omega_operations
        WHERE mission_id=$1 AND operation_id='infer')", [&binding.mission_id], |row| row.get(0)))
}

pub(super) fn intent(connection: &Connection, binding: &Binding) -> Result<StoredIntent,String> {
    let row: (String,String,String) = sql(connection.query_row("SELECT binding_hash,intent_json,intent_hash
        FROM protocol_llm_omega_operations WHERE mission_id=$1 AND operation_id='infer'",
        [&binding.mission_id], |row| Ok((row.get(0)?,row.get(1)?,row.get(2)?))))?;
    decode_intent(binding,row)
}

fn decode_intent(binding: &Binding, row: (String,String,String)) -> Result<StoredIntent,String> {
    let input: StoredIntent = serde_json::from_str(&row.1).map_err(|error| error.to_string())?;
    if row.0 != digest(binding)? || row.2 != digest(&input)? || input.request_hash != digest(&input.descriptor)? {
        return Err("LLM_OMEGA_INTENT_CORRUPT_OR_FOREIGN".into());
    }
    Ok(input)
}

pub(super) fn insert(tx: &Transaction<'_>, binding: &Binding, input: &StoredIntent) -> Result<(),String> {
    sql(tx.execute("INSERT INTO protocol_llm_omega_operations VALUES($1,'infer',$2,$3,$4,$5,'intent',NULL,NULL)",
        params![binding.mission_id,digest(binding)?,input.request_hash,
            serde_json::to_string(input).map_err(|error| error.to_string())?,digest(input)?]))?;
    Ok(())
}

pub(super) fn status(connection: &Connection, binding: &Binding) -> Result<String,String> {
    sql(connection.query_row("SELECT status FROM protocol_llm_omega_operations WHERE mission_id=$1 AND operation_id='infer'",
        [&binding.mission_id], |row| row.get(0)))
}

pub(super) fn observed(connection: &Connection, binding: &Binding) -> Result<ObservedArtifact,String> {
    let row: (String,String) = sql(connection.query_row("SELECT outcome_json,outcome_hash FROM protocol_llm_omega_operations
        WHERE mission_id=$1 AND operation_id='infer' AND status='observed'", [&binding.mission_id],
        |row| Ok((row.get(0)?,row.get(1)?))))?;
    let observed: ObservedArtifact = serde_json::from_str(&row.0).map_err(|error| error.to_string())?;
    validate_observed(binding,(&observed,&row.1))?;
    validate_native(&observed)?;
    super::issued::require(connection,binding,("observation",&observed.observation_hash))?;
    verify_event(connection,binding,&observed)?;
    Ok(observed)
}

fn validate_native(observed: &ObservedArtifact) -> Result<(),String> {
    let mut native = observed.native_receipt.clone();
    if native["receipt_hash"].as_str() != Some(&observed.observation_hash)
        || native["text"].as_str().map(str::as_bytes) != Some(observed.output.as_slice()) {
        return Err("LLM_OMEGA_NATIVE_RECEIPT_CHANGED".into());
    }
    native["receipt_hash"] = Value::String(String::new());
    if digest(&serde_json::json!({"profile":"genos.native-inference/observation/v1","observation":native}))? != observed.observation_hash {
        return Err("LLM_OMEGA_NATIVE_RECEIPT_HASH_INVALID".into());
    }
    validate_response(observed)
}

fn validate_response(observed: &ObservedArtifact) -> Result<(),String> {
    let bytes: Vec<u8> = serde_json::from_value(observed.native_receipt["response_body"].clone()).map_err(|error|error.to_string())?;
    if bytes.len() > 2*1024*1024 || format!("sha256:{}",raw_hash(&bytes)) != observed.response_hash {
        return Err("LLM_OMEGA_RAW_RESPONSE_CHANGED".into());
    }
    Ok(())
}

fn validate_observed(binding: &Binding, input: (&ObservedArtifact,&str)) -> Result<(),String> {
    if input.1 != digest(input.0)? || input.0.binding_hash != digest(binding)?
        || raw_hash(&input.0.output) != input.0.result_hash { return Err("LLM_OMEGA_OUTCOME_CORRUPT".into()); }
    Ok(())
}

fn verify_event(connection: &Connection, binding: &Binding, observed: &ObservedArtifact) -> Result<(),String> {
    let row: (String,String) = sql(connection.query_row("SELECT payload_json,digest FROM rust_protocol_events
        WHERE run_id=$1 AND protocol='OMEGA' AND phase='MODEL_OBSERVED' ORDER BY sequence DESC LIMIT 1",
        [&binding.run_id], |row| Ok((row.get(0)?,row.get(1)?))))?;
    let payload: Value = serde_json::from_str(&row.0).map_err(|error| error.to_string())?;
    if payload != serde_json::to_value(observed).map_err(|error| error.to_string())?
        || row.1 != digest(&(binding,"OMEGA","MODEL_OBSERVED",&payload))? { return Err("LLM_OMEGA_OBSERVATION_EVENT_CORRUPT".into()); }
    Ok(())
}

pub(super) fn save_observed(tx: &Transaction<'_>, binding: &Binding, observed: &ObservedArtifact) -> Result<(),String> {
    sql(tx.execute("UPDATE protocol_llm_omega_operations SET status='observed',outcome_json=$1,outcome_hash=$2
        WHERE mission_id=$3 AND operation_id='infer'", params![serde_json::to_string(observed).map_err(|error| error.to_string())?,
            digest(observed)?,binding.mission_id]))?;
    Ok(())
}

pub(super) fn set_status(tx: &Transaction<'_>, binding: &Binding, status: &str) -> Result<(),String> {
    sql(tx.execute("UPDATE protocol_llm_omega_operations SET status=$1 WHERE mission_id=$2 AND operation_id='infer'",
        params![status,binding.mission_id]))?;
    Ok(())
}

pub(super) fn source(connection: &Connection, binding: &Binding) -> Result<Vec<u8>,String> {
    let row: (String,Vec<u8>) = sql(connection.query_row("SELECT source_hash,bytes FROM protocol_llm_source_snapshots
        WHERE mission_id=$1", [&binding.mission_id], |row| Ok((row.get(0)?,row.get(1)?))))?;
    if raw_hash(&row.1) != row.0 || super::super::llm_spec::admitted_in(connection,binding)?.source_hash != row.0 {
        return Err("LLM_OMEGA_SOURCE_CORRUPT".into());
    }
    Ok(row.1)
}

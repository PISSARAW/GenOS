use super::{Binding, digest, raw_hash};
use super::omega::{Kind, Receipt, Request};
use rusqlite::{OptionalExtension, Transaction, params};

pub(super) fn sql<T>(result: rusqlite::Result<T>) -> Result<T, String> { result.map_err(|error| error.to_string()) }
pub(super) fn scope(binding: &Binding) -> Result<String, String> { digest(&(&binding.mission_id, &binding.run_id, &binding.actor_id)) }

pub(super) fn ensure(tx: &Transaction<'_>) -> Result<(), String> {
    sql(tx.execute_batch("CREATE TABLE IF NOT EXISTS protocol_omega_operations(
        scope TEXT NOT NULL,mission_id TEXT NOT NULL,operation_id TEXT NOT NULL,binding_hash TEXT NOT NULL,request_hash TEXT NOT NULL,
        request_json TEXT NOT NULL,status TEXT NOT NULL,output_hash TEXT,decoded_hash TEXT,
        output BLOB,receipt_json TEXT,PRIMARY KEY(scope,operation_id));"))
}

pub(super) fn require_no_prior_dispatch(tx: &Transaction<'_>, input: (&Binding, &Request)) -> Result<(), String> {
    let (binding, request) = input;
    let unresolved: u64 = sql(tx.query_row("SELECT COUNT(*) FROM protocol_omega_operations
        WHERE mission_id=$1 AND scope!=$2 AND (status IN ('intent','outcome_unknown')
        OR (operation_id=$3 AND operation_id IN ('producer','verifier_a','verifier_b','emit')))",
        params![binding.mission_id, scope(binding)?, request.operation_id], |row| row.get(0)))?;
    if unresolved != 0 { return Err("OMEGA_PRIOR_INCARNATION_DISPATCH_NOT_REPEATABLE".into()); }
    Ok(())
}

pub(super) fn request(tx: &Transaction<'_>, identity: (&Binding, &str)) -> Result<Request, String> {
    let (binding, operation) = identity;
    let row: (String, String, String) = sql(tx.query_row("SELECT binding_hash,request_hash,request_json FROM protocol_omega_operations
        WHERE scope=$1 AND operation_id=$2", params![scope(binding)?, operation],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?))))?;
    decode_request(binding, row)
}

fn decode_request(binding: &Binding, row: (String,String,String)) -> Result<Request, String> {
    let request: Request = serde_json::from_str(&row.2).map_err(|error| error.to_string())?;
    if row.0 != digest(binding)? || row.1 != digest(&request)? { return Err("OMEGA_INTENT_INTEGRITY_INVALID".into()); }
    Ok(request)
}

pub(super) fn receipt(tx: &Transaction<'_>, identity: (&Binding, &str)) -> Result<Option<Receipt>, String> {
    let (binding, operation) = identity;
    let row: Option<Option<String>> = sql(tx.query_row("SELECT receipt_json FROM protocol_omega_operations
        WHERE scope=$1 AND operation_id=$2", params![scope(binding)?, operation], |row| row.get(0)).optional())?;
    row.flatten().map(|json| {
        let receipt: Receipt = serde_json::from_str(&json).map_err(|error| error.to_string())?;
        receipt.validate(binding)?;
        if receipt.operation_id != operation { return Err("OMEGA_RECEIPT_OPERATION_MISMATCH".into()); }
        Ok(receipt)
    }).transpose()
}

pub(super) fn dependencies(tx: &Transaction<'_>, input: (&Binding, &Request)) -> Result<(), String> {
    let (binding, input) = input;
    for predecessor in input.kind.predecessors() {
        let previous = request(tx, (binding, predecessor))?;
        if previous.source_hash != input.source_hash || previous.base_hash != input.base_hash
            || previous.context_hash != input.context_hash || receipt(tx, (binding, predecessor))?.is_none() {
            return Err("OMEGA_REQUIRED_PREDECESSOR_MISSING_OR_DIFFERENT".into());
        }
    }
    Ok(())
}

pub(super) fn finish(tx: &Transaction<'_>, input: (&Binding, &Request), result: (&Receipt, &[u8], &str)) -> Result<(), String> {
    let (binding, request) = input;
    let (receipt, bytes, decoded) = result;
    sql(tx.execute("UPDATE protocol_omega_operations SET status='completed',output_hash=$1,output=$2,decoded_hash=$3,receipt_json=$4
        WHERE scope=$5 AND operation_id=$6", params![receipt.output_hash, bytes, decoded,
        serde_json::to_string(receipt).map_err(|error| error.to_string())?, scope(binding)?, request.operation_id]))?;
    Ok(())
}

pub(super) fn selected_input(tx: &Transaction<'_>, binding: &Binding) -> Result<String, String> {
    let selected = request(tx, (binding, "select"))?;
    if selected.kind != Kind::Select || receipt(tx, (binding, "select"))?.is_none() { return Err("OMEGA_SELECT_REQUIRED".into()); }
    let row: (String, Vec<u8>) = sql(tx.query_row("SELECT decoded_hash,output FROM protocol_omega_operations
        WHERE scope=$1 AND operation_id='select'", [scope(binding)?], |row| Ok((row.get(0)?,row.get(1)?))))?;
    validate_selected(row, &selected.source_hash)
}

pub(crate) fn source_bytes(tx: &Transaction<'_>, binding: &Binding, source_hash: &str) -> Result<Vec<u8>, String> {
    let read = request(tx, (binding, "read"))?;
    let received = receipt(tx, (binding, "read"))?.ok_or("OMEGA_READ_RECEIPT_REQUIRED")?;
    let bytes: Vec<u8> = sql(tx.query_row("SELECT output FROM protocol_omega_operations
        WHERE scope=$1 AND operation_id='read'", [scope(binding)?], |row| row.get(0)))?;
    if read.kind != Kind::Read || read.source_hash != source_hash || received.output_hash != source_hash
        || raw_hash(&bytes) != source_hash {
        return Err("OMEGA_STORED_READ_SOURCE_CHANGED".into());
    }
    Ok(bytes)
}

fn validate_selected(row: (String,Vec<u8>), source_hash: &str) -> Result<String, String> {
    let values: Vec<i64> = serde_json::from_slice(&row.1).map_err(|error| error.to_string())?;
    super::integer::validate(&values)?;
    if digest(&values)? != row.0 || raw_hash(&row.1) != source_hash {
        return Err("OMEGA_STORED_SELECTION_CORRUPT".into());
    }
    Ok(row.0)
}

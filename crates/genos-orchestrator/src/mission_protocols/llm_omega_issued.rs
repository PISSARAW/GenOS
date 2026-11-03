use super::data::sql;
use super::super::{Binding, digest};
use genos_api::native_inference::InferenceFailure;
use rusqlite::{Connection, Transaction, params};
use serde_json::Value;

pub(super) fn ensure(tx: &Transaction<'_>) -> Result<(),String> {
    sql(tx.execute_batch("CREATE TABLE IF NOT EXISTS protocol_llm_dispatch_receipts(
        mission_id TEXT PRIMARY KEY,binding_hash TEXT NOT NULL,request_hash TEXT NOT NULL,
        kind TEXT NOT NULL,receipt_hash TEXT NOT NULL,native_json TEXT NOT NULL,seal_hash TEXT NOT NULL);"))
}

pub(super) fn failure_hash(failure: &InferenceFailure) -> Result<String,String> { digest(&("genos.llm.failure/v1",failure)) }

pub(super) fn seal(tx: &Transaction<'_>, binding: &Binding, input: (&str,&str,&Value)) -> Result<(),String> {
    ensure(tx)?;
    if !matches!(super::data::status(tx,binding)?.as_str(),"dispatching"|"outcome_unknown") {
        return Err("LLM_DISPATCH_RETURN_NOT_OWNED".into());
    }
    let request = super::data::intent(tx,binding)?.request_hash;
    let binding_hash = digest(binding)?;
    let seal = digest(&(&binding_hash,&request,input.0,input.1,input.2))?;
    sql(tx.execute("INSERT INTO protocol_llm_dispatch_receipts VALUES($1,$2,$3,$4,$5,$6,$7)",
        params![binding.mission_id,binding_hash,request,input.0,input.1,
            serde_json::to_string(input.2).map_err(|error| error.to_string())?,seal]))?;
    Ok(())
}

pub(super) fn require(connection: &Connection, binding: &Binding, expected: (&str,&str)) -> Result<(),String> {
    let row: (String,String,String,String,String,String) = sql(connection.query_row("SELECT binding_hash,request_hash,kind,
        receipt_hash,native_json,seal_hash FROM protocol_llm_dispatch_receipts WHERE mission_id=$1", [&binding.mission_id],
        |row| Ok((row.get(0)?,row.get(1)?,row.get(2)?,row.get(3)?,row.get(4)?,row.get(5)?))))?;
    validate(binding,expected,row)
}

fn validate(binding: &Binding, expected: (&str,&str), row: (String,String,String,String,String,String)) -> Result<(),String> {
    let native: Value = serde_json::from_str(&row.4).map_err(|error| error.to_string())?;
    let actual = (&row.0,row.2.as_str(),row.3.as_str());
    let binding_hash = digest(binding)?;
    if actual != (&binding_hash,expected.0,expected.1)
        || row.5 != digest(&(&row.0,&row.1,&row.2,&row.3,&native))? { return Err("LLM_DISPATCH_RECEIPT_NOT_ISSUED_OR_CORRUPT".into()); }
    Ok(())
}

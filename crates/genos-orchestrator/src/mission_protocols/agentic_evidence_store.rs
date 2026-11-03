use super::{Binding,EvidenceReceipt,Methods};
use super::super::digest;
use rusqlite::{Connection,OptionalExtension,Transaction,params};
use super::super::gqwf_store::sql;

pub(super) fn ensure(tx:&Transaction<'_>)->Result<(),String> {
    sql(tx.execute_batch("CREATE TABLE IF NOT EXISTS protocol_agentic_verifiers(run_id TEXT PRIMARY KEY,value_json TEXT NOT NULL,value_hash TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS protocol_agentic_evidence(run_id TEXT PRIMARY KEY,value_json TEXT NOT NULL,value_hash TEXT NOT NULL);"))
}

pub(super) fn methods(connection:&Connection,binding:&Binding)->Result<Option<Methods>,String> {
    let row:Option<(String,String)>=sql(connection.query_row("SELECT value_json,value_hash FROM protocol_agentic_verifiers WHERE run_id=$1",
        [&binding.run_id],|row|Ok((row.get(0)?,row.get(1)?))).optional())?;
    row.map(decode::<Methods>).transpose()
}

pub(super) fn install(tx:&Transaction<'_>,binding:&Binding,value:&Methods)->Result<(),String> {
    sql(tx.execute("INSERT INTO protocol_agentic_verifiers VALUES($1,$2,$3)",params![binding.run_id,encode(value)?,digest(value)?]))?;
    Ok(())
}

pub(super) fn evidence(connection:&Connection,binding:&Binding)->Result<Option<EvidenceReceipt>,String> {
    let row:Option<(String,String)>=sql(connection.query_row("SELECT value_json,value_hash FROM protocol_agentic_evidence WHERE run_id=$1",
        [&binding.run_id],|row|Ok((row.get(0)?,row.get(1)?))).optional())?;
    row.map(decode::<EvidenceReceipt>).transpose()
}

pub(super) fn save(tx:&Transaction<'_>,binding:&Binding,value:&EvidenceReceipt)->Result<(),String> {
    sql(tx.execute("INSERT INTO protocol_agentic_evidence VALUES($1,$2,$3)",params![binding.run_id,encode(value)?,digest(value)?]))?;
    Ok(())
}

fn encode<T:serde::Serialize>(value:&T)->Result<String,String> { serde_json::to_string(value).map_err(|error|error.to_string()) }
fn decode<T:serde::Serialize+serde::de::DeserializeOwned>(row:(String,String))->Result<T,String> {
    let value:T=serde_json::from_str(&row.0).map_err(|error|error.to_string())?;
    if digest(&value)?!=row.1 { return Err("AGENTIC_EVIDENCE_INDEX_CHANGED".into()); }
    Ok(value)
}

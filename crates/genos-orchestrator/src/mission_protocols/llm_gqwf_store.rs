use super::{Candidate, Publication};
use super::super::{Binding, digest};
use rusqlite::{Connection, OptionalExtension, Transaction, params};
pub(super) use super::super::gqwf_store::{put,object_bytes,scope,head_scope,head,sql};

pub(super) fn ensure(tx: &Transaction<'_>) -> Result<(),String> {
    super::super::gqwf_store::ensure(tx)?;
    sql(tx.execute_batch("CREATE TABLE IF NOT EXISTS protocol_llm_gqwf_candidates(
        scope TEXT NOT NULL,candidate_id TEXT NOT NULL,candidate_json TEXT NOT NULL,candidate_hash TEXT NOT NULL,
        status TEXT NOT NULL,proof_hash TEXT,receipt_json TEXT,PRIMARY KEY(scope,candidate_id));"))
}

pub(super) fn candidate(connection: &Connection, input: (&Binding,&str)) -> Result<Candidate,String> {
    let row: (String,String) = sql(connection.query_row("SELECT candidate_json,candidate_hash FROM protocol_llm_gqwf_candidates
        WHERE scope=$1 AND candidate_id=$2",params![scope(input.0)?,input.1],|row| Ok((row.get(0)?,row.get(1)?))))?;
    let value: Candidate = serde_json::from_str(&row.0).map_err(|error| error.to_string())?;
    validate_candidate(input,(&value,&row.1))?;
    Ok(value)
}

fn validate_candidate(input: (&Binding,&str), stored: (&Candidate,&str)) -> Result<(),String> {
    stored.0.validate(input.0)?;
    if stored.0.candidate_id != input.1 || digest(stored.0)? != stored.1 { return Err("LLM_GQWF_DESCRIPTOR_CORRUPT".into()); }
    Ok(())
}

pub(super) fn exists(connection: &Connection, input: (&Binding,&str)) -> Result<bool,String> {
    Ok(sql(connection.query_row("SELECT 1 FROM protocol_llm_gqwf_candidates WHERE scope=$1 AND candidate_id=$2",
        params![scope(input.0)?,input.1], |_| Ok(())).optional())?.is_some())
}

pub(super) fn insert(tx: &Transaction<'_>, binding: &Binding, candidate: &Candidate) -> Result<(),String> {
    sql(tx.execute("INSERT INTO protocol_llm_gqwf_candidates VALUES($1,$2,$3,$4,'offered',NULL,NULL)",
        params![scope(binding)?,candidate.candidate_id,serde_json::to_string(candidate).map_err(|error| error.to_string())?,digest(candidate)?]))?;
    Ok(())
}

pub(super) fn status(connection: &Connection, input: (&Binding,&str)) -> Result<String,String> {
    sql(connection.query_row("SELECT status FROM protocol_llm_gqwf_candidates WHERE scope=$1 AND candidate_id=$2",
        params![scope(input.0)?,input.1],|row|row.get(0)))
}

pub(super) fn set_status(tx: &Transaction<'_>, input: (&Binding,&str), status: &str) -> Result<(),String> {
    sql(tx.execute("UPDATE protocol_llm_gqwf_candidates SET status=$1 WHERE scope=$2 AND candidate_id=$3",
        params![status,scope(input.0)?,input.1]))?;
    Ok(())
}

pub(super) fn proof(connection: &Connection, input: (&Binding,&str)) -> Result<String,String> {
    sql(connection.query_row("SELECT proof_hash FROM protocol_llm_gqwf_candidates WHERE scope=$1 AND candidate_id=$2",
        params![scope(input.0)?,input.1],|row|row.get(0)))
}

pub(super) fn publication(connection: &Connection, input: (&Binding,&str)) -> Result<Publication,String> {
    let raw: String = sql(connection.query_row("SELECT receipt_json FROM protocol_llm_gqwf_candidates WHERE scope=$1 AND candidate_id=$2",
        params![scope(input.0)?,input.1],|row|row.get(0)))?;
    serde_json::from_str(&raw).map_err(|error|error.to_string())
}

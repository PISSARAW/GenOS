use super::{Binding, digest, raw_hash};
use super::gqwf::{Candidate, Head};
use rusqlite::{OptionalExtension, Transaction, params};

pub(super) fn sql<T>(result: rusqlite::Result<T>) -> Result<T, String> { result.map_err(|error| error.to_string()) }
pub(super) fn scope(binding: &Binding) -> Result<String, String> { digest(&(&binding.mission_id, &binding.run_id, &binding.actor_id)) }
pub(super) fn head_scope(binding: &Binding) -> Result<String, String> { digest(&(&binding.mission_id, &binding.workspace)) }

pub(super) fn ensure(tx: &Transaction<'_>) -> Result<(), String> {
    sql(tx.execute_batch("CREATE TABLE IF NOT EXISTS protocol_gqwf_objects(
        store_id TEXT NOT NULL,hash TEXT NOT NULL,bytes BLOB NOT NULL,PRIMARY KEY(store_id,hash));
      CREATE TABLE IF NOT EXISTS protocol_gqwf_heads(scope TEXT PRIMARY KEY,store_id TEXT NOT NULL,
        root_hash TEXT NOT NULL,generation INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS protocol_gqwf_candidates(scope TEXT NOT NULL,candidate_id TEXT NOT NULL,
        descriptor_json TEXT NOT NULL,descriptor_hash TEXT NOT NULL,status TEXT NOT NULL,
        proof_hash TEXT,receipt_json TEXT,PRIMARY KEY(scope,candidate_id));"))
}

pub(super) fn put(tx: &Transaction<'_>, object: (&str, &str, &[u8])) -> Result<(), String> {
    if raw_hash(object.2) != object.1 { return Err("GQWF_OBJECT_HASH_INVALID".into()); }
    sql(tx.execute("INSERT OR IGNORE INTO protocol_gqwf_objects VALUES($1,$2,$3)", params![object.0, object.1, object.2]))?;
    if object_bytes(tx, (object.0, object.1))? != object.2 { return Err("GQWF_IMMUTABLE_OBJECT_CONFLICT".into()); }
    Ok(())
}

pub(super) fn object_bytes(tx: &Transaction<'_>, object: (&str, &str)) -> Result<Vec<u8>, String> {
    let bytes: Vec<u8> = sql(tx.query_row("SELECT bytes FROM protocol_gqwf_objects WHERE store_id=$1 AND hash=$2",
        params![object.0, object.1], |row| row.get(0)))?;
    if raw_hash(&bytes) != object.1 { return Err("GQWF_STORED_OBJECT_CORRUPT".into()); }
    Ok(bytes)
}

pub(super) fn head(tx: &Transaction<'_>, binding: &Binding) -> Result<Head, String> {
    let row: (String, String, u64) = sql(tx.query_row("SELECT store_id,root_hash,generation FROM protocol_gqwf_heads WHERE scope=$1",
        [head_scope(binding)?], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?))))?;
    object_bytes(tx, (&row.0, &row.1))?;
    Ok(Head { root_hash: row.1, generation: row.2 })
}

pub(super) fn candidate(tx: &Transaction<'_>, input: (&Binding, &str)) -> Result<Candidate, String> {
    let (binding, id) = input;
    let row: (String, String) = sql(tx.query_row("SELECT descriptor_json,descriptor_hash FROM protocol_gqwf_candidates
        WHERE scope=$1 AND candidate_id=$2", params![scope(binding)?, id], |row| Ok((row.get(0)?, row.get(1)?))))?;
    decode_candidate(binding, (id, row))
}

fn decode_candidate(binding: &Binding, input: (&str, (String,String))) -> Result<Candidate, String> {
    let (id, row) = input;
    let descriptor: Candidate = serde_json::from_str(&row.0).map_err(|error| error.to_string())?;
    descriptor.validate(binding)?;
    if descriptor.candidate_id != id || digest(&descriptor)? != row.1 {
        return Err("GQWF_CANDIDATE_DESCRIPTOR_CHANGED".into());
    }
    Ok(descriptor)
}

pub(super) fn existing(tx: &Transaction<'_>, input: (&Binding, &str)) -> Result<bool, String> {
    Ok(sql(tx.query_row("SELECT 1 FROM protocol_gqwf_candidates WHERE scope=$1 AND candidate_id=$2",
        params![scope(input.0)?, input.1], |_| Ok(())).optional())?.is_some())
}

pub(super) fn status(tx: &Transaction<'_>, input: (&Binding, &str)) -> Result<String, String> {
    sql(tx.query_row("SELECT status FROM protocol_gqwf_candidates WHERE scope=$1 AND candidate_id=$2",
        params![scope(input.0)?, input.1], |row| row.get(0)))
}

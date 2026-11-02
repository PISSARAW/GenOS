use super::{Binding, Event, Store, digest};
use super::gqwf::{Candidate, Commit, Publication, physical, subject};
use super::gqwf_store as data;
use data::sql;
use rusqlite::{Transaction, params};
use serde_json::json;

fn proof(tx: &Transaction<'_>, input: (&Binding, &Candidate)) -> Result<String, String> {
    let (binding, candidate) = input;
    let evidence = super::evidence::require_in(tx, binding, &subject(candidate))?;
    let stored: Option<String> = sql(tx.query_row("SELECT proof_hash FROM protocol_gqwf_candidates WHERE scope=$1 AND candidate_id=$2",
        params![data::scope(binding)?, candidate.candidate_id], |row| row.get(0)))?;
    if stored.as_deref() != Some(&evidence.receipt_hash) { return Err("GQWF_PROOF_REEVALUATION_REQUIRED".into()); }
    Ok(evidence.receipt_hash)
}

pub(super) fn prepare(store: &mut Store, binding: &Binding, candidate_id: &str) -> Result<Candidate, String> {
    store.transaction(binding, |tx| {
        data::ensure(tx)?;
        let candidate = data::candidate(tx, (binding, candidate_id))?;
        physical(tx, &candidate)?; proof(tx, (binding, &candidate))?;
        super::gqwf::require_base(tx, binding, &candidate)?;
        prepare_status(tx, binding, &candidate)?;
        Ok(candidate)
    })
}

fn prepare_status(tx: &Transaction<'_>, binding: &Binding, candidate: &Candidate) -> Result<(), String> {
    let status = data::status(tx, (binding, &candidate.candidate_id))?;
    if status == "prepared" { return Ok(()); }
    if status != "verified" { return Err("GQWF_VERIFIED_WORLD_REQUIRED".into()); }
    sql(tx.execute("UPDATE protocol_gqwf_candidates SET status='prepared' WHERE scope=$1 AND candidate_id=$2",
        params![data::scope(binding)?, candidate.candidate_id]))?;
    Store::event(tx, binding, Event { protocol: "GQWF", phase: "PREPARE_PROMOTION", payload: json!(candidate) })
}

fn publication_hash(publication: &Publication) -> Result<String, String> {
    digest(&(&publication.candidate_id, &publication.binding_hash, &publication.root_hash, &publication.previous_head,
        publication.generation, &publication.proof_hash, publication.external_effects_authorized))
}

fn replay(tx: &Transaction<'_>, input: (&Binding, &Candidate), proof_hash: &str) -> Result<Publication, String> {
    let (binding, candidate) = input;
    let serialized: String = sql(tx.query_row("SELECT receipt_json FROM protocol_gqwf_candidates WHERE scope=$1 AND candidate_id=$2",
        params![data::scope(binding)?, candidate.candidate_id], |row| row.get(0)))?;
    let publication: Publication = serde_json::from_str(&serialized).map_err(|error| error.to_string())?;
    validate_publication(&publication, (binding, candidate, proof_hash))?;
    Ok(publication)
}

fn validate_publication(publication: &Publication, expected: (&Binding, &Candidate, &str)) -> Result<(), String> {
    let (binding, candidate, proof_hash) = expected;
    let binding_hash = digest(binding)?;
    let generation = candidate.base.generation.checked_add(1).ok_or("GQWF_HEAD_GENERATION_OVERFLOW")?;
    let actual = (&publication.candidate_id, &publication.binding_hash, &publication.root_hash,
        &publication.previous_head, publication.generation, publication.proof_hash.as_str(), publication.external_effects_authorized);
    let expected = (&candidate.candidate_id, &binding_hash, &candidate.root_hash, &candidate.base, generation, proof_hash, false);
    if actual != expected || publication.receipt_hash != publication_hash(publication)? {
        return Err("GQWF_PUBLICATION_RECEIPT_CORRUPT".into());
    }
    Ok(())
}

pub(super) fn commit(store: &mut Store, binding: &Binding, input: Commit<'_>) -> Result<Publication, String> {
    store.transaction(binding, |tx| {
        data::ensure(tx)?;
        let candidate = data::candidate(tx, (binding, input.candidate_id))?;
        let bytes = physical(tx, &candidate)?;
        let proof_hash = proof(tx, (binding, &candidate))?;
        let status = data::status(tx, (binding, input.candidate_id))?;
        if status == "published" { return replay(tx, (binding, &candidate), &proof_hash); }
        if status != "prepared" { return Err("GQWF_PREPARED_PROMOTION_REQUIRED".into()); }
        super::gqwf::require_base(tx, binding, &candidate)?;
        publish(tx, (binding, &candidate), (input.omega_operation_id, &bytes, &proof_hash))
    })
}

pub(super) fn publication(store: &mut Store, binding: &Binding, id: &str) -> Result<Option<Publication>, String> {
    store.transaction(binding, |tx| {
        data::ensure(tx)?;
        let Some(candidate) = published_candidate(tx, (binding, id))? else { return Ok(None); };
        physical(tx, &candidate)?;
        let proof_hash = proof(tx, (binding, &candidate))?;
        Ok(Some(replay(tx, (binding, &candidate), &proof_hash)?))
    })
}

fn published_candidate(tx: &Transaction<'_>, input: (&Binding, &str)) -> Result<Option<Candidate>, String> {
    if !data::existing(tx, input)? { return Ok(None); }
    let candidate = data::candidate(tx, input)?;
    if data::status(tx, input)? != "published" { return Ok(None); }
    Ok(Some(candidate))
}

pub(super) fn result_bytes(store: &mut Store, binding: &Binding, id: &str) -> Result<Vec<u8>, String> {
    store.transaction(binding, |tx| {
        data::ensure(tx)?;
        let candidate = published_candidate(tx, (binding, id))?.ok_or("GQWF_PUBLICATION_REQUIRED")?;
        let hash = proof(tx, (binding, &candidate))?;
        replay(tx, (binding, &candidate), &hash)?;
        physical(tx, &candidate)
    })
}

fn publish(tx: &Transaction<'_>, input: (&Binding, &Candidate), effect: (&str, &[u8], &str)) -> Result<Publication, String> {
    let (binding, candidate) = input;
    let generation = advance_head(tx, binding, candidate)?;
    super::omega::emit_tx(tx, binding, super::omega::Emission { operation_id: effect.0, output: effect.1,
        source_hash: &candidate.source_hash, base_hash: &candidate.base.root_hash,
        context_hash: &candidate.context_hash, proof_hash: effect.2 })?;
    let publication = make_publication(input, (generation, effect.2))?;
    record_publication(tx, binding, &publication)?;
    Ok(publication)
}

fn advance_head(tx: &Transaction<'_>, binding: &Binding, candidate: &Candidate) -> Result<u64, String> {
    let generation = candidate.base.generation.checked_add(1).ok_or("GQWF_HEAD_GENERATION_OVERFLOW")?;
    let sql_generation = i64::try_from(generation).map_err(|_| "GQWF_HEAD_GENERATION_OVERFLOW")?;
    let changed = sql(tx.execute("UPDATE protocol_gqwf_heads SET root_hash=$1,store_id=$2,generation=$3
        WHERE scope=$4 AND root_hash=$5 AND generation=$6", params![candidate.root_hash, candidate.receiver_store,
        sql_generation, data::head_scope(binding)?, candidate.base.root_hash, candidate.base.generation]))?;
    if changed != 1 { return Err("GQWF_HEAD_CAS_FAILED".into()); }
    Ok(generation)
}

fn make_publication(input: (&Binding, &Candidate), effect: (u64, &str)) -> Result<Publication, String> {
    let (binding, candidate) = input;
    let mut publication = Publication { candidate_id: candidate.candidate_id.clone(), binding_hash: digest(binding)?,
        root_hash: candidate.root_hash.clone(), previous_head: candidate.base.clone(), generation: effect.0,
        proof_hash: effect.1.into(), receipt_hash: String::new(), external_effects_authorized: false };
    publication.receipt_hash = publication_hash(&publication)?;
    Ok(publication)
}

fn record_publication(tx: &Transaction<'_>, binding: &Binding, publication: &Publication) -> Result<(), String> {
    sql(tx.execute("UPDATE protocol_gqwf_candidates SET status='published',receipt_json=$1 WHERE scope=$2 AND candidate_id=$3",
        params![serde_json::to_string(publication).map_err(|error| error.to_string())?, data::scope(binding)?, publication.candidate_id]))?;
    let completed = sql(tx.execute("UPDATE rust_protocol_runs SET status='completed' WHERE run_id=$1", [&binding.run_id]))?;
    if completed != 1 { return Err("GQWF_NATIVE_RUN_COMPLETION_FAILED".into()); }
    Store::event(tx, binding, Event { protocol: "GQWF", phase: "PROMOTION_COMMITTED", payload: json!(publication) })?;
    Ok(())
}

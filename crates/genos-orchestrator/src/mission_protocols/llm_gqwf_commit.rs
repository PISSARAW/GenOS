use super::{Binding, Candidate, Event, Head, Publication, Store, data, digest, physical, require_base};
use super::super::llm_evidence::ArtifactEvidenceReceipt;
use rusqlite::{Transaction, params};
use serde_json::json;

fn evidence(tx: &Transaction<'_>, binding: &Binding, candidate: &Candidate) -> Result<ArtifactEvidenceReceipt,String> {
    let accepted = super::super::llm_evidence::require_in(tx,binding,&candidate.subject)?;
    if data::proof(tx,(binding,&candidate.candidate_id))? != accepted.receipt_hash { return Err("LLM_GQWF_PROOF_REEVALUATION_REQUIRED".into()); }
    super::super::llm_allostasis::assert_publishable_in(tx,binding)?;
    Ok(accepted)
}

pub(super) fn prepare(store: &mut Store, binding: &Binding, id: &str) -> Result<Candidate,String> {
    store.transaction(binding,|tx| {
        let candidate = data::candidate(tx,(binding,id))?;
        physical(tx,binding,&candidate)?; evidence(tx,binding,&candidate)?; require_base(tx,binding,&candidate)?;
        prepare_status(tx,binding,&candidate)?;
        super::super::llm_omega::prepare_emit_in(tx,binding,&candidate.subject)?;
        Ok(candidate)
    })
}

fn prepare_status(tx: &Transaction<'_>, binding: &Binding, candidate: &Candidate) -> Result<(),String> {
    let status = data::status(tx,(binding,&candidate.candidate_id))?;
    if status == "prepared" { return Ok(()); }
    if status != "verified" { return Err("LLM_GQWF_VERIFIED_ARTIFACT_REQUIRED".into()); }
    data::set_status(tx,(binding,&candidate.candidate_id),"prepared")?;
    Store::event(tx,binding,Event { protocol:"GQWF",phase:"PREPARE_ARTIFACT_PUBLICATION",payload:json!(candidate) })
}

pub(super) fn commit(store: &mut Store, binding: &Binding, id: &str) -> Result<Publication,String> {
    store.transaction(binding,|tx| {
        let candidate = data::candidate(tx,(binding,id))?;
        physical(tx,binding,&candidate)?;
        let accepted = evidence(tx,binding,&candidate)?;
        let status = data::status(tx,(binding,id))?;
        if status == "published" { return replay(tx,(binding,&candidate),&accepted); }
        if status != "prepared" { return Err("LLM_GQWF_PREPARED_ARTIFACT_REQUIRED".into()); }
        require_base(tx,binding,&candidate)?;
        publish(tx,(binding,&candidate),&accepted)
    })
}

fn publish(tx: &Transaction<'_>, input: (&Binding,&Candidate), accepted: &ArtifactEvidenceReceipt) -> Result<Publication,String> {
    let (binding,candidate) = input;
    let generation = advance(tx,binding,candidate)?;
    let omega = super::super::llm_omega::complete_emit_in(tx,binding,accepted)?;
    let publication = make(input,(generation,omega),accepted)?;
    persist(tx,binding,&publication)?;
    Ok(publication)
}

fn advance(tx: &Transaction<'_>, binding: &Binding, candidate: &Candidate) -> Result<u64,String> {
    let generation = candidate.subject.base_generation.checked_add(1).ok_or("LLM_GQWF_GENERATION_OVERFLOW")?;
    let sql_generation = i64::try_from(generation).map_err(|_|"LLM_GQWF_GENERATION_OVERFLOW")?;
    let changed = data::sql(tx.execute("UPDATE protocol_gqwf_heads SET store_id=$1,root_hash=$2,generation=$3
        WHERE scope=$4 AND root_hash=$5 AND generation=$6",params![candidate.receiver_store,candidate.subject.result_hash,
            sql_generation,data::head_scope(binding)?,candidate.subject.base_hash,candidate.subject.base_generation]))?;
    if changed != 1 { return Err("LLM_GQWF_HEAD_CAS_FAILED".into()); }
    Ok(generation)
}

fn make(input: (&Binding,&Candidate), effect: (u64,String), accepted: &ArtifactEvidenceReceipt) -> Result<Publication,String> {
    let (binding,candidate) = input;
    let mut publication = Publication { candidate_id:candidate.candidate_id.clone(),binding_hash:digest(binding)?,
        root_hash:candidate.subject.result_hash.clone(),previous_head:Head { root_hash:candidate.subject.base_hash.clone(),
            generation:candidate.subject.base_generation },generation:effect.0,proof_hash:accepted.receipt_hash.clone(),
        observation_hash:candidate.observation_hash.clone(),omega_receipt_hash:effect.1,assurance:accepted.assurance.clone(),
        semantic_truth_verified:false,promotable:false,external_effects_authorized:false,receipt_hash:String::new() };
    publication.receipt_hash = hash(&publication)?;
    Ok(publication)
}

fn hash(publication: &Publication) -> Result<String,String> {
    let mut value = publication.clone(); value.receipt_hash.clear();
    digest(&("genos.llm.artifact-publication/v1",value))
}

fn persist(tx: &Transaction<'_>, binding: &Binding, publication: &Publication) -> Result<(),String> {
    let changed = data::sql(tx.execute("UPDATE protocol_llm_gqwf_candidates SET status='published',receipt_json=$1
        WHERE scope=$2 AND candidate_id=$3 AND status='prepared'",params![serde_json::to_string(publication).map_err(super::error)?,
            data::scope(binding)?,publication.candidate_id]))?;
    if changed != 1 { return Err("LLM_GQWF_PUBLICATION_STATE_CONFLICT".into()); }
    data::sql(tx.execute("UPDATE rust_protocol_runs SET status='completed' WHERE run_id=$1", [&binding.run_id]))?;
    Store::event(tx,binding,Event { protocol:"GQWF",phase:"ARTIFACT_PUBLISHED",payload:json!(publication) })
}

fn replay(tx: &Transaction<'_>, input: (&Binding,&Candidate), accepted: &ArtifactEvidenceReceipt) -> Result<Publication,String> {
    let (binding,candidate) = input;
    let publication = data::publication(tx,(binding,&candidate.candidate_id))?;
    validate(binding,(&publication,candidate),accepted)?;
    super::super::llm_omega::require_emit_in(tx,binding,(accepted,&publication.omega_receipt_hash))?;
    Ok(publication)
}

fn validate(binding: &Binding, input: (&Publication,&Candidate), accepted: &ArtifactEvidenceReceipt) -> Result<(),String> {
    let (publication,candidate) = input;
    let actual = (&publication.candidate_id,&publication.binding_hash,&publication.root_hash,&publication.proof_hash,
        &publication.observation_hash,&publication.assurance,publication.semantic_truth_verified,publication.promotable,publication.external_effects_authorized);
    let binding_hash = digest(binding)?;
    let expected = (&candidate.candidate_id,&binding_hash,&candidate.subject.result_hash,&accepted.receipt_hash,
        &candidate.observation_hash,&accepted.assurance,false,false,false);
    if actual != expected || publication.receipt_hash != hash(publication)? { return Err("LLM_GQWF_PUBLICATION_RECEIPT_CORRUPT".into()); }
    validate_generation(publication,candidate)
}

fn validate_generation(publication: &Publication, candidate: &Candidate) -> Result<(),String> {
    let generation = candidate.subject.base_generation.checked_add(1).ok_or("LLM_GQWF_GENERATION_OVERFLOW")?;
    let expected = Head { root_hash:candidate.subject.base_hash.clone(),generation:candidate.subject.base_generation };
    if publication.previous_head != expected || publication.generation != generation { return Err("LLM_GQWF_PUBLICATION_BASE_CORRUPT".into()); }
    Ok(())
}

pub(super) fn publication(store: &mut Store, binding: &Binding, id: &str) -> Result<Option<Publication>,String> {
    store.transaction(binding,|tx| {
        data::ensure(tx)?;
        if !data::exists(tx,(binding,id))? { return Ok(None); }
        if data::status(tx,(binding,id))? != "published" { return Ok(None); }
        let candidate = data::candidate(tx,(binding,id))?;
        physical(tx,binding,&candidate)?;
        let accepted = evidence(tx,binding,&candidate)?;
        Ok(Some(replay(tx,(binding,&candidate),&accepted)?))
    })
}

pub(super) fn result_bytes(store: &mut Store, binding: &Binding, id: &str) -> Result<Vec<u8>,String> {
    store.transaction(binding,|tx| {
        let candidate = data::candidate(tx,(binding,id))?;
        if data::status(tx,(binding,id))? != "published" { return Err("LLM_GQWF_PUBLICATION_REQUIRED".into()); }
        let accepted = evidence(tx,binding,&candidate)?;
        replay(tx,(binding,&candidate),&accepted)?;
        physical(tx,binding,&candidate)
    })
}

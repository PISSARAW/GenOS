#[path="llm_gqwf_store.rs"]
mod data;
#[path="llm_gqwf_commit.rs"]
mod commit;
pub use super::gqwf::Head;
use super::{Binding, Event, Store, WorkerRole, digest, raw_hash};
use super::llm_evidence::ArtifactSubject;
use genos_api::native_inference::ModelObservation;
use rusqlite::{Transaction,params};
use serde::{Deserialize, Serialize};
use serde_json::{Value,json};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct Candidate {
    pub candidate_id: String, pub binding_hash: String, pub subject: ArtifactSubject,
    pub sender_store: String, pub receiver_store: String, pub input_blob_hash: String,
    pub native_receipt_hash: String, pub closure_hash: String, pub observation_hash: String, pub origin: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct Publication {
    pub candidate_id: String, pub binding_hash: String, pub root_hash: String, pub previous_head: Head,
    pub generation: u64, pub proof_hash: String, pub observation_hash: String, pub omega_receipt_hash: String,
    pub assurance: String, pub semantic_truth_verified: bool, pub promotable: bool,
    pub external_effects_authorized: bool, pub receipt_hash: String,
}

pub struct Offer<'a> {
    pub candidate_id: &'a str, pub source_bytes: &'a [u8], pub observation: &'a ModelObservation,
    pub subject: &'a ArtifactSubject, pub base: &'a Head,
}

pub struct RecordedOffer<'a> {
    pub candidate_id: &'a str, pub source_bytes: &'a [u8],
    pub evidence: &'a super::llm_evidence::VerifiedArtifactEvidence, pub base: &'a Head,
}

struct MaterialOffer<'a> { candidate_id: &'a str, source_bytes: &'a [u8], subject: &'a ArtifactSubject, base: &'a Head }

impl Candidate {
    fn validate(&self, binding: &Binding) -> Result<(),String> {
        let stores = namespaces(binding)?;
        if self.binding_hash != digest(binding)? || self.subject.env_hash != binding.env_hash
            || self.subject.policy_hash != binding.policy_hash || self.origin != "model_generated" {
            return Err("LLM_GQWF_DESCRIPTOR_BINDING_CHANGED".into());
        }
        if (&self.sender_store,&self.receiver_store) != (&stores.0,&stores.1) { return Err("LLM_GQWF_NAMESPACE_CHANGED".into()); }
        Ok(())
    }
}

fn namespaces(binding: &Binding) -> Result<(String,String),String> {
    Ok((digest(&(binding,"llm-model-sender"))?,digest(&(binding,"llm-artifact-receiver"))?))
}

pub fn initialize(store: &mut Store, binding: &Binding) -> Result<Head,String> { super::gqwf::initialize(store,binding) }
pub fn head(store: &mut Store, binding: &Binding) -> Result<Head,String> { super::gqwf::head(store,binding) }

fn closure(candidate: &Candidate) -> Value {
    json!({"profile":"genos.llm.artifact-closure/v1","binding_hash":candidate.binding_hash,"subject":candidate.subject,
        "origin":candidate.origin,"source_object":candidate.subject.source_hash,"input_object":candidate.input_blob_hash,
        "result_object":candidate.subject.result_hash,"receipt_object":candidate.native_receipt_hash,
        "observation_hash":candidate.observation_hash,"external_effects_authorized":false})
}

pub fn offer(store: &mut Store, binding: &Binding, input: Offer<'_>) -> Result<Candidate,String> {
    if input.candidate_id.is_empty() || input.candidate_id.len()>128 { return Err("LLM_GQWF_CANDIDATE_ID_INVALID".into()); }
    store.transaction(binding,|tx| offer_in(tx,binding,&input))
}

fn offer_in(tx: &Transaction<'_>, binding: &Binding, input: &Offer<'_>) -> Result<Candidate,String> {
    data::ensure(tx)?;
    let (producer,observed) = current_observation(tx,binding,input.observation)?;
    let view = MaterialOffer { candidate_id:input.candidate_id,source_bytes:input.source_bytes,subject:input.subject,base:input.base };
    offer_material(tx,binding,(&view,&producer,&observed))
}

pub fn offer_observed(store: &mut Store, binding: &Binding, input: RecordedOffer<'_>) -> Result<Candidate,String> {
    if input.candidate_id.is_empty() || input.candidate_id.len()>128 { return Err("LLM_GQWF_CANDIDATE_ID_INVALID".into()); }
    store.transaction(binding,|tx| {
        data::ensure(tx)?;
        let accepted = super::llm_evidence::require_in(tx,binding,input.evidence.subject())?;
        let producer = super::llm_synapse::read_in(tx,binding,WorkerRole::Producer)?;
        let observed = super::llm_omega::observed_in(tx,binding,"infer")?;
        if accepted.observation_hash != observed.observation_hash { return Err("LLM_GQWF_RECORDED_OBSERVATION_CHANGED".into()); }
        let view = MaterialOffer { candidate_id:input.candidate_id,source_bytes:input.source_bytes,
            subject:input.evidence.subject(),base:input.base };
        offer_material(tx,binding,(&view,&producer,&observed))
    })
}

fn offer_material(tx: &Transaction<'_>, binding: &Binding,
    input: (&MaterialOffer<'_>,&super::llm_synapse::AppliedContext,&super::llm_omega::ObservedArtifact)) -> Result<Candidate,String> {
    let candidate = descriptor(binding,input.0,(input.1,input.2))?;
    if data::exists(tx,(binding,input.0.candidate_id))? { return exact_offer(tx,binding,&candidate); }
    require_base(tx,binding,&candidate)?;
    put_offer(tx,(binding,&candidate),(input.0,&input.1.payload,input.2))?;
    Ok(candidate)
}

fn current_observation(tx: &Transaction<'_>, binding: &Binding, observation: &ModelObservation)
    -> Result<(super::llm_synapse::AppliedContext,super::llm_omega::ObservedArtifact),String> {
    let producer = super::llm_synapse::read_in(tx,binding,WorkerRole::Producer)?;
    observation.assert_request(&super::llm_synapse::request(binding,&producer)?)?;
    let observed = super::llm_omega::observed_in(tx,binding,"infer")?;
    if observation.receipt_hash() != observed.observation_hash { return Err("LLM_GQWF_OBSERVATION_CHANGED".into()); }
    Ok((producer,observed))
}

fn descriptor(binding: &Binding, input: &MaterialOffer<'_>, current: (&super::llm_synapse::AppliedContext,&super::llm_omega::ObservedArtifact)) -> Result<Candidate,String> {
    validate_subject(binding,input,current)?;
    let stores = namespaces(binding)?;
    let mut candidate = Candidate { candidate_id:input.candidate_id.into(),binding_hash:digest(binding)?,subject:input.subject.clone(),
        sender_store:stores.0,receiver_store:stores.1,input_blob_hash:raw_hash(&serde_json::to_vec(&current.0.payload).map_err(error)?),
        native_receipt_hash:raw_hash(&serde_json::to_vec(&current.1.native_receipt).map_err(error)?),closure_hash:String::new(),
        observation_hash:current.1.observation_hash.clone(),origin:"model_generated".into() };
    candidate.closure_hash = raw_hash(&serde_json::to_vec(&closure(&candidate)).map_err(error)?);
    Ok(candidate)
}

fn validate_subject(binding: &Binding, input: &MaterialOffer<'_>, current: (&super::llm_synapse::AppliedContext,&super::llm_omega::ObservedArtifact)) -> Result<(),String> {
    let expected = ArtifactSubject { source_hash:current.0.source_hash.clone(),input_hash:current.0.input_hash.clone(),
        result_hash:current.1.result_hash.clone(),context_hash:current.0.context_hash.clone(),contract_hash:current.0.contract_hash.clone(),
        base_hash:current.0.world_hash.clone(),base_generation:current.0.world_generation,
        env_hash:binding.env_hash.clone(),policy_hash:binding.policy_hash.clone(),method_hash:super::llm_evidence::method_hash()? };
    let base = Head { root_hash:expected.base_hash.clone(),generation:expected.base_generation };
    if input.subject != &expected || input.base != &base { return Err("LLM_GQWF_SUBJECT_CHANGED".into()); }
    Ok(())
}

fn exact_offer(tx: &Transaction<'_>, binding: &Binding, expected: &Candidate) -> Result<Candidate,String> {
    let previous = data::candidate(tx,(binding,&expected.candidate_id))?;
    if previous != *expected { return Err("LLM_GQWF_OFFER_CONFLICT".into()); }
    Ok(previous)
}

fn put_offer(tx: &Transaction<'_>, identity: (&Binding,&Candidate),
    input: (&MaterialOffer<'_>,&Value,&super::llm_omega::ObservedArtifact)) -> Result<(),String> {
    let (binding,candidate) = identity;
    let source = super::llm_omega::source_in(tx,binding)?;
    if source != input.0.source_bytes || raw_hash(&source) != candidate.subject.source_hash { return Err("LLM_GQWF_SOURCE_CHANGED".into()); }
    put_objects(tx,candidate,(&source,input.1,input.2))?;
    data::insert(tx,binding,candidate)?;
    Store::event(tx,binding,Event { protocol:"GQWF",phase:"OFFER_ARTIFACT",payload:json!(candidate) })
}

fn put_objects(tx: &Transaction<'_>, candidate: &Candidate, input: (&[u8],&Value,&super::llm_omega::ObservedArtifact)) -> Result<(),String> {
    data::put(tx,(&candidate.sender_store,&candidate.subject.source_hash,input.0))?;
    data::put(tx,(&candidate.sender_store,&candidate.input_blob_hash,&serde_json::to_vec(input.1).map_err(error)?))?;
    data::put(tx,(&candidate.sender_store,&candidate.subject.result_hash,&input.2.output))?;
    data::put(tx,(&candidate.sender_store,&candidate.native_receipt_hash,&serde_json::to_vec(&input.2.native_receipt).map_err(error)?))?;
    data::put(tx,(&candidate.sender_store,&candidate.closure_hash,&serde_json::to_vec(&closure(candidate)).map_err(error)?))
}

fn objects(candidate: &Candidate) -> [&str;5] {
    [&candidate.subject.source_hash,&candidate.input_blob_hash,&candidate.subject.result_hash,&candidate.native_receipt_hash,&candidate.closure_hash]
}

pub fn receive(store: &mut Store, binding: &Binding, id: &str) -> Result<Candidate,String> {
    store.transaction(binding,|tx| {
        data::ensure(tx)?; let candidate = data::candidate(tx,(binding,id))?;
        for hash in objects(&candidate) {
            let bytes = data::object_bytes(tx,(&candidate.sender_store,hash))?;
            data::put(tx,(&candidate.receiver_store,hash,&bytes))?;
        }
        if data::status(tx,(binding,id))? == "offered" { data::set_status(tx,(binding,id),"received")?; }
        Ok(candidate)
    })
}

fn physical(tx: &Transaction<'_>, binding: &Binding, candidate: &Candidate) -> Result<Vec<u8>,String> {
    let values = objects(candidate).map(|hash|data::object_bytes(tx,(&candidate.receiver_store,hash)))
        .into_iter().collect::<Result<Vec<_>,_>>()?;
    verify_objects(tx,binding,(candidate,&values))?;
    Ok(values[2].clone())
}

fn verify_objects(tx: &Transaction<'_>, binding: &Binding, input: (&Candidate,&[Vec<u8>])) -> Result<(),String> {
    let (candidate,values) = input;
    verify_input_and_source(tx,binding,input)?;
    let receipt: Value = serde_json::from_slice(&values[3]).map_err(error)?;
    let observed = super::llm_omega::observed_in(tx,binding,"infer")?;
    if receipt != observed.native_receipt || values[2] != observed.output {
        return Err("LLM_GQWF_RECEIVED_ARTIFACT_CHANGED".into());
    }
    if values[4] != serde_json::to_vec(&closure(candidate)).map_err(error)? { return Err("LLM_GQWF_CLOSURE_CHANGED".into()); }
    Ok(())
}

fn verify_input_and_source(tx: &Transaction<'_>, binding: &Binding, input: (&Candidate,&[Vec<u8>])) -> Result<(),String> {
    let payload: Value = serde_json::from_slice(&input.1[1]).map_err(error)?;
    if input.1[0] != super::llm_omega::source_in(tx,binding)? || digest(&payload)? != input.0.subject.input_hash {
        return Err("LLM_GQWF_RECEIVED_SOURCE_CHANGED".into());
    }
    Ok(())
}

fn require_base(tx: &Transaction<'_>, binding: &Binding, candidate: &Candidate) -> Result<(),String> {
    let expected = Head { root_hash:candidate.subject.base_hash.clone(),generation:candidate.subject.base_generation };
    if data::head(tx,binding)? != expected { return Err("LLM_GQWF_BASE_REEVALUATION_REQUIRED".into()); }
    Ok(())
}

pub fn verify(store: &mut Store, binding: &Binding, id: &str) -> Result<Candidate,String> {
    store.transaction(binding,|tx| {
        let candidate = data::candidate(tx,(binding,id))?;
        physical(tx,binding,&candidate)?; require_base(tx,binding,&candidate)?;
        let evidence = super::llm_evidence::require_in(tx,binding,&candidate.subject)?;
        mark_verified(tx,(binding,&candidate),&evidence)?;
        Ok(candidate)
    })
}

fn mark_verified(tx: &Transaction<'_>, input: (&Binding,&Candidate), evidence: &super::llm_evidence::ArtifactEvidenceReceipt) -> Result<(),String> {
    let (binding,candidate) = input;
    let status = data::status(tx,(binding,&candidate.candidate_id))?;
    if matches!(status.as_str(),"verified"|"prepared") {
        if data::proof(tx,(binding,&candidate.candidate_id))? != evidence.receipt_hash { return Err("LLM_GQWF_PROOF_CONFLICT".into()); }
        return Ok(());
    }
    if status != "received" { return Err("LLM_GQWF_RECEIVED_ARTIFACT_REQUIRED".into()); }
    data::sql(tx.execute("UPDATE protocol_llm_gqwf_candidates SET status='verified',proof_hash=$1 WHERE scope=$2 AND candidate_id=$3",
        params![evidence.receipt_hash,data::scope(binding)?,candidate.candidate_id]))?;
    Store::event(tx,binding,Event { protocol:"GQWF",phase:"VERIFY_ARTIFACT",payload:json!({"subject":candidate.subject,"proof":evidence}) })
}

pub fn prepare(store: &mut Store, binding: &Binding, id: &str) -> Result<Candidate,String> { commit::prepare(store,binding,id) }
pub fn commit(store: &mut Store, binding: &Binding, id: &str) -> Result<Publication,String> { commit::commit(store,binding,id) }
pub fn publication(store: &mut Store, binding: &Binding, id: &str) -> Result<Option<Publication>,String> { commit::publication(store,binding,id) }
pub fn result_bytes(store: &mut Store, binding: &Binding, id: &str) -> Result<Vec<u8>,String> { commit::result_bytes(store,binding,id) }
fn error(error: impl std::fmt::Display) -> String { error.to_string() }

use super::{Binding, Event, Store, WorkerRole, digest, raw_hash};
use super::process::{ProcessEvidence, ProcessReceipt};
use super::gqwf_store as data;
use data::sql;
use rusqlite::{OptionalExtension, Transaction, params};
use serde::{Deserialize, Serialize};
use serde_json::json;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct Head { pub root_hash: String, pub generation: u64 }

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct Candidate {
    pub candidate_id: String, pub binding_hash: String, pub sender_store: String, pub receiver_store: String,
    pub root_hash: String, pub closure_hash: String, pub source_hash: String, pub input_hash: String,
    pub context_hash: String, pub base: Head, pub env_hash: String, pub policy_hash: String, pub origin: String,
    pub producer_receipt_hash: String,
}

impl Candidate {
    pub(super) fn validate(&self, binding: &Binding) -> Result<(), String> {
        let binding_hash = digest(binding)?;
        if (&self.binding_hash, &self.env_hash, &self.policy_hash, self.origin.as_str())
            != (&binding_hash, &binding.env_hash, &binding.policy_hash, "isolated") {
            return Err("GQWF_DESCRIPTOR_AUTHORITY_CHANGED".into());
        }
        let stores = namespaces(binding)?;
        if (&self.sender_store, &self.receiver_store) != (&stores.0, &stores.1) { return Err("GQWF_NAMESPACE_CHANGED".into()); }
        if self.context_hash != context_hash(binding, &Context { base: self.base.clone(),
            source_hash: self.source_hash.clone(), input_hash: self.input_hash.clone() })? {
            return Err("GQWF_CONTEXT_CHANGED".into());
        }
        Ok(())
    }
}

fn namespaces(binding: &Binding) -> Result<(String,String), String> {
    Ok((digest(&(&binding.mission_id, &binding.run_id, &binding.actor_id, "producer"))?,
        digest(&(&binding.mission_id, &binding.run_id, &binding.actor_id, "coordinator"))?))
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct Publication {
    pub candidate_id: String, pub binding_hash: String, pub root_hash: String, pub previous_head: Head,
    pub generation: u64, pub proof_hash: String, pub receipt_hash: String, pub external_effects_authorized: bool,
}

pub struct Context { pub base: Head, pub source_hash: String, pub input_hash: String }
pub struct Offer<'a> { pub candidate_id: &'a str, pub producer: &'a ProcessReceipt, pub base: Head, pub input_hash: String }
pub struct Verification<'a> { pub candidate_id: &'a str, pub evidence: &'a ProcessEvidence }
pub struct Commit<'a> { pub candidate_id: &'a str, pub omega_operation_id: &'a str }

pub fn context_hash(binding: &Binding, input: &Context) -> Result<String, String> {
    super::context_digest(binding, &super::ContextCommitment { source_hash: input.source_hash.clone(),
        input_hash: input.input_hash.clone(), base_hash: input.base.root_hash.clone(), base_generation: input.base.generation })
}

fn closure(candidate: &Candidate) -> serde_json::Value {
    json!({"schema":"genos.rust.gqwf.closure/v1","binding_hash":candidate.binding_hash,
        "root_hash":candidate.root_hash,"source_hash":candidate.source_hash,"input_hash":candidate.input_hash,
        "context_hash":candidate.context_hash,"base":candidate.base,"env_hash":candidate.env_hash,
        "policy_hash":candidate.policy_hash,"origin":candidate.origin,"command":"native.integer_sum/v1",
        "producer_receipt_hash":candidate.producer_receipt_hash})
}

pub fn initialize(store: &mut Store, binding: &Binding) -> Result<Head, String> {
    store.transaction(binding, |tx| {
        data::ensure(tx)?;
        let exists: Option<()> = sql(tx.query_row("SELECT 1 FROM protocol_gqwf_heads WHERE scope=$1",
            [data::head_scope(binding)?], |_| Ok(())).optional())?;
        if exists.is_some() { return data::head(tx, binding); }
        bootstrap(tx, binding)
    })
}

fn bootstrap(tx: &Transaction<'_>, binding: &Binding) -> Result<Head, String> {
    let root_hash = raw_hash(b"null");
    let store_id = digest(&(&binding.mission_id, &binding.workspace, "bootstrap"))?;
    data::put(tx, (&store_id, &root_hash, b"null"))?;
    sql(tx.execute("INSERT INTO protocol_gqwf_heads VALUES($1,$2,$3,0)", params![data::head_scope(binding)?, store_id, root_hash]))?;
    let head = data::head(tx, binding)?;
    Store::event(tx, binding, Event { protocol: "GQWF", phase: "INITIALIZE_UNEXECUTED_BASE", payload: json!(head) })?;
    Ok(head)
}

pub fn head(store: &mut Store, binding: &Binding) -> Result<Head, String> {
    store.transaction(binding, |tx| { data::ensure(tx)?; data::head(tx, binding) })
}

fn descriptor(binding: &Binding, input: &Offer<'_>) -> Result<Candidate, String> {
    validate_producer(binding, input)?;
    let stores = namespaces(binding)?;
    let mut candidate = Candidate { candidate_id: input.candidate_id.into(), binding_hash: digest(binding)?,
        sender_store: stores.0, receiver_store: stores.1,
        root_hash: raw_hash(input.producer.output()), closure_hash: String::new(),
        source_hash: input.producer.input_hash().into(), input_hash: input.input_hash.clone(),
        context_hash: input.producer.context_hash().into(), base: input.base.clone(),
        env_hash: binding.env_hash.clone(), policy_hash: binding.policy_hash.clone(), origin: "isolated".into(),
        producer_receipt_hash: digest(input.producer)? };
    if candidate.context_hash != context_hash(binding, &Context { base: candidate.base.clone(),
        source_hash: candidate.source_hash.clone(), input_hash: candidate.input_hash.clone() })? {
        return Err("GQWF_PROOF_BASE_CONTEXT_MISMATCH".into());
    }
    candidate.closure_hash = raw_hash(&serde_json::to_vec(&closure(&candidate)).map_err(|error| error.to_string())?);
    Ok(candidate)
}

fn validate_producer(binding: &Binding, input: &Offer<'_>) -> Result<(), String> {
    input.producer.assert_binding(binding)?;
    if input.producer.role() != WorkerRole::Producer || input.input_hash != input.producer.decoded_input_hash() {
        return Err("GQWF_PRODUCER_PROFILE_MISMATCH".into());
    }
    Ok(())
}

pub fn offer(store: &mut Store, binding: &Binding, input: Offer<'_>) -> Result<Candidate, String> {
    if input.candidate_id.trim().is_empty() || input.candidate_id.len() > 128 { return Err("GQWF_CANDIDATE_ID_INVALID".into()); }
    let candidate = descriptor(binding, &input)?;
    store.transaction(binding, |tx| {
        data::ensure(tx)?;
        if let Some(previous) = existing_offer(tx, (binding, &candidate))? { return Ok(previous); }
        require_base(tx, binding, &candidate)?;
        store_offer(tx, (binding, &candidate), input.producer.output())?;
        Ok(candidate.clone())
    })
}

fn existing_offer(tx: &Transaction<'_>, input: (&Binding, &Candidate)) -> Result<Option<Candidate>, String> {
    let (binding, candidate) = input;
    if !data::existing(tx, (binding, &candidate.candidate_id))? { return Ok(None); }
    let previous = data::candidate(tx, (binding, &candidate.candidate_id))?;
    if previous != *candidate { return Err("GQWF_OFFER_CONFLICT".into()); }
    Ok(Some(previous))
}

fn store_offer(tx: &Transaction<'_>, input: (&Binding, &Candidate), bytes: &[u8]) -> Result<(), String> {
    let (binding, candidate) = input;
    let source = super::omega_store::source_bytes(tx, binding, &candidate.source_hash)?;
    verify_source(candidate, &source)?;
    data::put(tx, (&candidate.sender_store, &candidate.source_hash, &source))?;
    data::put(tx, (&candidate.sender_store, &candidate.root_hash, bytes))?;
    data::put(tx, (&candidate.sender_store, &candidate.closure_hash,
        &serde_json::to_vec(&closure(candidate)).map_err(|error| error.to_string())?))?;
    insert_descriptor(tx, binding, candidate)?;
    Store::event(tx, binding, Event { protocol: "GQWF", phase: "OFFER_WORLD", payload: json!(candidate) })
}

fn insert_descriptor(tx: &Transaction<'_>, binding: &Binding, candidate: &Candidate) -> Result<(), String> {
    sql(tx.execute("INSERT INTO protocol_gqwf_candidates(scope,candidate_id,descriptor_json,descriptor_hash,status)
        VALUES($1,$2,$3,$4,'offered')", params![data::scope(binding)?, candidate.candidate_id,
        serde_json::to_string(candidate).map_err(|error| error.to_string())?, digest(candidate)?]))?;
    Ok(())
}

pub(super) fn require_base(tx: &Transaction<'_>, binding: &Binding, candidate: &Candidate) -> Result<(), String> {
    if data::head(tx, binding)? != candidate.base { return Err("GQWF_BASE_REEVALUATION_REQUIRED".into()); }
    Ok(())
}

pub fn receive(store: &mut Store, binding: &Binding, candidate_id: &str) -> Result<Candidate, String> {
    store.transaction(binding, |tx| {
        data::ensure(tx)?; let candidate = data::candidate(tx, (binding, candidate_id))?;
        for hash in [&candidate.source_hash, &candidate.root_hash, &candidate.closure_hash] {
            let bytes = data::object_bytes(tx, (&candidate.sender_store, hash))?;
            data::put(tx, (&candidate.receiver_store, hash, &bytes))?;
        }
        mark_received(tx, binding, candidate_id)?;
        Ok(candidate)
    })
}

fn mark_received(tx: &Transaction<'_>, binding: &Binding, id: &str) -> Result<(), String> {
    if data::status(tx, (binding, id))? != "offered" { return Ok(()); }
    sql(tx.execute("UPDATE protocol_gqwf_candidates SET status='received' WHERE scope=$1 AND candidate_id=$2",
        params![data::scope(binding)?, id]))?;
    Store::event(tx, binding, Event { protocol: "GQWF", phase: "RECEIVED", payload: json!({"candidate_id":id}) })
}

pub(super) fn physical(tx: &rusqlite::Transaction<'_>, candidate: &Candidate) -> Result<Vec<u8>, String> {
    let source = data::object_bytes(tx, (&candidate.receiver_store, &candidate.source_hash))?;
    verify_source(candidate, &source)?;
    let root = data::object_bytes(tx, (&candidate.receiver_store, &candidate.root_hash))?;
    let actual = data::object_bytes(tx, (&candidate.receiver_store, &candidate.closure_hash))?;
    let expected = serde_json::to_vec(&closure(candidate)).map_err(|error| error.to_string())?;
    if actual != expected || candidate.origin != "isolated" { return Err("GQWF_CLOSURE_CHANGED".into()); }
    Ok(root)
}

fn verify_source(candidate: &Candidate, bytes: &[u8]) -> Result<(), String> {
    let values: Vec<i64> = serde_json::from_slice(bytes).map_err(|error| error.to_string())?;
    super::integer::validate(&values)?;
    if digest(&values)? != candidate.input_hash { return Err("GQWF_SOURCE_DECODED_INPUT_CHANGED".into()); }
    Ok(())
}

pub(super) fn subject(candidate: &Candidate) -> super::evidence::EvidenceSubject {
    super::evidence::EvidenceSubject { source_hash: candidate.source_hash.clone(), result_hash: candidate.root_hash.clone(),
        context_hash: candidate.context_hash.clone() }
}

pub fn verify(store: &mut Store, binding: &Binding, input: Verification<'_>) -> Result<Candidate, String> {
    input.evidence.assert_binding(binding)?;
    store.transaction(binding, |tx| verify_tx(tx, binding, &input))
}

fn verify_tx(tx: &Transaction<'_>, binding: &Binding, input: &Verification<'_>) -> Result<Candidate, String> {
    data::ensure(tx)?; let candidate = data::candidate(tx, (binding, input.candidate_id))?;
    let root = physical(tx, &candidate)?;
    verify_subject(&candidate, input.evidence, &root)?;
    let evidence = super::evidence::require_in(tx, binding, &subject(&candidate))?;
    require_base(tx, binding, &candidate)?;
    mark_verified(tx, (binding, &candidate), &evidence.receipt_hash)?;
    Ok(candidate)
}

fn verify_subject(candidate: &Candidate, evidence: &ProcessEvidence, root: &[u8]) -> Result<(), String> {
    if evidence.source_hash() != candidate.source_hash || evidence.result_hash() != candidate.root_hash
        || evidence.context_hash() != candidate.context_hash || root != evidence.receipts()[0].output() {
        return Err("GQWF_INDEPENDENT_PROOF_SUBJECT_MISMATCH".into());
    }
    if candidate.producer_receipt_hash != digest(evidence.receipts()[0])? { return Err("GQWF_PRODUCER_PROVENANCE_CHANGED".into()); }
    for receipt in evidence.receipts() {
        if receipt.decoded_input_hash() != candidate.input_hash { return Err("GQWF_DECODED_INPUT_MISMATCH".into()); }
    }
    Ok(())
}

fn mark_verified(tx: &Transaction<'_>, input: (&Binding, &Candidate), proof: &str) -> Result<(), String> {
    let (binding, candidate) = input;
    let status = data::status(tx, (binding, &candidate.candidate_id))?;
    if matches!(status.as_str(), "verified" | "prepared") { return verification_replay(tx, input, proof); }
    if status != "received" { return Err("GQWF_RECEIVED_WORLD_REQUIRED".into()); }
    sql(tx.execute("UPDATE protocol_gqwf_candidates SET status='verified',proof_hash=$1 WHERE scope=$2 AND candidate_id=$3",
        params![proof, data::scope(binding)?, candidate.candidate_id]))?;
    Store::event(tx, binding, Event { protocol: "GQWF", phase: "VERIFY_WORLD", payload: json!({"candidate":candidate,"proof":proof}) })
}

fn verification_replay(tx: &Transaction<'_>, input: (&Binding, &Candidate), proof: &str) -> Result<(), String> {
    let held: String = sql(tx.query_row("SELECT proof_hash FROM protocol_gqwf_candidates WHERE scope=$1 AND candidate_id=$2",
        params![data::scope(input.0)?, input.1.candidate_id], |row| row.get(0)))?;
    if held != proof { return Err("GQWF_VERIFICATION_CONFLICT".into()); }
    Ok(())
}

pub fn prepare(store: &mut Store, binding: &Binding, candidate_id: &str) -> Result<Candidate, String> {
    super::gqwf_commit::prepare(store, binding, candidate_id)
}

pub fn commit(store: &mut Store, binding: &Binding, input: Commit<'_>) -> Result<Publication, String> {
    super::gqwf_commit::commit(store, binding, input)
}

pub fn publication(store: &mut Store, binding: &Binding, candidate_id: &str) -> Result<Option<Publication>, String> {
    super::gqwf_commit::publication(store, binding, candidate_id)
}

pub fn result_bytes(store: &mut Store, binding: &Binding, candidate_id: &str) -> Result<Vec<u8>, String> {
    super::gqwf_commit::result_bytes(store, binding, candidate_id)
}

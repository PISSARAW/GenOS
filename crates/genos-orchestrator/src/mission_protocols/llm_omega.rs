#[path="llm_omega_types.rs"]
mod types;
#[path="llm_omega_store.rs"]
mod data;
#[path="llm_omega_failure.rs"]
mod failure;
#[path="llm_omega_issued.rs"]
mod issued;
#[path="llm_omega_emit.rs"]
mod emit;
#[path="llm_omega_base.rs"]
mod base;
pub use types::{InferenceIntent, DispatchPermit, DispatchAdmission, Dispatch, DispatchError, ObservedArtifact};
pub use failure::record_failure;
pub(crate) use emit::{prepare_in as prepare_emit_in, complete_in as complete_emit_in};
pub(crate) use emit::require_in as require_emit_in;
use super::{Binding, Event, Store, WorkerRole, digest, raw_hash};
use genos_api::native_inference::{self, InferenceRequest, ModelObservation};
use rusqlite::{Connection, Transaction, params};
use serde_json::json;

pub fn record_source(store: &mut Store, binding: &Binding, bytes: &[u8]) -> Result<String,String> {
    if bytes.len() > 1_048_576 { return Err("LLM_OMEGA_SOURCE_TOO_LARGE".into()); }
    store.transaction(binding,|tx| {
        data::ensure(tx)?;
        let hash = raw_hash(bytes);
        if super::llm_spec::admitted_in(tx,binding)?.source_hash != hash { return Err("LLM_OMEGA_SOURCE_NOT_ADMITTED".into()); }
        data::sql(tx.execute("INSERT OR IGNORE INTO protocol_llm_source_snapshots VALUES($1,$2,$3)",
            params![binding.mission_id,hash,bytes]))?;
        if data::source(tx,binding)? != bytes { return Err("LLM_OMEGA_SOURCE_CONFLICT".into()); }
        Store::event(tx,binding,Event { protocol:"OMEGA",phase:"READ_RECEIPT",payload:json!({"source_hash":hash}) })?;
        Ok(hash)
    })
}

pub fn begin(store: &mut Store, binding: &Binding, input: InferenceIntent<'_>) -> Result<DispatchAdmission,String> {
    store.transaction(binding,|tx| begin_in(tx,binding,&input))
}

fn begin_in(tx: &Transaction<'_>, binding: &Binding, input: &InferenceIntent<'_>) -> Result<DispatchAdmission,String> {
    data::ensure(tx)?; validate_request(tx,binding,input.request)?;
    data::source(tx,binding)?;
    if data::exists(tx,binding)? { return replay(tx,binding,input.request); }
    let intent = types::StoredIntent { descriptor:native_inference::request_descriptor(input.request),
        request_hash:native_inference::request_hash(input.request)?,max_wall_ms:input.max_wall_ms };
    expose(tx,binding,&intent)?;
    data::insert(tx,binding,&intent)?;
    record_authorization(tx,binding,&intent)?;
    fresh(binding,intent.request_hash)
}

fn fresh(binding: &Binding, request_hash: String) -> Result<DispatchAdmission,String> {
    Ok(DispatchAdmission::Fresh(DispatchPermit { request_hash,binding_hash:digest(binding)? }))
}

fn record_authorization(tx: &Transaction<'_>, binding: &Binding, intent: &types::StoredIntent) -> Result<(),String> {
    Store::event(tx,binding,Event { protocol:"OMEGA",phase:"REQUEST_EFFECT",payload:json!(intent) })?;
    Store::event(tx,binding,Event { protocol:"OMEGA",phase:"AUTHORIZE_EFFECT",payload:json!({"request_hash":intent.request_hash}) })
}

fn expose(tx: &Transaction<'_>, binding: &Binding, intent: &types::StoredIntent) -> Result<(),String> {
    let spec = super::llm_spec::admitted_in(tx,binding)?;
    check_deadline(intent)?;
    super::llm_allostasis::begin_in(tx,binding,&super::llm_allostasis::Exposure { operation_id:"infer".into(),
        request_hash:intent.request_hash.clone(),max_input_tokens:spec.max_input_tokens,
        max_output_tokens:spec.generation.max_output_tokens,max_wall_ms:intent.max_wall_ms })?;
    let admission = super::continuity_effect::begin_in(tx,binding,("llm:infer",&intent.descriptor))?;
    if admission != super::continuity_effect::EffectAdmission::Start { return Err("LLM_OMEGA_DISPATCH_ALREADY_OBSERVED".into()); }
    Ok(())
}

fn check_deadline(intent: &types::StoredIntent) -> Result<(),String> {
    let expiry = intent.descriptor["expires_ms"].as_u64().ok_or("LLM_OMEGA_REQUEST_EXPIRY_REQUIRED")?;
    let now = super::now_ms();
    if expiry <= now || expiry - now > intent.max_wall_ms { return Err("LLM_OMEGA_DEADLINE_EXCEEDS_EXPOSURE".into()); }
    Ok(())
}

fn replay(tx: &Transaction<'_>, binding: &Binding, request: &InferenceRequest) -> Result<DispatchAdmission,String> {
    if data::intent(tx,binding)?.request_hash != native_inference::request_hash(request)? { return Err("LLM_OMEGA_REQUEST_CONFLICT".into()); }
    let status = data::status(tx,binding)?;
    if status == "observed" { return Ok(DispatchAdmission::Completed(data::observed(tx,binding)?)); }
    replay_pending(tx,binding,&status)
}

fn replay_pending(tx: &Transaction<'_>, binding: &Binding, status: &str) -> Result<DispatchAdmission,String> {
    if matches!(status,"failed"|"not_dispatched"|"outcome_unknown") { return Ok(DispatchAdmission::Unknown); }
    data::set_status(tx,binding,"outcome_unknown")?;
    super::llm_allostasis::unknown_in(tx,binding,"infer")?;
    Ok(DispatchAdmission::Unknown)
}

fn validate_request(connection: &Connection, binding: &Binding, request: &InferenceRequest) -> Result<(),String> {
    let context = super::llm_synapse::read_in(connection,binding,WorkerRole::Producer)?;
    base::require(connection,binding,&context)?;
    let reconstructed = super::llm_synapse::request(binding,&context)?;
    if native_inference::request_hash(request)? != native_inference::request_hash(&reconstructed)? {
        return Err("LLM_OMEGA_APPLIED_REQUEST_CHANGED".into());
    }
    let installed = super::llm_roles::require_in(connection,binding,WorkerRole::Producer)?;
    if installed.actor_id != request.actor_id { return Err("LLM_OMEGA_ACTOR_NOT_INSTALLED".into()); }
    validate_admitted(connection,binding,request)
}

fn validate_admitted(connection: &Connection, binding: &Binding, request: &InferenceRequest) -> Result<(),String> {
    let spec = super::llm_spec::admitted_in(connection,binding)?;
    if (&request.provider,&request.generation,&request.messages,request.max_input_tokens)
        != (&spec.provider,&spec.generation,&spec.messages,spec.max_input_tokens) { return Err("LLM_OMEGA_REQUEST_NOT_ADMITTED".into()); }
    Ok(())
}

pub fn dispatch(store: &mut Store, binding: &Binding, input: Dispatch<'_>) -> Result<ModelObservation,DispatchError> {
    store.transaction(binding,|tx| {
        validate_request(tx,binding,input.request)?;
        if input.permit.binding_hash != digest(binding)? || input.permit.request_hash != native_inference::request_hash(input.request)?
            || data::status(tx,binding)? != "intent" { return Err("LLM_OMEGA_DISPATCH_PERMIT_STALE".into()); }
        data::set_status(tx,binding,"dispatching")
    }).map_err(DispatchError::Guard)?;
    let returned = native_inference::execute(input.request);
    seal_returned(store,binding,&returned).map_err(|error| DispatchError::Guard(format!("LLM_OUTCOME_UNKNOWN_RECEIPT_NOT_DURABLE: {error}")))?;
    returned.map_err(DispatchError::Transport)
}

fn seal_returned(store: &mut Store, binding: &Binding, returned: &Result<ModelObservation,native_inference::InferenceFailure>) -> Result<(),String> {
    let (kind,hash,value) = match returned {
        Ok(observation) => ("observation",observation.receipt_hash().to_owned(),serde_json::to_value(observation)),
        Err(failure) => ("failure",issued::failure_hash(failure)?,serde_json::to_value(failure)),
    };
    let value = value.map_err(|error| error.to_string())?;
    store.observation_transaction(binding,|tx| issued::seal(tx,binding,(kind,&hash,&value)))
}

pub fn observe(store: &mut Store, binding: &Binding, observation: &ModelObservation) -> Result<ObservedArtifact,String> {
    store.observation_transaction(binding,|tx| {
        validate_observation(tx,binding,observation)?;
        if data::status(tx,binding)? == "observed" { return exact_replay(tx,binding,observation); }
        let observed = ObservedArtifact::capture(observation)?;
        super::llm_allostasis::observe_in(tx,binding,observation)?;
        persist(tx,binding,&observed)?;
        Ok(observed)
    })
}

fn validate_observation(connection: &Connection, binding: &Binding, observation: &ModelObservation) -> Result<(),String> {
    issued::require(connection,binding,("observation",observation.receipt_hash()))?;
    let intent = data::intent(connection,binding)?;
    if intent.request_hash != observation.request_hash() || observation.binding_hash() != digest(binding)? {
        return Err("LLM_OMEGA_OBSERVATION_REQUEST_CHANGED".into());
    }
    if matches!(data::status(connection,binding)?.as_str(),"not_dispatched"|"failed") { return Err("LLM_OMEGA_TERMINAL_FAILURE".into()); }
    Ok(())
}

fn exact_replay(connection: &Connection, binding: &Binding, observation: &ModelObservation) -> Result<ObservedArtifact,String> {
    let prior = data::observed(connection,binding)?;
    if prior.observation_hash != observation.receipt_hash() { return Err("LLM_OMEGA_OBSERVATION_CONFLICT".into()); }
    Ok(prior)
}

fn persist(tx: &Transaction<'_>, binding: &Binding, observed: &ObservedArtifact) -> Result<(),String> {
    data::save_observed(tx,binding,observed)?;
    Store::event(tx,binding,Event { protocol:"OMEGA",phase:"MODEL_OBSERVED",payload:json!(observed) })?;
    super::continuity_effect::complete_in(tx,binding,("llm:infer",&json!({"observation_hash":observed.observation_hash})))
}

pub fn observed_in(connection: &Connection, binding: &Binding, operation: &str) -> Result<ObservedArtifact,String> {
    super::store::current_checked(connection,binding)?;
    if operation != "infer" { return Err("LLM_OMEGA_OPERATION_NOT_INSTALLED".into()); }
    data::intent(connection,binding)?;
    data::observed(connection,binding)
}

pub(crate) fn source_in(connection: &Connection, binding: &Binding) -> Result<Vec<u8>,String> { data::source(connection,binding) }

pub(crate) fn assert_issued_in(connection: &Connection, binding: &Binding, observation: &ModelObservation) -> Result<(),String> {
    issued::require(connection,binding,("observation",observation.receipt_hash()))
}

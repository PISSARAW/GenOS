use super::{State, data, required, exposure_amount, usage};
use super::super::{Binding, Event, Store, digest};
use genos_api::native_inference::{InferenceFailure, FailurePhase};
use rusqlite::Transaction;
use serde_json::json;

pub(crate) fn failure_in(tx: &Transaction<'_>, binding: &Binding, failure: &InferenceFailure) -> Result<State,String> {
    let mut record = data::exposure(tx,(binding,failure.operation_id()))?.ok_or("LLM_RESOURCE_EXPOSURE_REQUIRED")?;
    verify_failure(binding,&record,failure)?;
    let mut state = required(tx,binding)?;
    let hash = digest(&("genos.llm.failure/v1",failure))?;
    if let Some(prior) = &record.observation_hash {
        if prior != &hash { return Err("LLM_RESOURCE_RECEIPT_CONFLICT".into()); }
        return Ok(state);
    }
    account_failure(&mut state,&mut record,(failure,&hash))?;
    persist(tx,(binding,&record),(failure,&state))?;
    Ok(state)
}

fn verify_failure(binding: &Binding, record: &super::types::Exposed, failure: &InferenceFailure) -> Result<(),String> {
    if record.binding_hash != digest(binding)? || record.input.request_hash != failure.request_hash()
        || failure.binding_hash() != record.binding_hash { return Err("LLM_RESOURCE_FAILURE_BINDING_MISMATCH".into()); }
    Ok(())
}

fn account_failure(state: &mut State, record: &mut super::types::Exposed, input: (&InferenceFailure,&str)) -> Result<(),String> {
    let (failure,hash) = input;
    if failure.phase() == FailurePhase::BeforeDispatch {
        let amount = exposure_amount(&record.input)?;
        state.held.tokens -= amount.tokens; state.held.model_calls -= 1; state.held.wall_ms -= amount.wall_ms;
        if record.status == "outcome_unknown" { state.unknown_operations -= 1; }
        record.status = "not_dispatched".into(); record.observation_hash = Some(hash.into());
        return Ok(());
    }
    let final_usage = if failure.phase()==FailurePhase::OutcomeUnknown { None } else { failure.usage() };
    usage::account(state,record,usage::Measurement { hash,elapsed_ms:failure.elapsed_ms(),usage:final_usage,
        input_tokens:failure.observed_input_tokens(),output_tokens:failure.observed_output_tokens(),total_tokens:failure.observed_total_tokens() })
}

fn persist(tx: &Transaction<'_>, record: (&Binding,&super::types::Exposed), input: (&InferenceFailure,&State)) -> Result<(),String> {
    data::write_exposure(tx,record.1)?; data::write_pool(tx,record.0,input.1)?;
    Store::event(tx,record.0,Event { protocol:"ALLOSTASIS",phase:"MODEL_FAILURE_OBSERVED",payload:json!({
        "operation_id":input.0.operation_id(),"failure":input.0,"state":input.1}) })
}

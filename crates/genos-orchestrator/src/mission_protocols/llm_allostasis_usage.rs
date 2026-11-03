use super::{State, data, exposure_amount, required, types::Exposed};
use super::super::{Binding, Event, Store, digest};
use genos_api::native_inference::{ModelObservation, TokenUsage};
use rusqlite::Transaction;
use serde_json::json;

pub fn settle_observation(store: &mut Store, binding: &Binding, observation: &ModelObservation) -> Result<State,String> {
    store.observation_transaction(binding,|tx| {
        super::super::llm_omega::assert_issued_in(tx,binding,observation)?;
        observe_in(tx,binding,observation)
    })
}

pub(crate) fn observe_in(tx: &Transaction<'_>, binding: &Binding, observation: &ModelObservation) -> Result<State,String> {
    data::ensure(tx)?;
    let mut record = data::exposure(tx,(binding,observation.operation_id()))?.ok_or("LLM_RESOURCE_EXPOSURE_REQUIRED")?;
    verify_observation(binding,&record,observation)?;
    let mut state = required(tx,binding)?;
    if let Some(previous) = &record.observation_hash {
        if previous != observation.receipt_hash() { return Err("LLM_RESOURCE_RECEIPT_CONFLICT".into()); }
        return Ok(state);
    }
    account(&mut state,&mut record,Measurement { hash:observation.receipt_hash(),
        elapsed_ms:observation.elapsed_ms(),usage:observation.usage(),input_tokens:observation.observed_input_tokens(),
        output_tokens:observation.observed_output_tokens(),total_tokens:observation.observed_total_tokens() })?;
    persist(tx,(binding,&record),(observation,&state))?;
    Ok(state)
}

fn persist(tx: &Transaction<'_>, record: (&Binding,&Exposed), fact: (&ModelObservation,&State)) -> Result<(),String> {
    data::write_exposure(tx,record.1)?; data::write_pool(tx,record.0,fact.1)?;
    Store::event(tx,record.0,Event { protocol:"ALLOSTASIS",phase:"MODEL_USAGE_OBSERVED",payload:json!({
        "operation_id":record.1.input.operation_id,"observation_hash":fact.0.receipt_hash(),
        "usage":fact.0.usage(),"elapsed_ms":fact.0.elapsed_ms(),"state":fact.1}) })
}

fn verify_observation(binding: &Binding, record: &Exposed, observation: &ModelObservation) -> Result<(),String> {
    let expected = digest(binding)?;
    if record.binding_hash != expected || observation.binding_hash() != expected
        || observation.request_hash() != record.input.request_hash {
        return Err("LLM_RESOURCE_OBSERVATION_BINDING_MISMATCH".into());
    }
    Ok(())
}

pub(super) struct Measurement<'a> {
    pub hash: &'a str, pub elapsed_ms: u64, pub usage: Option<&'a TokenUsage>,
    pub input_tokens: Option<u64>, pub output_tokens: Option<u64>, pub total_tokens: Option<u64>,
}

pub(super) fn account(state: &mut State, record: &mut Exposed, observation: Measurement<'_>) -> Result<(),String> {
    let exposed = exposure_amount(&record.input)?;
    if record.status == "outcome_unknown" { state.unknown_operations -= 1; }
    state.held.model_calls -= 1; state.held.wall_ms -= exposed.wall_ms;
    add(&mut state.spent.model_calls,1,&mut state.accounting_overflow);
    add(&mut state.spent.wall_ms,observation.elapsed_ms,&mut state.accounting_overflow);
    account_tokens(state,record,&observation);
    record.observation_hash = Some(observation.hash.into()); record.accounted = true;
    state.overrun |= state.accounting_overflow || observation.elapsed_ms > exposed.wall_ms;
    state.overrun |= exceeds(state);
    Ok(())
}

fn account_tokens(state: &mut State, record: &mut Exposed, observation: &Measurement<'_>) {
    let input = observation.usage.map(|usage|usage.input_tokens).or(observation.input_tokens);
    let output = observation.usage.map(|usage|usage.output_tokens).or(observation.output_tokens);
    let mut total = input.unwrap_or(0);
    add(&mut total,output.unwrap_or(0),&mut state.accounting_overflow);
    total = total.max(observation.total_tokens.unwrap_or(0));
    add(&mut state.spent.tokens,total,&mut state.accounting_overflow);
    state.overrun |= input.is_some_and(|count|count>record.input.max_input_tokens)
        || output.is_some_and(|count|count>record.input.max_output_tokens);
    state.overrun |= total > record.input.max_input_tokens.saturating_add(record.input.max_output_tokens);
    if observation.usage.is_none() {
        record.status = "unknown_usage".into(); state.unknown_operations += 1; return;
    }
    state.held.tokens -= record.input.max_input_tokens + record.input.max_output_tokens;
    record.status = "known".into();
}

fn add(value: &mut u64, amount: u64, overflow: &mut bool) {
    match value.checked_add(amount) {
        Some(next) => *value = next,
        None => { *value = u64::MAX; *overflow = true; }
    }
}

fn exceeds(state: &State) -> bool {
    state.spent.tokens > state.limits.tokens.saturating_sub(state.protected.tokens)
        || state.spent.model_calls > state.limits.model_calls.saturating_sub(state.protected.model_calls)
        || state.spent.wall_ms > state.limits.wall_ms.saturating_sub(state.protected.wall_ms)
}

#[path="llm_allostasis_types.rs"]
mod types;
#[path="llm_allostasis_store.rs"]
mod data;
#[path="llm_allostasis_usage.rs"]
mod usage;
#[path="llm_allostasis_failure.rs"]
mod failure;
pub use types::{Limits, Exposure, Amounts, State};
pub use usage::settle_observation;
pub(crate) use usage::observe_in;
pub(crate) use failure::failure_in;
use super::{Binding, Event, Store, digest};
use rusqlite::{Connection, Transaction};
use serde_json::json;

pub fn reserve(store: &mut Store, binding: &Binding, limits: &Limits) -> Result<State,String> {
    store.transaction(binding, |tx| {
        data::ensure(tx)?;
        let spec = super::llm_spec::admitted_in(tx,binding)?;
        if spec.limits != *limits { return Err("LLM_RESOURCE_LIMITS_NOT_ADMITTED".into()); }
        validate_limits(limits)?;
        if let Some(state) = data::pool(tx,binding)? { return existing(state,limits); }
        let state = initial(limits);
        data::write_pool(tx,binding,&state)?;
        Store::event(tx,binding,Event { protocol:"ALLOSTASIS",phase:"MODEL_ALLOCATE",payload:json!(state) })?;
        Ok(state)
    })
}

fn existing(state: State, limits: &Limits) -> Result<State,String> {
    if state.limits != *limits { return Err("LLM_RESOURCE_LIMITS_CONFLICT".into()); }
    Ok(state)
}

pub fn validate_limits(limits: &Limits) -> Result<(),String> {
    for value in [limits.tokens,limits.model_calls,limits.wall_ms] {
        if value < 2 || value > i64::MAX as u64 { return Err("LLM_RESOURCE_LIMIT_OUT_OF_RANGE".into()); }
    }
    Ok(())
}

pub fn validate_demand(limits: &Limits, max_input: u64, max_output: u64) -> Result<(),String> {
    validate_limits(limits)?;
    let tokens = max_input.checked_add(max_output).ok_or("LLM_TOKEN_EXPOSURE_OVERFLOW")?;
    if max_input == 0 || max_output == 0 || tokens > limits.tokens - limits.tokens.div_ceil(20) {
        return Err("LLM_TOKEN_DEMAND_EXCEEDS_ORDINARY_BUDGET".into());
    }
    Ok(())
}

fn initial(limits: &Limits) -> State {
    State { limits:limits.clone(),protected:Amounts { tokens:limits.tokens.div_ceil(20),
        model_calls:limits.model_calls.div_ceil(20),wall_ms:limits.wall_ms.div_ceil(20) },
        spent:Amounts::default(),held:Amounts::default(),overrun:false,accounting_overflow:false,released:false,unknown_operations:0 }
}

pub(crate) fn begin_in(tx: &Transaction<'_>, binding: &Binding, input: &Exposure) -> Result<(),String> {
    data::ensure(tx)?;
    validate_exposure(tx,binding,input)?;
    if data::exposure(tx,(binding,&input.operation_id))?.is_some() { return Err("LLM_RESOURCE_ALREADY_EXPOSED".into()); }
    let mut state = required(tx,binding)?;
    let amount = exposure_amount(input)?;
    check_available(&state,&amount)?;
    state.held.tokens += amount.tokens; state.held.model_calls += 1; state.held.wall_ms += amount.wall_ms;
    data::write_exposure(tx,&data::new_exposure(binding,input.clone())?)?;
    data::write_pool(tx,binding,&state)?;
    Store::event(tx,binding,Event { protocol:"ALLOSTASIS",phase:"MODEL_EXPOSE",payload:json!(input) })
}

fn validate_exposure(tx: &Transaction<'_>, binding: &Binding, input: &Exposure) -> Result<(),String> {
    let spec = super::llm_spec::admitted_in(tx,binding)?;
    if input.operation_id != "infer" || input.request_hash.is_empty() || input.max_wall_ms == 0 {
        return Err("LLM_RESOURCE_EXPOSURE_INVALID".into());
    }
    if input.max_input_tokens != spec.max_input_tokens || input.max_output_tokens != spec.generation.max_output_tokens
        || input.max_wall_ms > spec.timeout_ms { return Err("LLM_RESOURCE_EXPOSURE_NOT_ADMITTED".into()); }
    Ok(())
}

fn exposure_amount(input: &Exposure) -> Result<Amounts,String> {
    let tokens = input.max_input_tokens.checked_add(input.max_output_tokens).ok_or("LLM_TOKEN_EXPOSURE_OVERFLOW")?;
    Ok(Amounts { tokens,model_calls:1,wall_ms:input.max_wall_ms })
}

fn check_available(state: &State, amount: &Amounts) -> Result<(),String> {
    if state.overrun || state.released { return Err("LLM_RESOURCE_CLOSED_OR_OVERRUN".into()); }
    for (limit,protected,spent,held,requested) in [
        (state.limits.tokens,state.protected.tokens,state.spent.tokens,state.held.tokens,amount.tokens),
        (state.limits.model_calls,state.protected.model_calls,state.spent.model_calls,state.held.model_calls,amount.model_calls),
        (state.limits.wall_ms,state.protected.wall_ms,state.spent.wall_ms,state.held.wall_ms,amount.wall_ms),
    ] {
        let available = limit.saturating_sub(protected).saturating_sub(spent).saturating_sub(held);
        if requested > available { return Err("LLM_RESOURCE_BUDGET_UNAVAILABLE".into()); }
    }
    Ok(())
}

pub(crate) fn required(connection: &Connection, binding: &Binding) -> Result<State,String> {
    data::pool(connection,binding)?.ok_or("LLM_RESOURCE_POOL_REQUIRED".into())
}

pub fn state(store: &mut Store, binding: &Binding) -> Result<State,String> {
    store.observation_transaction(binding,|tx| { data::ensure(tx)?; required(tx,binding) })
}

pub fn mark_unknown(store: &mut Store, binding: &Binding, operation_id: &str) -> Result<State,String> {
    store.observation_transaction(binding,|tx| unknown_in(tx,binding,operation_id))
}

pub(crate) fn unknown_in(tx: &Transaction<'_>, binding: &Binding, operation_id: &str) -> Result<State,String> {
    data::ensure(tx)?;
    let mut record = data::exposure(tx,(binding,operation_id))?.ok_or("LLM_RESOURCE_EXPOSURE_REQUIRED")?;
    let mut state = required(tx,binding)?;
    if record.status != "active" { return Ok(state); }
    if record.binding_hash != digest(binding)? { return Err("LLM_RESOURCE_BINDING_MISMATCH".into()); }
    record.status = "outcome_unknown".into(); state.unknown_operations += 1;
    data::write_exposure(tx,&record)?; data::write_pool(tx,binding,&state)?;
    Store::event(tx,binding,Event { protocol:"ALLOSTASIS",phase:"MODEL_OUTCOME_UNKNOWN",payload:json!({"operation_id":operation_id}) })?;
    Ok(state)
}

pub(crate) fn assert_publishable_in(connection: &Connection, binding: &Binding) -> Result<(),String> {
    let state = required(connection,binding)?;
    if state.overrun || state.unknown_operations != 0 || state.held != Amounts::default() {
        return Err("LLM_RESOURCE_RECONCILIATION_OR_OVERRUN".into());
    }
    Ok(())
}

pub fn release(store: &mut Store, binding: &Binding) -> Result<State,String> {
    store.observation_transaction(binding,|tx| {
        data::ensure(tx)?; assert_publishable_in(tx,binding)?;
        let mut state = required(tx,binding)?;
        if state.released { return Ok(state); }
        state.released = true;
        data::write_pool(tx,binding,&state)?;
        Store::event(tx,binding,Event { protocol:"ALLOSTASIS",phase:"MODEL_RELEASE",payload:json!({"consumption_refunded":false}) })?;
        Ok(state)
    })
}

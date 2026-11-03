use super::{Amounts, Binding, Event, MissionState, Store, data};
use super::super::agentic_spec::AgenticLimits;
use rusqlite::{Connection,Transaction};
use serde_json::json;

pub(super) fn initialize(tx:&Transaction<'_>, binding:&Binding, limits:&AgenticLimits) -> Result<MissionState,String> {
    if let Some(existing)=data::pool(tx,binding)? {
        if existing.limits!=*limits { return Err("AGENTIC_BUDGET_LIMITS_CHANGED".into()); }
        return Ok(existing);
    }
    let value=MissionState { limits:limits.clone(),protected:Amounts { tokens:limits.tokens.div_ceil(20),
        model_calls:limits.model_calls.div_ceil(20),tool_calls:limits.tool_calls.div_ceil(20),wall_ms:limits.wall_ms.div_ceil(20) },
        spent:Amounts::default(),held:Amounts::default(),unknown_operations:0,overrun:false,accounting_overflow:false,released:false };
    data::write_pool(tx,binding,&value)?;
    Store::event(tx,binding,Event { protocol:"ALLOSTASIS",phase:"AGENTIC_MISSION_ALLOCATED",payload:json!(value) })?;
    Ok(value)
}

pub(super) fn required(connection:&Connection, binding:&Binding) -> Result<MissionState,String> {
    let state=data::pool(connection,binding)?.ok_or("AGENTIC_MISSION_BUDGET_REQUIRED")?;
    let spec=super::super::agentic_admission::admitted_in(connection,binding)?;
    if state.limits!=spec.config.limits { return Err("AGENTIC_BUDGET_NOT_ADMITTED".into()); }
    Ok(state)
}

pub(super) fn expose(connection:&Connection, binding:&Binding, amount:&Amounts) -> Result<(),String> {
    let mut state=required(connection,binding)?;
    available(&state,amount)?;
    state.held.tokens=checked_add(state.held.tokens,amount.tokens)?;
    state.held.model_calls=checked_add(state.held.model_calls,amount.model_calls)?;
    state.held.tool_calls=checked_add(state.held.tool_calls,amount.tool_calls)?;
    state.held.wall_ms=checked_add(state.held.wall_ms,amount.wall_ms)?;
    data::write_pool(connection,binding,&state)
}

pub(super) fn available(state:&MissionState, amount:&Amounts) -> Result<(),String> {
    if state.released || state.overrun || state.accounting_overflow || state.unknown_operations!=0 {
        return Err("AGENTIC_BUDGET_CLOSED_OR_UNRESOLVED".into());
    }
    for (limit,reserve,spent,held,next) in [
        (state.limits.tokens,state.protected.tokens,state.spent.tokens,state.held.tokens,amount.tokens),
        (state.limits.model_calls,state.protected.model_calls,state.spent.model_calls,state.held.model_calls,amount.model_calls),
        (state.limits.tool_calls,state.protected.tool_calls,state.spent.tool_calls,state.held.tool_calls,amount.tool_calls),
        (state.limits.wall_ms,state.protected.wall_ms,state.spent.wall_ms,state.held.wall_ms,amount.wall_ms),
    ] {
        if next>limit.saturating_sub(reserve).saturating_sub(spent).saturating_sub(held) {
            return Err("AGENTIC_MISSION_BUDGET_UNAVAILABLE".into());
        }
    }
    Ok(())
}

pub(super) struct Charge {
    pub held:Amounts, pub input:Option<u64>, pub output:Option<u64>, pub total:Option<u64>,
    pub input_limit:u64, pub output_limit:u64,
    pub usage_known:bool, pub dispatched:bool, pub elapsed_ms:u64, pub counted_unknown:bool,
    pub retain_exposure:bool,
}

pub(super) fn settle(connection:&Connection, binding:&Binding, charge:&Charge) -> Result<(),String> {
    let mut state=required(connection,binding)?;
    if charge.counted_unknown { state.unknown_operations=state.unknown_operations.checked_sub(1).ok_or("AGENTIC_UNKNOWN_COUNT_CORRUPT")?; }
    if !charge.retain_exposure { subtract(&mut state.held,&charge.held)?; }
    if charge.dispatched { account(&mut state,charge); }
    state.overrun |= exceeds(&state) || state.accounting_overflow;
    data::write_pool(connection,binding,&state)
}

fn subtract(held:&mut Amounts, amount:&Amounts) -> Result<(),String> {
    held.tokens=held.tokens.checked_sub(amount.tokens).ok_or("AGENTIC_HELD_TOKENS_CORRUPT")?;
    held.model_calls=held.model_calls.checked_sub(amount.model_calls).ok_or("AGENTIC_HELD_MODELS_CORRUPT")?;
    held.tool_calls=held.tool_calls.checked_sub(amount.tool_calls).ok_or("AGENTIC_HELD_TOOLS_CORRUPT")?;
    held.wall_ms=held.wall_ms.checked_sub(amount.wall_ms).ok_or("AGENTIC_HELD_WALL_CORRUPT")?;
    Ok(())
}

fn account(state:&mut MissionState, charge:&Charge) {
    let known=charge.input.unwrap_or(0).saturating_add(charge.output.unwrap_or(0)).max(charge.total.unwrap_or(0));
    add(state,Amounts { tokens:known,model_calls:charge.held.model_calls,tool_calls:charge.held.tool_calls,wall_ms:charge.elapsed_ms });
    state.overrun |= known>charge.held.tokens || charge.elapsed_ms>charge.held.wall_ms;
    state.overrun |= charge.input.is_some_and(|count|count>charge.input_limit)
        || charge.output.is_some_and(|count|count>charge.output_limit);
    if !charge.usage_known {
        if !charge.retain_exposure { state.held.tokens=state.held.tokens.saturating_add(charge.held.tokens); }
        state.unknown_operations=state.unknown_operations.saturating_add(1);
    }
}

fn add(state:&mut MissionState, spent:Amounts) {
    add_one(&mut state.spent.tokens,spent.tokens,&mut state.accounting_overflow);
    add_one(&mut state.spent.model_calls,spent.model_calls,&mut state.accounting_overflow);
    add_one(&mut state.spent.tool_calls,spent.tool_calls,&mut state.accounting_overflow);
    add_one(&mut state.spent.wall_ms,spent.wall_ms,&mut state.accounting_overflow);
}

fn add_one(value:&mut u64, amount:u64, overflow:&mut bool) {
    match value.checked_add(amount) { Some(next)=>*value=next, None=> { *value=u64::MAX;*overflow=true; } }
}

fn checked_add(value:u64, amount:u64) -> Result<u64,String> { value.checked_add(amount).ok_or("AGENTIC_BUDGET_OVERFLOW".into()) }

pub(super) fn exceeds(state:&MissionState) -> bool {
    state.spent.tokens>state.limits.tokens.saturating_sub(state.protected.tokens)
        || state.spent.model_calls>state.limits.model_calls.saturating_sub(state.protected.model_calls)
        || state.spent.tool_calls>state.limits.tool_calls.saturating_sub(state.protected.tool_calls)
        || state.spent.wall_ms>state.limits.wall_ms.saturating_sub(state.protected.wall_ms)
}

pub(super) fn model_amount(input:u64, output:u64, wall:u64) -> Result<Amounts,String> {
    Ok(Amounts { tokens:checked_add(input,output)?,model_calls:1,tool_calls:0,wall_ms:wall })
}

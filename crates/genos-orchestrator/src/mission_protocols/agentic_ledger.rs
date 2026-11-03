//! Journal durable des tours réels, budgets de mission et progression des agents.
use super::{Binding, Event, Store, digest, now_ms, raw_hash};
use rusqlite::Connection;

#[path="agentic_ledger_types.rs"]
mod types;
#[path="agentic_ledger_data.rs"]
mod data;
#[path="agentic_ledger_roster.rs"]
mod roster;
#[path="agentic_ledger_budget.rs"]
mod budget;
#[path="agentic_ledger_model.rs"]
mod model;
#[path="agentic_ledger_records.rs"]
mod records;
#[path="agentic_ledger_agents.rs"]
mod agents;
#[path="agentic_ledger_tools.rs"]
mod tools;

#[cfg(test)]
#[path="agentic_ledger_parallel_tests.rs"]
mod parallel_tests;

pub use types::{StepKey,Amounts,MissionState,ModelIntent,ModelPermit,ModelAdmission,ModelDispatch,DispatchError,
    ModelRecord,CompletedAgent,AgentCompletion,ToolIntent,ToolAdmission,ToolCost};
pub use model::{prepare_model,dispatch_model};
pub(crate) use model::prepare_model_in;
pub(crate) use types::{DispatchCapacity,ModelIntentScope};
pub use records::model_record_in;
pub use agents::{complete_agent,completed_in};
pub use tools::tool_request_hash;
pub(crate) use tools::{begin_tool_in,complete_tool_in,assert_tool_complete_in};
pub use roster::require_actor_in;

pub fn initialize(store:&mut Store, binding:&Binding) -> Result<MissionState,String> {
    store.transaction(binding,|tx| {
        data::ensure(tx)?;
        let spec=super::agentic_admission::admitted_in(tx,binding)?;
        roster::install(tx,binding,&spec)?;
        super::agentic_evidence::install_in(tx,binding)?;
        budget::initialize(tx,binding,&spec.config.limits)
    })
}

pub fn state(store:&mut Store, binding:&Binding) -> Result<MissionState,String> {
    store.observation_transaction(binding,|tx|budget::required(tx,binding))
}

pub(crate) fn state_in(connection:&Connection, binding:&Binding) -> Result<MissionState,String> {
    super::store::current_checked(connection,binding)?;
    budget::required(connection,binding)
}

pub(crate) fn remaining_wall_in(connection:&Connection, binding:&Binding) -> Result<u64,String> {
    Ok(dispatch_capacity_in(connection,binding)?.wall_ms)
}

pub(crate) fn dispatch_capacity_in(connection:&Connection, binding:&Binding) -> Result<DispatchCapacity,String> {
    let state=state_in(connection,binding)?;
    budget::available(&state,&Amounts::default())?;
    if budget::exceeds(&state) { return Err("AGENTIC_BUDGET_DEBT".into()); }
    Ok(DispatchCapacity {
        wall_ms:state.limits.wall_ms.saturating_sub(state.protected.wall_ms).saturating_sub(state.spent.wall_ms).saturating_sub(state.held.wall_ms),
        tokens:state.limits.tokens.saturating_sub(state.protected.tokens).saturating_sub(state.spent.tokens).saturating_sub(state.held.tokens),
        model_calls:state.limits.model_calls.saturating_sub(state.protected.model_calls).saturating_sub(state.spent.model_calls).saturating_sub(state.held.model_calls),
    })
}

pub(crate) fn intent_scope_in(connection:&Connection, binding:&Binding, key:&StepKey) -> Result<ModelIntentScope,String> {
    super::store::current_checked(connection,binding)?;
    let intent=records::intent(connection,binding,key)?;
    let status=data::model_status(connection,binding,key)?.ok_or("AGENTIC_MODEL_INTENT_REQUIRED")?;
    Ok(ModelIntentScope { key:intent.key,binding_hash:intent.binding_hash,request_hash:intent.request_hash,
        max_wall_ms:intent.max_wall_ms,status })
}

pub fn known_model(store:&mut Store, binding:&Binding, key:&StepKey) -> Result<Option<ModelRecord>,String> {
    store.transaction(binding,|tx| {
        require_actor_in(tx,binding,&key.agent_id)?;
        let Some(status)=data::model_status(tx,binding,key)? else { return Ok(None); };
        if status!="observed" { return Err(format!("AGENTIC_MODEL_NOT_SETTLED: {status}")); }
        model_record_in(tx,binding,key).map(Some)
    })
}

pub fn model_record(store:&mut Store, binding:&Binding, key:&StepKey) -> Result<ModelRecord,String> {
    store.transaction(binding,|tx|model_record_in(tx,binding,key))
}

pub fn model_in(connection:&Connection, binding:&Binding, key:&StepKey) -> Result<ModelRecord,String> {
    model_record_in(connection,binding,key)
}

pub fn agent_record(store:&mut Store, binding:&Binding, id:&str) -> Result<Option<CompletedAgent>,String> {
    store.transaction(binding,|tx|completed_in(tx,binding,id))
}

pub(crate) fn assert_publishable_in(connection:&Connection, binding:&Binding) -> Result<(),String> {
    super::store::current_checked(connection,binding)?;
    let value=budget::required(connection,binding)?;
    if value.overrun || value.accounting_overflow || value.unknown_operations!=0 || value.held!=Amounts::default() {
        return Err("AGENTIC_RESOURCE_UNRESOLVED_OR_OVERRUN".into());
    }
    if data::pending(connection,binding)?!=0 { return Err("AGENTIC_OPERATION_PENDING".into()); }
    let spec=super::agentic_admission::admitted_in(connection,binding)?;
    agents::require_all(connection,binding,&spec)
}

pub fn release(store:&mut Store, binding:&Binding) -> Result<MissionState,String> {
    store.transaction(binding,|tx| {
        assert_publishable_in(tx,binding)?;
        let mut value=budget::required(tx,binding)?;
        value.released=true;
        data::write_pool(tx,binding,&value)?;
        Ok(value)
    })
}

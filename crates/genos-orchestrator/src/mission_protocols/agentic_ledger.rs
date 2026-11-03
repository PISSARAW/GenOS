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

pub use types::{StepKey,Amounts,MissionState,ModelIntent,ModelPermit,ModelAdmission,ModelDispatch,DispatchError,
    ModelRecord,CompletedAgent,AgentCompletion,ToolIntent,ToolAdmission,ToolCost};
pub use model::{prepare_model,dispatch_model};
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
    let state=state_in(connection,binding)?;
    budget::available(&state,&Amounts::default())?;
    Ok(state.limits.wall_ms.saturating_sub(state.protected.wall_ms)
        .saturating_sub(state.spent.wall_ms).saturating_sub(state.held.wall_ms))
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

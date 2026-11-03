use super::{Assignment,Binding,Arguments,agentic_admission,agentic_ledger,data,digest,raw_hash};
use genos_api::native_inference::Finish;
use rusqlite::Connection;

pub(super) fn assignment(connection:&Connection, binding:&Binding, value:&Assignment) -> Result<(),String> {
    scope(connection,binding,value)?;
    native_call(connection,binding,value)?;
    data::require_event(connection,binding,value)?;
    native_receipt(connection,binding,value)?;
    super::super::agentic_delegation_exchange::require_task_in(connection,binding,value).map(|_|())
}

fn scope(connection:&Connection, binding:&Binding, value:&Assignment) -> Result<(),String> {
    let spec=agentic_admission::admitted_in(connection,binding)?;
    let profile=spec.config.orchestration.as_ref().ok_or("AGENTIC_DELEGATION_PROFILE_REQUIRED")?;
    if value.binding_hash!=digest(binding)? || value.parent.agent_id!=profile.coordinator || value.worker_id==profile.coordinator
        || spec.agent(&value.worker_id).is_err() { return Err("AGENTIC_DELEGATION_SCOPE_CHANGED".into()); }
    hashes(value)
}

fn hashes(value:&Assignment) -> Result<(),String> {
    if value.assignment_hash!=super::hash(value)? || value.task_hash!=raw_hash(value.task.as_bytes()) {
        return Err("AGENTIC_DELEGATION_HASH_CHANGED".into());
    }
    Ok(())
}

fn native_call(connection:&Connection, binding:&Binding, value:&Assignment) -> Result<(),String> {
    let model=agentic_ledger::model_record_in(connection,binding,&value.parent)?;
    if model.model_hash!=value.model_hash || !model.usage_known || model.finish!=Finish::ToolRequested {
        return Err("AGENTIC_DELEGATION_SOURCE_MODEL_CHANGED".into());
    }
    let call=model.tool_calls.get(value.call_index as usize).ok_or("AGENTIC_DELEGATION_SOURCE_CALL_MISSING")?;
    exact_call(call,value)
}

fn exact_call(call:&genos_api::native_inference::ToolCall,value:&Assignment) -> Result<(),String> {
    let args:Arguments=serde_json::from_value(call.arguments.clone()).map_err(|error|error.to_string())?;
    if call.id!=value.call_id || call.name!="delegate_task" || args.agent_id!=value.worker_id || args.task!=value.task {
        return Err("AGENTIC_DELEGATION_SOURCE_CALL_CHANGED".into());
    }
    Ok(())
}

fn native_receipt(connection:&Connection, binding:&Binding, value:&Assignment) -> Result<(),String> {
    let operation=format!("tool/{}/{}/{}",value.parent.agent_id,value.parent.turn,value.call_index);
    let receipt=super::super::agentic_tools::receipt_in(connection,binding,&operation)?;
    if receipt.parent_model_hash()!=value.model_hash || receipt.call_id()!=value.call_id || receipt.output()!=&super::accepted(value) {
        return Err("AGENTIC_DELEGATION_SOURCE_RECEIPT_CHANGED".into());
    }
    Ok(())
}

//! Affectations natives bornées de rôles préadmis ; une tâche ne crée aucun droit.
#[path="agentic_delegation_store.rs"] mod data;
#[path="agentic_delegation_checks.rs"] mod checks;
#[cfg(test)]
#[path="agentic_delegation_tests.rs"] mod tests;
use super::{Binding,Store,Event,digest,raw_hash,agentic_admission,agentic_ledger,agentic_spec::OrchestrationConfig};
use agentic_ledger::{ModelRecord,StepKey};
use genos_api::native_inference::{ToolCall,Finish};
use rusqlite::{Connection,Transaction};
use serde::{Deserialize,Serialize};
use serde_json::{Value,json};

#[derive(Clone,Debug,Deserialize,Serialize,PartialEq,Eq)]
pub struct Assignment {
    pub worker_id:String,pub parent:StepKey,pub call_index:u32,pub call_id:String,pub task:String,
    pub task_hash:String,pub model_hash:String,pub assignment_hash:String,pub binding_hash:String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Arguments { agent_id:String,task:String }

pub(crate) fn initialize_in(tx:&Transaction<'_>, binding:&Binding) -> Result<(),String> {
    if mode(tx,binding)?.is_some() { data::ensure(tx)?; }
    Ok(())
}

fn mode(connection:&Connection, binding:&Binding) -> Result<Option<OrchestrationConfig>,String> {
    Ok(agentic_admission::admitted_in(connection,binding)?.config.orchestration)
}

pub(crate) fn delegate_in(tx:&Transaction<'_>, binding:&Binding, source:(&ModelRecord,&ToolCall)) -> Result<Value,String> {
    let model=agentic_ledger::model_record_in(tx,binding,&source.0.key)?;
    if model!=*source.0 || !model.usage_known || model.finish!=Finish::ToolRequested {
        return Err("AGENTIC_DELEGATION_NATIVE_MODEL_CHANGED".into());
    }
    let index=model.tool_calls.iter().position(|call|call==source.1).ok_or("AGENTIC_DELEGATION_NATIVE_CALL_CHANGED")?;
    let Some(profile)=mode(tx,binding)? else { return Ok(denied("AGENTIC_DELEGATION_PROFILE_REQUIRED")); };
    if !profile.can_delegate(&model.key.agent_id) || source.1.name!="delegate_task" {
        return Ok(denied("AGENTIC_DELEGATION_COORDINATOR_REQUIRED"));
    }
    let args:Arguments=match serde_json::from_value(source.1.arguments.clone()) {
        Ok(args)=>args,Err(_)=>return Ok(denied("AGENTIC_DELEGATION_ARGUMENTS_INVALID")),
    };
    declare(tx,binding,(&model,index as u32,args))
}

fn declare(tx:&Transaction<'_>, binding:&Binding, input:(&ModelRecord,u32,Arguments)) -> Result<Value,String> {
    let (model,index,args)=input;
    if let Some(reason)=admission(tx,binding,(&args,&model.key))? { return Ok(denied(reason)); }
    let call=&model.tool_calls[index as usize];
    let mut assignment=Assignment { worker_id:args.agent_id,parent:model.key.clone(),call_index:index,call_id:call.id.clone(),
        task_hash:raw_hash(args.task.as_bytes()),task:args.task,model_hash:model.model_hash.clone(),
        assignment_hash:String::new(),binding_hash:digest(binding)? };
    assignment.assignment_hash=hash(&assignment)?;
    data::insert(tx,binding,&assignment)?;
    Store::event(tx,binding,Event { protocol:"MORPH",phase:"AGENTIC_WORKER_ASSIGNED",payload:json!(assignment) })?;
    super::agentic_delegation_exchange::task_delivery_in(tx,binding,&assignment)?;
    Ok(accepted(&assignment))
}

fn admission(connection:&Connection, binding:&Binding, input:(&Arguments,&StepKey)) -> Result<Option<&'static str>,String> {
    let (args,parent)=input;let spec=agentic_admission::admitted_in(connection,binding)?;
    let profile=spec.config.orchestration.as_ref().ok_or("AGENTIC_DELEGATION_PROFILE_REQUIRED")?;
    if let Some(reason)=parent_policy(&spec,args,parent)? { return Ok(Some(reason)); }
    require_parent_active_in(connection,binding,&parent.agent_id)?;
    if data::assigned(connection,binding,&args.agent_id)?.is_some() { return Ok(Some("AGENTIC_DELEGATION_WORKER_ALREADY_ASSIGNED")); }
    if all_in(connection,binding)?.len()>=profile.max_delegations as usize { return Ok(Some("AGENTIC_DELEGATION_LIMIT_EXHAUSTED")); }
    if agentic_ledger::completed_in(connection,binding,&parent.agent_id)?.is_some() {
        return Ok(Some("AGENTIC_DELEGATION_COORDINATOR_COMPLETED"));
    }
    agentic_ledger::require_actor_in(connection,binding,&args.agent_id)?;
    Ok(None)
}

fn argument_limit(spec:&super::agentic_spec::AgenticSpec, args:&Arguments) -> Option<&'static str> {
    if args.task.trim().is_empty() || args.task.len()>4096 || args.task.contains('\0') {
        return Some("AGENTIC_DELEGATION_TASK_INVALID");
    }
    let coordinator=&spec.config.orchestration.as_ref()?.coordinator;
    if &args.agent_id==coordinator || spec.agent(&args.agent_id).is_err() {
        return Some("AGENTIC_DELEGATION_WORKER_NOT_ADMITTED");
    }
    None
}

pub(crate) fn assigned_in(connection:&Connection, binding:&Binding, worker:&str) -> Result<Option<Assignment>,String> {
    super::store::current_checked(connection,binding)?;
    if mode(connection,binding)?.is_none() { return Ok(None); }
    let assignment=data::assigned(connection,binding,worker)?;
    match &assignment {
        Some(value)=>checks::assignment(connection,binding,value)?,
        None=>data::missing_assignment(connection,binding,worker)?,
    }
    Ok(assignment)
}

pub(crate) fn all_in(connection:&Connection, binding:&Binding) -> Result<Vec<Assignment>,String> {
    super::store::current_checked(connection,binding)?;
    if mode(connection,binding)?.is_none() { return Ok(vec![]); }
    selected(connection,binding,None)
}

pub(crate) fn before_in(connection:&Connection, binding:&Binding, key:&StepKey) -> Result<Vec<Assignment>,String> {
    super::store::current_checked(connection,binding)?;
    if mode(connection,binding)?.is_none() { return Ok(vec![]); }
    selected(connection,binding,Some(key))
}

fn selected(connection:&Connection, binding:&Binding, before:Option<&StepKey>) -> Result<Vec<Assignment>,String> {
    // Filter the causal prefix before validating receipts: future tool effects do not rewrite old contexts.
    let values=data::selected(connection,binding,before)?;
    for value in &values { checks::assignment(connection,binding,value)?; }
    data::coverage(connection,binding,(&values,before))?;
    Ok(values)
}

pub(crate) fn eligible_in(connection:&Connection, binding:&Binding, key:&StepKey) -> Result<bool,String> {
    super::store::current_checked(connection,binding)?;
    let Some(profile)=mode(connection,binding)? else { return Ok(true); };
    if key.agent_id!=profile.coordinator && assigned_in(connection,binding,&key.agent_id)?.is_none() { return Ok(false); }
    for assignment in before_in(connection,binding,key)? {
        if agentic_ledger::completed_in(connection,binding,&assignment.worker_id)?.is_none() { return Ok(false); }
    }
    super::agentic_delegation_exchange::view_in(connection,binding,key)?;
    Ok(true)
}

pub(crate) fn require_all_in(connection:&Connection, binding:&Binding) -> Result<(),String> {
    let profile=mode(connection,binding)?.ok_or("AGENTIC_DELEGATION_PROFILE_REQUIRED")?;
    let assignments=all_in(connection,binding)?;
    let mut expected=std::collections::BTreeSet::from([profile.coordinator.clone()]);
    for assignment in &assignments { expected.insert(assignment.worker_id.clone()); }
    for agent in &expected {
        if agentic_ledger::completed_in(connection,binding,agent)?.is_none() { return Err("AGENTIC_DELEGATION_NOT_COMPLETED".into()); }
    }
    data::no_dormant_models(connection,binding,&expected)
}

fn accepted(value:&Assignment) -> Value {
    json!({"status":"ok","tool":"delegate_task","data":{"worker_id":value.worker_id,
        "assignment_hash":value.assignment_hash,"task_hash":value.task_hash}})
}

fn denied(reason:&str) -> Value { json!({"status":"denied","tool":"delegate_task","error":{"code":reason}}) }

fn hash(value:&Assignment) -> Result<String,String> {
    let mut unsigned=value.clone();unsigned.assignment_hash.clear();digest(&("genos.agentic.delegation/v1",unsigned))
}

pub(crate) fn require_parent_active_in(connection:&Connection, binding:&Binding, parent:&str) -> Result<(),String> {
    let profile=mode(connection,binding)?.ok_or("AGENTIC_DELEGATION_PROFILE_REQUIRED")?;
    if parent==profile.coordinator { return Ok(()); }
    profile.depth(parent)?;
    if assigned_in(connection,binding,parent)?.is_none() { return Err("AGENTIC_DELEGATION_PARENT_NOT_ACTIVE".into()); }
    Ok(())
}

fn return_turn_available(spec:&super::agentic_spec::AgenticSpec, parent:&StepKey) -> Result<bool,String> {
    if spec.config.orchestration.as_ref().is_none_or(|mode|mode.hierarchy.is_none()) { return Ok(true); }
    let max_turns=spec.agent(&parent.agent_id)?.max_turns;
    Ok(parent.turn.checked_add(1).is_some_and(|turn|turn<max_turns))
}

fn parent_policy(spec:&super::agentic_spec::AgenticSpec, args:&Arguments, parent:&StepKey) -> Result<Option<&'static str>,String> {
    if let Some(reason)=argument_limit(spec,args) { return Ok(Some(reason)); }
    let profile=spec.config.orchestration.as_ref().ok_or("AGENTIC_DELEGATION_PROFILE_REQUIRED")?;
    if !profile.permits(&parent.agent_id,&args.agent_id) { return Ok(Some("AGENTIC_DELEGATION_PARENT_NOT_PERMITTED")); }
    if !return_turn_available(spec,parent)? { return Ok(Some("AGENTIC_DELEGATION_RETURN_TURN_REQUIRED")); }
    Ok(None)
}

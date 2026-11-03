//! Tâches et retours adressés : copies CAS réelles, frontières historiques immuables.
#[path="agentic_delegation_exchange_store.rs"] mod data;
#[path="agentic_delegation_exchange_tasks.rs"] mod tasks;
#[path="agentic_delegation_exchange_returns.rs"] mod returns;
#[path="agentic_delegation_exchange_closure.rs"] mod closure;
use super::{Binding,agentic_delegation::Assignment,agentic_ledger::StepKey};
use rusqlite::{Connection,Transaction};
use serde::{Deserialize,Serialize};
use serde_json::{Value,json};

#[derive(Clone,Debug,Deserialize,Serialize,PartialEq,Eq)]
pub(crate) struct TaskDelivery {
    pub binding_hash:String,pub worker_id:String,pub coordinator_id:String,pub assignment_hash:String,
    pub task_hash:String,pub model_hash:String,pub sender_store:String,pub receiver_store:String,
    pub packet_hash:String,pub receipt_hash:String,
}
#[derive(Clone,Debug,Deserialize,Serialize,PartialEq,Eq)]
pub(crate) struct ReturnDelivery {
    pub binding_hash:String,pub worker_id:String,pub coordinator_id:String,pub assignment_hash:String,
    pub return_turn:u32,pub completion_hash:String,pub packet_hash:String,pub packet_receipt_hash:String,pub receipt_hash:String,
}

pub(crate) fn initialize_in(tx:&Transaction<'_>)->Result<(),String> { data::ensure(tx) }

pub(crate) fn task_delivery_in(tx:&Transaction<'_>,binding:&Binding,a:&Assignment)->Result<TaskDelivery,String> {
    tasks::deliver(tx,binding,a)
}
pub(crate) fn require_task_in(conn:&Connection,binding:&Binding,a:&Assignment)->Result<TaskDelivery,String> {
    tasks::require(conn,binding,a)
}
pub(crate) fn receive_returns_in(tx:&Transaction<'_>,binding:&Binding,key:&StepKey)->Result<(),String> {
    let spec=super::agentic_admission::admitted_in(tx,binding)?;
    let Some(profile)=spec.config.orchestration else { return Ok(()); };
    if key.agent_id!=profile.coordinator { return Ok(()); }
    let assignments=super::agentic_delegation::before_in(tx,binding,key)?;
    for a in &assignments { returns::completed(tx,binding,a)?; }
    for a in &assignments { returns::deliver(tx,binding,a)?; }
    Ok(())
}

pub(crate) fn view_in(conn:&Connection,binding:&Binding,key:&StepKey)->Result<Value,String> {
    super::store::current_checked(conn,binding)?;
    let spec=super::agentic_admission::admitted_in(conn,binding)?;
    let Some(profile)=spec.config.orchestration else { return Ok(Value::Null); };
    if key.agent_id!=profile.coordinator { return worker_view(conn,binding,key); }
    let assignments=super::agentic_delegation::before_in(conn,binding,key)?;
    let mut results=Vec::new();let mut proofs=Vec::new();
    for a in &assignments {
        let (receipt,packet)=returns::require(conn,binding,a)?;
        if receipt.return_turn>key.turn { return Err("AGENTIC_DELEGATION_FUTURE_RETURN".into()); }
        results.push(json!({"agent_id":a.worker_id,"text":packet.result.text,"artifacts":packet.artifacts}));
        proofs.push(json!({"assignment":a,"task_delivery":tasks::require(conn,binding,a)?,"return":receipt,"packet":packet}));
    }
    let available:Vec<_>=spec.config.agents.iter().filter(|agent|agent.id!=profile.coordinator)
        .filter(|agent|!assignments.iter().any(|a|a.worker_id==agent.id)).map(|agent|agent.id.clone()).collect();
    Ok(json!({"model":{"delegated_results":results,"available_workers":available},"assignments":proofs}))
}

fn worker_view(conn:&Connection,binding:&Binding,key:&StepKey)->Result<Value,String> {
    let a=super::agentic_delegation::assigned_in(conn,binding,&key.agent_id)?.ok_or("AGENTIC_WORKER_NOT_ASSIGNED")?;
    let receipt=tasks::require(conn,binding,&a)?;
    let bytes=super::agentic_tools::object_in(conn,(&receipt.receiver_store,&a.task_hash))?;
    let task=String::from_utf8(bytes).map_err(|_|"AGENTIC_TASK_UTF8_INVALID")?;
    Ok(json!({"model":{"assignment":{"worker_id":a.worker_id,"task":task,"task_hash":a.task_hash}},
        "assignment":a,"task_delivery":receipt}))
}

pub(crate) fn require_settled_in(conn:&Connection,binding:&Binding)->Result<(),String> {
    if !closure::is_dynamic(conn,binding)? { return Ok(()); }
    closure::settled(conn,binding).map(|_|())
}
pub(crate) fn closure_in(conn:&Connection,binding:&Binding)->Result<Value,String> {
    closure::collect(conn,binding)
}
pub(crate) fn active_agents_in(conn:&Connection,binding:&Binding)->Result<Vec<String>,String> {
    let spec=super::agentic_admission::admitted_in(conn,binding)?;
    let Some(profile)=spec.config.orchestration else { return Ok(spec.config.agents.iter().map(|a|a.id.clone()).collect()); };
    super::agentic_delegation::require_all_in(conn,binding)?;
    let assigned=super::agentic_delegation::all_in(conn,binding)?;
    Ok(spec.config.agents.iter().filter(|a|a.id==profile.coordinator || assigned.iter().any(|v|v.worker_id==a.id))
        .map(|a|a.id.clone()).collect())
}

pub(crate) fn received_artifact_in(conn:&Connection,binding:&Binding,input:(&StepKey,&str,&str))->Result<Option<super::agentic_exchange::ReceivedArtifact>,String> {
    let assignments=super::agentic_delegation::before_in(conn,binding,input.0)?;
    let Some(a)=assignments.iter().find(|a|a.worker_id==input.1 && a.parent.agent_id==input.0.agent_id) else { return Ok(None); };
    let (receipt,packet)=returns::require(conn,binding,a)?;
    if receipt.return_turn>input.0.turn { return Err("AGENTIC_DELEGATION_FUTURE_RETURN".into()); }
    Ok(packet.artifacts.into_iter().find(|artifact|artifact.name==input.2))
}

#[cfg(test)]
#[path="agentic_delegation_exchange_tests.rs"]
mod tests;

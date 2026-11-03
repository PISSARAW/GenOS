use super::{Binding,TaskDelivery,data,Assignment};
use super::super::{digest,raw_hash,agentic_admission,agentic_ledger,agentic_tools};
use rusqlite::{Connection,Transaction};
use serde_json::json;

fn packet(b:&Binding,a:&Assignment)->Result<Vec<u8>,String> {
    serde_json::to_vec(&json!({"profile":"genos.agentic.task-packet/v1","binding_hash":digest(b)?,"assignment":a,
        "recipient":format!("{}:{}",b.run_id,a.worker_id)})).map_err(|e|e.to_string())
}
fn expected(conn:&Connection,b:&Binding,a:&Assignment)->Result<TaskDelivery,String> {
    validate_origin(conn,b,a)?;
    let mut value=TaskDelivery {binding_hash:digest(b)?,worker_id:a.worker_id.clone(),coordinator_id:a.parent.agent_id.clone(),
        assignment_hash:a.assignment_hash.clone(),task_hash:a.task_hash.clone(),model_hash:a.model_hash.clone(),
        sender_store:digest(&(b,"agentic-task-sender",&a.parent.agent_id))?,
        receiver_store:digest(&(b,"agentic-task-receiver",&a.worker_id))?,packet_hash:raw_hash(&packet(b,a)?),receipt_hash:String::new()};
    value.receipt_hash=digest(&("genos.agentic.task-delivery/v1",&value))?;Ok(value)
}
fn validate_origin(conn:&Connection,b:&Binding,a:&Assignment)->Result<(),String> {
    let spec=agentic_admission::admitted_in(conn,b)?;
    let profile=spec.config.orchestration.as_ref().ok_or("AGENTIC_DELEGATION_PROFILE_REQUIRED")?;
    spec.agent(&a.worker_id)?;
    let mut unsigned=a.clone();unsigned.assignment_hash.clear();
    let hashes=(digest(b)?,raw_hash(a.task.as_bytes()),digest(&("genos.agentic.delegation/v1",unsigned))?);
    if (a.binding_hash.clone(),a.task_hash.clone(),a.assignment_hash.clone())!=hashes ||
        a.parent.agent_id!=profile.coordinator || a.worker_id==profile.coordinator {
        return Err("AGENTIC_TASK_ASSIGNMENT_CHANGED".into());
    }
    origin_call(conn,b,a)
}
fn origin_call(conn:&Connection,b:&Binding,a:&Assignment)->Result<(),String> {
    let model=agentic_ledger::model_record_in(conn,b,&a.parent)?;
    let call=model.tool_calls.get(a.call_index as usize).ok_or("AGENTIC_TASK_CALL_MISSING")?;
    if model.model_hash!=a.model_hash || call.id!=a.call_id || call.name!="delegate_task" ||
        call.arguments!=json!({"agent_id":a.worker_id,"task":a.task}) {
        return Err("AGENTIC_TASK_NATIVE_CALL_CHANGED".into());
    }Ok(())
}
pub(super) fn deliver(tx:&Transaction<'_>,b:&Binding,a:&Assignment)->Result<TaskDelivery,String> {
    data::ensure(tx)?;
    if data::task(tx,b,&a.worker_id)?.is_some() { return require(tx,b,a); }
    let value=expected(tx,b,a)?;
    let bytes=packet(b,a)?;
    for store in [&value.sender_store,&value.receiver_store] {
        data::put(tx,(store,&a.task_hash,a.task.as_bytes()))?;
        data::put(tx,(store,&value.packet_hash,&bytes))?;
    }
    data::save_task(tx,b,&value)?;Ok(value)
}
pub(super) fn require(conn:&Connection,b:&Binding,a:&Assignment)->Result<TaskDelivery,String> {
    let expected=expected(conn,b,a)?;
    let stored=data::task(conn,b,&a.worker_id)?.ok_or("AGENTIC_TASK_NOT_DELIVERED")?;
    if stored!=expected { return Err("AGENTIC_TASK_DELIVERY_CHANGED".into()); }
    physical(conn,(b,a),&stored)?;
    data::event(conn,b,("AGENTIC_TASK_DELIVERED",&stored))?;Ok(stored)
}
fn physical(conn:&Connection,input:(&Binding,&Assignment),value:&TaskDelivery)->Result<(),String> {
    for store in [&value.sender_store,&value.receiver_store] {
        if agentic_tools::object_in(conn,(store,&input.1.task_hash))?!=input.1.task.as_bytes() ||
            agentic_tools::object_in(conn,(store,&value.packet_hash))?!=packet(input.0,input.1)? {
            return Err("AGENTIC_TASK_CAS_CHANGED".into());
        }
    }Ok(())
}

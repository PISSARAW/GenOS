//! Vue locale d'un parent : tache entrante et retours de ses enfants directs.
use super::{Binding,Assignment,tasks,returns};
use super::super::{agentic_admission,agentic_delegation,agentic_ledger::StepKey,agentic_spec::OrchestrationConfig};
use rusqlite::Connection;
use serde_json::{Value,json};

pub(super) fn view(conn:&Connection,b:&Binding,key:&StepKey)->Result<Value,String> {
    let spec=agentic_admission::admitted_in(conn,b)?;
    spec.agent(&key.agent_id)?;
    let profile=spec.config.orchestration.as_ref().ok_or("AGENTIC_HIERARCHY_PROFILE_REQUIRED")?;
    let assignments=agentic_delegation::before_in(conn,b,key)?;
    let (results,proofs)=outgoing(conn,b,(&assignments,key.turn))?;
    let available:Vec<_>=spec.config.agents.iter().filter(|agent|profile.permits(&key.agent_id,&agent.id))
        .filter(|agent|!assignments.iter().any(|a|a.worker_id==agent.id)).map(|agent|agent.id.clone()).collect();
    let mut value=json!({"model":{"delegated_results":results,"available_workers":available},"assignments":proofs});
    if key.agent_id!=profile.coordinator { incoming(conn,(b,key),&mut value)?; }
    Ok(value)
}

fn outgoing(conn:&Connection,b:&Binding,input:(&[Assignment],u32))->Result<(Vec<Value>,Vec<Value>),String> {
    let mut results=Vec::new();let mut proofs=Vec::new();
    for a in input.0 {
        let (receipt,packet)=returns::require(conn,b,a)?;
        if receipt.return_turn>input.1 { return Err("AGENTIC_DELEGATION_FUTURE_RETURN".into()); }
        results.push(json!({"agent_id":a.worker_id,"text":packet.result.text,"artifacts":packet.artifacts}));
        proofs.push(json!({"assignment":a,"task_delivery":tasks::require(conn,b,a)?,"return":receipt,"packet":packet}));
    }
    Ok((results,proofs))
}

fn incoming(conn:&Connection,input:(&Binding,&StepKey),view:&mut Value)->Result<(),String> {
    let source=super::worker_view(conn,input.0,input.1)?;
    view["model"]["assignment"]=source["model"]["assignment"].clone();
    view["assignment"]=source["assignment"].clone();
    view["task_delivery"]=source["task_delivery"].clone();
    Ok(())
}

pub(super) fn closure(mut value:Value,mode:&OrchestrationConfig)->Value {
    if let Some(hierarchy)=&mode.hierarchy {
        value["hierarchy"]=json!({"root":mode.coordinator,"parents":hierarchy.parents,
            "max_depth":hierarchy.max_depth,"max_children":hierarchy.max_children});
    }
    value
}

use super::super::{Binding,agentic_ledger,agentic_context,agentic_tools,agentic_exchange,agentic_admission};
use rusqlite::Connection;
use serde_json::{Value,json};

pub(super) fn collect(connection:&Connection,binding:&Binding)->Result<(Value,String),String> {
    agentic_ledger::assert_publishable_in(connection,binding)?;
    let waves=super::super::agentic_parallel_journal::closure_in(connection,binding)?;
    let spec=agentic_admission::admitted_in(connection,binding)?;
    let active=super::super::agentic_delegation_exchange::active_agents_in(connection,binding)?;
    let dynamic=super::super::agentic_delegation_exchange::closure_in(connection,binding)?;
    let mut agents=Vec::new();let mut final_text=String::new();
    for agent in &active {
        let (proof,text)=agent_in(connection,binding,agent)?;
        final_text=text;agents.push(proof);
    }
    let closure=json!({"schema":"genos.rust-agentic-closure/v1","source":spec.source,"source_hash":spec.source_hash,
        "binding":binding,"agents":agents,"base":agentic_exchange::base_in(connection,binding)?,
        "origin":"model_generated","external_effects_authorized":false,"waves":waves});
    let closure=with_dynamic(closure,dynamic);
    Ok((closure,final_text))
}

fn turns(connection:&Connection,binding:&Binding,input:(&str,u32))->Result<Vec<Value>,String> {
    let mut turns=Vec::new();
    for turn in 0..=input.1 { turns.push(turn_in(connection,binding,&agentic_ledger::StepKey { agent_id:input.0.into(),turn })?); }
    Ok(turns)
}

fn turn_in(connection:&Connection,binding:&Binding,key:&agentic_ledger::StepKey)->Result<Value,String> {
    let model=agentic_ledger::model_record_in(connection,binding,key)?;
    let context=agentic_context::applied_in(connection,binding,key)?;
    let request=agentic_context::request_in(connection,binding,key)?;
    if genos_api::native_inference::tool_request_hash(&request)?!=model.request_hash { return Err("AGENTIC_CONSUMED_CONTEXT_CHANGED".into()); }
    let mut tools=Vec::new();
    for index in 0..model.tool_calls.len() {
        let operation=format!("tool/{}/{}/{}",key.agent_id,key.turn,index);
        tools.push(agentic_tools::receipt_in(connection,binding,&operation)?);
    }
    Ok(json!({"model":model,"context":context,"tools":tools}))
}

fn artifacts(connection:&Connection,binding:&Binding,agent:&str)->Result<Vec<Value>,String> {
    let mut objects=Vec::new();
    for artifact in agentic_tools::artifact_records_in(connection,binding,agent)? {
        let bytes=agentic_tools::object_in(connection,(&artifact.store_id,&artifact.hash))?;
        objects.push(json!({"descriptor":artifact,"text":String::from_utf8(bytes).map_err(|_|"AGENTIC_ARTIFACT_UTF8_INVALID")?}));
    }
    Ok(objects)
}

fn with_dynamic(mut closure:Value,dynamic:Value)->Value {
    if !dynamic.is_null() { closure["delegation"]=dynamic; }closure
}
fn agent_in(connection:&Connection,binding:&Binding,agent:&str)->Result<(Value,String),String> {
    let completed=agentic_ledger::completed_in(connection,binding,agent)?.ok_or("AGENTIC_COMPLETION_REQUIRED")?;
    let turns=turns(connection,binding,(agent,completed.last_turn))?;
    let received=agentic_exchange::received_in(connection,binding,agent)?;
    let artifacts=artifacts(connection,binding,agent)?;
    let text=completed.text.clone();
    Ok((json!({"completion":completed,"turns":turns,"received":received,"artifacts":artifacts}),text))
}

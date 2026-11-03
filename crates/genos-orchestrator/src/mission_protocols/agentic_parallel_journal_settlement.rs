use super::{Binding,ClosedStep,StepKey,WaveDescriptor,WaveReceipt,checks,data};
use super::super::{Store,Event,agentic_ledger,agentic_tools,now_ms};
use genos_api::native_inference::Finish;
use rusqlite::{Connection,Transaction};
use serde_json::json;

pub(super) fn outcomes(connection:&Connection,binding:&Binding,descriptor:&WaveDescriptor)->Result<Vec<ClosedStep>,String> {
    descriptor.members.iter().map(|member|closed_step(connection,binding,&member.key)).collect()
}

fn closed_step(connection:&Connection,binding:&Binding,key:&StepKey)->Result<ClosedStep,String> {
    let model=agentic_ledger::model_record_in(connection,binding,key)?;
    if !model.usage_known { return Err("AGENTIC_WAVE_USAGE_UNKNOWN".into()); }
    let mut step=ClosedStep { key:key.clone(),model_hash:model.model_hash,tool_receipt_hashes:vec![],completion_hash:None };
    match model.finish {
        Finish::ToolRequested=> {
            if model.tool_calls.is_empty() { return Err("AGENTIC_WAVE_TOOL_CALLS_MISSING".into()); }
            step.tool_receipt_hashes=agentic_tools::results_in(connection,binding,key)?.into_iter().map(|value|value.receipt_hash).collect();
        },
        Finish::Complete=>step.completion_hash=Some(completion(connection,binding,key)?),
        _=>return Err("AGENTIC_WAVE_MODEL_TERMINATION_UNRESOLVED".into()),
    }
    Ok(step)
}

fn completion(connection:&Connection,binding:&Binding,key:&StepKey)->Result<String,String> {
    let value=agentic_ledger::completed_in(connection,binding,&key.agent_id)?.ok_or("AGENTIC_WAVE_AGENT_COMPLETION_PENDING")?;
    if value.last_turn!=key.turn { return Err("AGENTIC_WAVE_COMPLETION_TURN_CHANGED".into()); }
    Ok(value.completion_hash)
}

pub(super) fn settle(tx:&Transaction<'_>,binding:&Binding,descriptor:&WaveDescriptor)->Result<WaveReceipt,String> {
    checks::descriptor(tx,binding,descriptor)?;
    let (_,status)=data::load(tx,binding,&descriptor.wave_id)?;
    let history=data::history(tx,binding,&descriptor.wave_id)?;
    checks::history(descriptor,&status,&history)?;
    let measured=outcomes(tx,binding,descriptor);
    if let Some(receipt)=prior(&history,&measured)? { return Ok(receipt); }
    let receipt=make(descriptor,(&history,measured))?;
    record(tx,binding,(&receipt,&history))?;
    Ok(receipt)
}

fn record(tx:&Transaction<'_>,binding:&Binding,input:(&WaveReceipt,&[WaveReceipt]))->Result<(),String> {
    let (receipt,history)=input;
    data::save(tx,binding,&receipt)?;
    let recovered=receipt.is_joined() && history.last().is_some_and(|value|value.status=="stopped");
    let phase=if recovered { "AGENTIC_WAVE_RECOVERED" } else if receipt.is_joined() { "AGENTIC_WAVE_JOINED" } else { "AGENTIC_WAVE_STOPPED" };
    Store::event(tx,binding,Event { protocol:"OMEGA",phase,payload:json!(receipt) })
}

fn prior(history:&[WaveReceipt],measured:&Result<Vec<ClosedStep>,String>)->Result<Option<WaveReceipt>,String> {
    let Some(previous)=history.last() else { return Ok(None); };
    if previous.is_joined() {
        let actual=measured.as_ref().map_err(|error|error.clone())?;
        if previous.observations!=*actual { return Err("AGENTIC_WAVE_CLOSURE_CHANGED".into()); }
        return Ok(Some(previous.clone()));
    }
    if measured.as_ref().err()==previous.error.as_ref() { return Ok(Some(previous.clone())); }
    Ok(None)
}

fn make(descriptor:&WaveDescriptor,input:(&[WaveReceipt],Result<Vec<ClosedStep>,String>))->Result<WaveReceipt,String> {
    let (history,measured)=input;
    let (observations,error)=match measured { Ok(values)=>(values,None),Err(reason)=>(vec![],Some(reason)) };
    let mut receipt=WaveReceipt { wave_id:descriptor.wave_id.clone(),binding_hash:descriptor.binding_hash.clone(),
        descriptor_hash:descriptor.descriptor_hash.clone(),revision:history.len() as u64+1,status:if error.is_none() { "joined" } else { "stopped" }.into(),
        observations,error,settled_ms:now_ms(),previous_receipt_hash:history.last().map(|value|value.receipt_hash.clone()),receipt_hash:String::new() };
    receipt.receipt_hash=checks::receipt_hash(&receipt)?;
    Ok(receipt)
}

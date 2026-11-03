use super::{Binding,StepKey,WaveDescriptor,WaveMember,WaveReceipt,data,digest};
use super::super::{agentic_admission,agentic_context,agentic_ledger};
use rusqlite::Connection;
use std::collections::HashSet;

pub(super) fn enabled(connection:&Connection,binding:&Binding)->Result<bool,String> {
    Ok(agentic_admission::admitted_in(connection,binding)?.config.max_parallel_agents>1)
}

pub(super) fn member(connection:&Connection,binding:&Binding,key:&StepKey)->Result<WaveMember,String> {
    let intent=agentic_ledger::intent_scope_in(connection,binding,key)?;
    let context=agentic_context::applied_in(connection,binding,key)?;
    let request=agentic_context::request_in(connection,binding,key)?;
    let request_hash=genos_api::native_inference::tool_request_hash(&request)?;
    if request_hash!=intent.request_hash || context.hash!=request.base.context_hash {
        return Err("AGENTIC_WAVE_EFFECTIVE_REQUEST_CHANGED".into());
    }
    let intent_hash=digest(&(&intent.key,&intent.binding_hash,&intent.request_hash,intent.max_wall_ms))?;
    Ok(WaveMember { key:key.clone(),request_hash,context_hash:context.hash,actor_id:context.actor_id,intent_hash })
}

pub(super) fn fresh_member(connection:&Connection,binding:&Binding,key:&StepKey)->Result<WaveMember,String> {
    let intent=agentic_ledger::intent_scope_in(connection,binding,key)?;
    if intent.status!="intent" { return Err("AGENTIC_WAVE_FRESH_INTENT_REQUIRED".into()); }
    member(connection,binding,key)
}

pub(super) fn descriptor_hash(value:&WaveDescriptor)->Result<String,String> {
    let mut unsigned=value.clone();unsigned.descriptor_hash.clear();digest(&("genos.agentic.parallel-wave/v1",unsigned))
}

pub(super) fn shape(connection:&Connection,binding:&Binding,value:&WaveDescriptor)->Result<(),String> {
    let spec=agentic_admission::admitted_in(connection,binding)?;
    let width=spec.config.max_parallel_agents as usize;
    if width<=1 || value.members.is_empty() || value.members.len()>width {
        return Err("AGENTIC_WAVE_WIDTH_NOT_ADMITTED".into());
    }
    if value.binding_hash!=digest(binding)? || value.descriptor_hash!=descriptor_hash(value)? {
        return Err("AGENTIC_WAVE_DESCRIPTOR_CHANGED".into());
    }
    unique(&value.members)
}

fn unique(members:&[WaveMember])->Result<(),String> {
    let mut keys=HashSet::new();let mut agents=HashSet::new();
    for value in members {
        if !keys.insert(value.key.operation_id()) || !agents.insert(&value.key.agent_id) {
            return Err("AGENTIC_WAVE_DUPLICATE_STEP_OR_AGENT".into());
        }
    }
    Ok(())
}

pub(super) fn descriptor(connection:&Connection,binding:&Binding,value:&WaveDescriptor)->Result<(),String> {
    shape(connection,binding,value)?;
    for recorded in &value.members { validate_member(connection,(binding,value),recorded)?; }
    Ok(())
}

fn validate_member(connection:&Connection,owner:(&Binding,&WaveDescriptor),recorded:&WaveMember)->Result<(),String> {
    let current=member(connection,owner.0,&recorded.key)?;
    let location=data::membership(connection,owner.0,&recorded.key)?;
    if current!=*recorded || location!=(owner.1.wave_id.clone(),digest(recorded)?) {
        return Err("AGENTIC_WAVE_MEMBER_OR_SCOPE_CHANGED".into());
    }
    Ok(())
}

pub(super) fn receipt_hash(value:&WaveReceipt)->Result<String,String> {
    let mut unsigned=value.clone();unsigned.receipt_hash.clear();digest(&("genos.agentic.parallel-receipt/v1",unsigned))
}

pub(super) fn history(descriptor:&WaveDescriptor,status:&str,values:&[WaveReceipt])->Result<(),String> {
    let mut previous=None;
    for (index,value) in values.iter().enumerate() {
        receipt_identity(descriptor,value,(index as u64+1,&previous))?;
        previous=Some(value.receipt_hash.clone());
        if value.is_joined() && index+1!=values.len() { return Err("AGENTIC_WAVE_TERMINAL_RECEIPT_REPLACED".into()); }
    }
    let actual=values.last().map(|value|value.status.as_str()).unwrap_or("active");
    if actual!=status { return Err("AGENTIC_WAVE_STATUS_RECEIPT_CHANGED".into()); }
    Ok(())
}

fn receipt_identity(descriptor:&WaveDescriptor,value:&WaveReceipt,sequence:(u64,&Option<String>))->Result<(),String> {
    let actual=(&value.wave_id,&value.binding_hash,&value.descriptor_hash,value.revision,&value.previous_receipt_hash);
    let expected=(&descriptor.wave_id,&descriptor.binding_hash,&descriptor.descriptor_hash,sequence.0,sequence.1);
    if actual!=expected || value.receipt_hash!=receipt_hash(value)? { return Err("AGENTIC_WAVE_RECEIPT_CHAIN_CHANGED".into()); }
    let valid=matches!(value.status.as_str(),"joined"|"stopped");
    if !valid || value.is_joined()!=value.error.is_none() { return Err("AGENTIC_WAVE_RECEIPT_VERDICT_CHANGED".into()); }
    Ok(())
}

#[path="agentic_tools_types.rs"]
mod types;
#[path="agentic_tools_store.rs"]
mod data;
#[path="agentic_tools_schema.rs"]
mod schema;
#[path="agentic_tools_dispatch.rs"]
mod dispatch;
#[path="agentic_tools_artifacts.rs"]
mod artifacts;
pub use types::{ToolReceipt,ToolResult,ArtifactRecord,ObjectRef};
pub use schema::definitions;
use super::{Binding,Event,Store,digest};
use super::agentic_ledger::{self,StepKey,ToolIntent,ToolCost,ToolAdmission,ModelRecord};
use rusqlite::{Connection,Transaction};
use serde_json::json;

pub fn execute(store:&mut Store,binding:&Binding,key:&StepKey)->Result<Vec<ToolReceipt>,String> {
    let model=store.transaction(binding,|tx|agentic_ledger::model_record_in(tx,binding,key))?;
    let mut receipts=Vec::new();
    for index in 0..model.tool_calls.len() {
        let index=u32::try_from(index).map_err(|_|"AGENTIC_TOOL_INDEX_OVERFLOW")?;
        receipts.push(store.transaction(binding,|tx|execute_one(tx,binding,(key,index)))?);
    }
    Ok(receipts)
}

fn execute_one(tx:&Transaction<'_>,binding:&Binding,input:(&StepKey,u32))->Result<ToolReceipt,String> {
    data::ensure(tx)?;
    let model=agentic_ledger::model_record_in(tx,binding,input.0)?;
    let operation=format!("tool/{}/{}/{}",input.0.agent_id,input.0.turn,input.1);
    if data::exists(tx,(binding,&operation))? { return receipt_in(tx,binding,&operation); }
    current_context(tx,binding,&model)?;
    let intent=intent(tx,binding,(&model,input.1))?;
    match agentic_ledger::begin_tool_in(tx,binding,&intent)? {
        ToolAdmission::Known { receipt_hash }=>known(tx,binding,(&intent,&receipt_hash)),
        ToolAdmission::Unknown=>Err("AGENTIC_TOOL_OUTCOME_UNKNOWN".into()),
        ToolAdmission::Fresh=>fresh(tx,binding,(&model,intent)),
    }
}

fn current_context(connection:&Connection,binding:&Binding,model:&ModelRecord)->Result<(),String> {
    let request=super::agentic_context::request_in(connection,binding,&model.key)?;
    if genos_api::native_inference::tool_request_hash(&request)?!=model.request_hash {
        return Err("AGENTIC_TOOL_EFFECTIVE_CONTEXT_CHANGED".into());
    }
    Ok(())
}

fn intent(connection:&Connection,binding:&Binding,input:(&ModelRecord,u32))->Result<ToolIntent,String> {
    let spec=super::agentic_admission::admitted_in(connection,binding)?;
    let state=agentic_ledger::state_in(connection,binding)?;
    let remaining=state.limits.wall_ms.saturating_sub(state.protected.wall_ms)
        .saturating_sub(state.spent.wall_ms).saturating_sub(state.held.wall_ms);
    Ok(ToolIntent { agent_id:input.0.key.agent_id.clone(),turn:input.0.key.turn,call_index:input.1,
        request_hash:agentic_ledger::tool_request_hash(binding,input.0,input.1)?,
        max_wall_ms:remaining.min(spec.config.turn_timeout_ms) })
}

fn known(connection:&Connection,binding:&Binding,input:(&ToolIntent,&str))->Result<ToolReceipt,String> {
    let receipt=receipt_in(connection,binding,&input.0.operation_id())?;
    if receipt.receipt_hash()!=input.1 { return Err("AGENTIC_TOOL_LEDGER_RECEIPT_CHANGED".into()); }
    Ok(receipt)
}

fn fresh(tx:&Transaction<'_>,binding:&Binding,input:(&ModelRecord,ToolIntent))->Result<ToolReceipt,String> {
    let started=std::time::Instant::now();
    let call=input.0.tool_calls.get(input.1.call_index as usize).ok_or("AGENTIC_TOOL_CALL_MISSING")?;
    let outcome=dispatch::run(tx,binding,(input.0,call))?;
    let receipt=make(binding,(input.0,input.1),(&outcome,started.elapsed().as_millis() as u64))?;
    artifacts::finish(tx,binding,(&outcome,&receipt))?;
    data::save_receipt(tx,binding,&receipt.core)?;
    agentic_ledger::complete_tool_in(tx,binding,&cost(&receipt))?;
    Store::event(tx,binding,Event { protocol:"OMEGA",phase:"NATIVE_TOOL_RECEIPT",payload:json!(receipt) })?;
    Ok(receipt)
}

fn make(binding:&Binding,model:(&ModelRecord,ToolIntent),outcome:(&dispatch::Outcome,u64))->Result<ToolReceipt,String> {
    let call=model.0.tool_calls.get(model.1.call_index as usize).ok_or("AGENTIC_TOOL_CALL_MISSING")?;
    let mut body=types::ToolBody { key:model.0.key.clone(),binding_hash:digest(binding)?,actor_id:model.0.actor_id.clone(),
        call_index:model.1.call_index,call_id:call.id.clone(),name:call.name.clone(),parent_model_hash:model.0.model_hash.clone(),
        context_hash:model.0.context_hash.clone(),intent:model.1,result_hash:digest(&outcome.0.output)?,output:outcome.0.output.clone(),
        elapsed_ms:outcome.1,objects:outcome.0.objects.clone(),receipt_hash:String::new() };
    body.receipt_hash=hash(&body)?;
    Ok(ToolReceipt { core:body })
}

fn hash(body:&types::ToolBody)->Result<String,String> {
    let mut value=body.clone();value.receipt_hash.clear();digest(&("genos.agentic.tool-receipt/v1",value))
}

fn cost(receipt:&ToolReceipt)->ToolCost {
    ToolCost { intent:receipt.core.intent.clone(),receipt_hash:receipt.core.receipt_hash.clone(),elapsed_ms:receipt.core.elapsed_ms }
}

pub fn receipt_in(connection:&Connection,binding:&Binding,operation:&str)->Result<ToolReceipt,String> {
    super::store::current_checked(connection,binding)?;
    let body=data::receipt(connection,(binding,operation))?;
    validate_receipt(connection,binding,&body)?;
    let receipt=ToolReceipt { core:body };
    agentic_ledger::assert_tool_complete_in(connection,binding,&cost(&receipt))?;
    receipt_event(connection,binding,&receipt)?;
    Ok(receipt)
}

fn receipt_event(connection:&Connection,binding:&Binding,receipt:&ToolReceipt)->Result<(),String> {
    let payload=serde_json::to_value(receipt).map_err(|error|error.to_string())?;
    let expected=digest(&(binding,"OMEGA","NATIVE_TOOL_RECEIPT",&payload))?;
    let found:bool=data::sql(connection.query_row("SELECT EXISTS(SELECT 1 FROM rust_protocol_events
        WHERE run_id=$1 AND protocol='OMEGA' AND phase='NATIVE_TOOL_RECEIPT' AND digest=$2 AND payload_json=$3)",
        rusqlite::params![binding.run_id,expected,serde_json::to_string(&payload).map_err(|error|error.to_string())?],|row|row.get(0)))?;
    if !found { return Err("AGENTIC_TOOL_EXECUTION_EVENT_CHANGED".into()); }
    Ok(())
}

fn assert_receipt_hashes(body: &types::ToolBody) -> Result<(), String> {
    if (&body.intent.agent_id,body.intent.turn,body.intent.call_index)!=(&body.key.agent_id,body.key.turn,body.call_index) {
        return Err("AGENTIC_TOOL_RECEIPT_OPERATION_CHANGED".into());
    }
    if body.receipt_hash != hash(body)? || body.result_hash != digest(&body.output)? {
        return Err("AGENTIC_TOOL_RECEIPT_CORRUPT_OR_FORGED".into());
    }
    Ok(())
}

fn validate_receipt(connection:&Connection,binding:&Binding,body:&types::ToolBody)->Result<(),String> {
    let model=agentic_ledger::model_record_in(connection,binding,&body.key)?;
    let call=model.tool_calls.get(body.call_index as usize).ok_or("AGENTIC_TOOL_CALL_MISSING")?;
    let expected=(digest(binding)?,agentic_ledger::tool_request_hash(binding,&model,body.call_index)?,model.model_hash,call.id.clone(),call.name.clone(),model.actor_id,model.context_hash);
    let actual=(body.binding_hash.clone(),body.intent.request_hash.clone(),body.parent_model_hash.clone(),body.call_id.clone(),body.name.clone(),body.actor_id.clone(),body.context_hash.clone());
    if actual!=expected { return Err("AGENTIC_TOOL_RECEIPT_CORRUPT_OR_FORGED".into()); }
    assert_receipt_hashes(body)?;
    for object in &body.objects { data::object_bytes_in(connection,(&object.store_id,&object.hash))?; }
    Ok(())
}

pub fn results_in(connection:&Connection,binding:&Binding,key:&StepKey)->Result<Vec<ToolResult>,String> {
    let model=agentic_ledger::model_record_in(connection,binding,key)?;
    let mut values=Vec::new();
    for index in 0..model.tool_calls.len() {
        let operation=format!("tool/{}/{}/{}",key.agent_id,key.turn,index);
        values.push(receipt_in(connection,binding,&operation)?.result()?);
    }
    Ok(values)
}

pub fn artifact_in(connection:&Connection,binding:&Binding,input:(&str,&str))->Result<ArtifactRecord,String> {
    artifacts::load(connection,binding,input)
}

pub(crate) fn artifact_records_in(connection:&Connection,binding:&Binding,agent:&str)->Result<Vec<ArtifactRecord>,String> {
    artifacts::records(connection,binding,agent)
}

pub(crate) fn object_in(connection:&Connection,input:(&str,&str))->Result<Vec<u8>,String> {
    data::object_bytes_in(connection,input)
}

pub(crate) fn ensure_in(tx:&Transaction<'_>)->Result<(),String> { data::ensure(tx) }

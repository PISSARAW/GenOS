use super::{Amounts, Binding, Event, ModelRecord, StepKey, Store, ToolAdmission, ToolCost, ToolIntent, budget, data, digest, records};
use genos_api::native_inference::Finish;
use rusqlite::{Connection,Transaction,OptionalExtension,params};
use serde_json::json;
use data::error;

pub fn tool_request_hash(binding:&Binding, model:&ModelRecord, index:u32) -> Result<String,String> {
    let call=model.tool_calls.get(index as usize).ok_or("AGENTIC_TOOL_CALL_NOT_OBSERVED")?;
    digest(&("genos.agentic.tool-intent/v1",binding,&model.key,&model.model_hash,index,call))
}

pub(crate) fn begin_tool_in(tx:&Transaction<'_>, binding:&Binding, intent:&ToolIntent) -> Result<ToolAdmission,String> {
    super::super::store::current_checked(tx,binding)?;
    validate_request(tx,binding,intent)?;
    if let Some(result)=prior(tx,binding,intent)? { return Ok(result); }
    validate_exposure(tx,binding,intent)?;
    budget::expose(tx,binding,&amount(intent))?;
    insert_intent(tx,binding,intent)?;
    Ok(ToolAdmission::Fresh)
}

fn insert_intent(tx:&Transaction<'_>, binding:&Binding, intent:&ToolIntent) -> Result<(),String> {
    super::super::continuity_effect::begin_in(tx,binding,(&format!("agentic:{}",intent.operation_id()),&json!(intent)))?;
    tx.execute("INSERT INTO agentic_tools VALUES(?1,?2,?3,?4,'intent',NULL,NULL)",params![
        binding.run_id,intent.operation_id(),serde_json::to_string(intent).map_err(error)?,digest(intent)?]).map_err(error)?;
    Store::event(tx,binding,Event { protocol:"OMEGA",phase:"AGENTIC_TOOL_INTENT",payload:json!(intent) })
}

fn amount(intent:&ToolIntent) -> Amounts { Amounts { tokens:0,model_calls:0,tool_calls:1,wall_ms:intent.max_wall_ms } }

fn validate_request(connection:&Connection, binding:&Binding, intent:&ToolIntent) -> Result<(),String> {
    let spec=super::super::agentic_admission::admitted_in(connection,binding)?;
    spec.agent(&intent.agent_id)?;
    let model=records::model_record_in(connection,binding,&StepKey { agent_id:intent.agent_id.clone(),turn:intent.turn })?;
    if model.finish!=Finish::ToolRequested || !model.usage_known || intent.request_hash!=tool_request_hash(binding,&model,intent.call_index)? {
        return Err("AGENTIC_NATIVE_TOOL_CALL_REQUIRED".into());
    }
    Ok(())
}

fn validate_exposure(connection:&Connection, binding:&Binding, intent:&ToolIntent) -> Result<(),String> {
    let spec=super::super::agentic_admission::admitted_in(connection,binding)?;
    if intent.max_wall_ms==0 || intent.max_wall_ms>spec.config.turn_timeout_ms {
        return Err("AGENTIC_TOOL_EXPOSURE_NOT_ADMITTED".into());
    }
    Ok(())
}

type ToolRow=(String,String,String,Option<String>,Option<u64>);

fn row(connection:&Connection, binding:&Binding, operation:&str) -> Result<Option<ToolRow>,String> {
    connection.query_row("SELECT intent_json,intent_hash,status,receipt_hash,elapsed_ms FROM agentic_tools
        WHERE run_id=?1 AND operation_id=?2",params![binding.run_id,operation],
        |r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?,r.get(4)?))).optional().map_err(error)
}

fn prior(connection:&Connection, binding:&Binding, intent:&ToolIntent) -> Result<Option<ToolAdmission>,String> {
    let Some(row)=row(connection,binding,&intent.operation_id())? else { return Ok(None); };
    let recorded:ToolIntent=data::decode((row.0,row.1))?;
    if (&recorded.agent_id,recorded.turn,recorded.call_index,&recorded.request_hash)
        !=(&intent.agent_id,intent.turn,intent.call_index,&intent.request_hash) {
        return Err("AGENTIC_TOOL_INTENT_CONFLICT".into());
    }
    if row.2=="completed" { return Ok(Some(ToolAdmission::Known { receipt_hash:row.3.ok_or("AGENTIC_TOOL_RECEIPT_MISSING")? })); }
    Ok(Some(ToolAdmission::Unknown))
}

pub(crate) fn complete_tool_in(tx:&Transaction<'_>, binding:&Binding, cost:&ToolCost) -> Result<(),String> {
    validate_request(tx,binding,&cost.intent)?;
    if let Some(ToolAdmission::Known { receipt_hash })=prior(tx,binding,&cost.intent)? {
        if receipt_hash!=cost.receipt_hash { return Err("AGENTIC_TOOL_RESULT_CONFLICT".into()); }
        return assert_tool_complete_in(tx,binding,cost);
    }
    let charge=budget::Charge { held:amount(&cost.intent),input:None,output:None,total:None,input_limit:0,output_limit:0,
        usage_known:true,dispatched:true,elapsed_ms:cost.elapsed_ms,counted_unknown:false,retain_exposure:false };
    budget::settle(tx,binding,&charge)?;
    complete_row(tx,binding,cost)
}

fn complete_row(tx:&Transaction<'_>, binding:&Binding, cost:&ToolCost) -> Result<(),String> {
    let changed=tx.execute("UPDATE agentic_tools SET status='completed',receipt_hash=?1,elapsed_ms=?2
        WHERE run_id=?3 AND operation_id=?4 AND status='intent'",params![cost.receipt_hash,cost.elapsed_ms,
            binding.run_id,cost.intent.operation_id()]).map_err(error)?;
    if changed!=1 { return Err("AGENTIC_TOOL_COMPLETION_CONFLICT".into()); }
    super::super::continuity_effect::complete_in(tx,binding,(&format!("agentic:{}",cost.intent.operation_id()),
        &json!({"receipt_hash":cost.receipt_hash})))?;
    Store::event(tx,binding,Event { protocol:"OMEGA",phase:"AGENTIC_TOOL_COMPLETED",payload:json!({
        "intent":cost.intent,"receipt_hash":cost.receipt_hash,"elapsed_ms":cost.elapsed_ms}) })
}

pub(crate) fn assert_tool_complete_in(connection:&Connection, binding:&Binding, cost:&ToolCost) -> Result<(),String> {
    super::super::store::current_checked(connection,binding)?;
    let row=row(connection,binding,&cost.intent.operation_id())?.ok_or("AGENTIC_TOOL_INTENT_REQUIRED")?;
    let recorded:ToolIntent=data::decode((row.0,row.1))?;
    if recorded!=cost.intent || row.2!="completed" || row.3.as_deref()!=Some(&cost.receipt_hash) || row.4!=Some(cost.elapsed_ms) {
        return Err("AGENTIC_TOOL_COMPLETION_RECEIPT_CHANGED".into());
    }
    Ok(())
}

use super::{Binding,Assignment,data,tasks,returns};
use super::super::{agentic_admission,agentic_delegation,agentic_ledger,agentic_tools};
use rusqlite::{Connection,params};
use serde_json::{Value,json};
use std::collections::BTreeSet;

pub(super) fn is_dynamic(conn:&Connection,b:&Binding)->Result<bool,String> {
    if b.policy_hash!=super::super::raw_hash(super::super::agentic_spec::POLICY) { return Ok(false); }
    Ok(agentic_admission::admitted_in(conn,b)?.config.orchestration.is_some())
}
pub(super) fn settled(conn:&Connection,b:&Binding)->Result<Vec<Assignment>,String> {
    native_receipt_coverage(conn,b)?;
    let assignments=agentic_delegation::all_in(conn,b)?;
    accepted_calls(conn,b,&assignments)?;
    for a in &assignments {
        tasks::require(conn,b,a)?;
        returns::require(conn,b,a)?;
    }
    data::cardinality(conn,b,assignments.len())?;
    packet_coverage(conn,b,assignments.len())?;Ok(assignments)
}
pub(super) fn collect(conn:&Connection,b:&Binding)->Result<Value,String> {
    if !is_dynamic(conn,b)? { return Ok(Value::Null); }
    agentic_delegation::require_all_in(conn,b)?;
    let assignments=settled(conn,b)?;
    let spec=agentic_admission::admitted_in(conn,b)?;
    let profile=spec.config.orchestration.as_ref().ok_or("AGENTIC_DELEGATION_PROFILE_REQUIRED")?;
    let unused:Vec<_>=spec.config.agents.iter().filter(|agent|agent.id!=profile.coordinator)
        .filter(|agent|!assignments.iter().any(|a|a.worker_id==agent.id)).map(|a|a.id.clone()).collect();
    let mut proofs=Vec::new();
    for a in &assignments {
        let (receipt,packet)=returns::require(conn,b,a)?;
        proofs.push(json!({"assignment":a,"task_delivery":tasks::require(conn,b,a)?,"return":receipt,"packet":packet}));
    }
    Ok(json!({"schema":"genos.agentic.delegation-closure/v1","assignments":proofs,"unused_slots":unused}))
}
fn keys(conn:&Connection,b:&Binding)->Result<Vec<agentic_ledger::StepKey>,String> {
    let mut stmt=data::sql(conn.prepare("SELECT agent_id,turn FROM agentic_models WHERE run_id=$1 AND status='observed' ORDER BY agent_id,turn"))?;
    let rows=data::sql(stmt.query_map([&b.run_id],|r|Ok(agentic_ledger::StepKey{agent_id:r.get(0)?,turn:r.get(1)?})))?;
    rows.map(data::sql).collect()
}
fn accepted_calls(conn:&Connection,b:&Binding,assignments:&[Assignment])->Result<(),String> {
    let mut found=BTreeSet::new();
    for key in keys(conn,b)? {
        let model=agentic_ledger::model_record_in(conn,b,&key)?;
        for (index,call) in model.tool_calls.iter().enumerate().filter(|(_,call)|call.name=="delegate_task") {
            let operation=format!("tool/{}/{}/{}",key.agent_id,key.turn,index);
            let receipt=agentic_tools::receipt_in(conn,b,&operation)?;
            if receipt.output()["status"]=="ok" {
                match_assignment(assignments,(&model,index as u32),receipt.output())?;
                if !found.insert((key.agent_id.clone(),key.turn,index as u32)) { return Err("AGENTIC_DELEGATION_CALL_DUPLICATE".into()); }
            }
        }
    }
    if found.len()!=assignments.len() { return Err("AGENTIC_DELEGATION_NATIVE_CALL_COVERAGE_CHANGED".into()); }Ok(())
}
fn match_assignment(assignments:&[Assignment],input:(&agentic_ledger::ModelRecord,u32),output:&Value)->Result<(),String> {
    let a=assignments.iter().find(|a|a.parent==input.0.key && a.call_index==input.1)
        .ok_or("AGENTIC_DELEGATION_ACCEPTED_CALL_WITHOUT_ASSIGNMENT")?;
    if a.model_hash!=input.0.model_hash || *output!=json!({"status":"ok","tool":"delegate_task",
        "data":{"worker_id":a.worker_id,"assignment_hash":a.assignment_hash,"task_hash":a.task_hash}}) {
        return Err("AGENTIC_DELEGATION_ACCEPTED_RECEIPT_CHANGED".into());
    }Ok(())
}
fn packet_coverage(conn:&Connection,b:&Binding,count:usize)->Result<(),String> {
    let rows:i64=data::sql(conn.query_row("SELECT COUNT(*) FROM protocol_agentic_deliveries WHERE run_id=$1",[&b.run_id],|r|r.get(0)))?;
    let events:i64=data::sql(conn.query_row("SELECT COUNT(*) FROM rust_protocol_events WHERE run_id=$1 AND protocol='GQWF'
        AND phase='AGENT_DATA_RECEIVED'",params![b.run_id],|r|r.get(0)))?;
    if rows!=count as i64 || events!=count as i64 { return Err("AGENTIC_DELEGATION_RETURN_COVERAGE_CHANGED".into()); }Ok(())
}

fn native_receipt_coverage(conn:&Connection,b:&Binding)->Result<(),String> {
    let mut expected=0;
    for key in keys(conn,b)? { expected+=agentic_ledger::model_record_in(conn,b,&key)?.tool_calls.len(); }
    let rows:i64=data::sql(conn.query_row("SELECT COUNT(*) FROM protocol_agentic_tool_receipts WHERE mission_id=$1 AND binding_hash=$2",
        params![b.mission_id,super::super::digest(b)?],|r|r.get(0)))?;
    let events:i64=data::sql(conn.query_row("SELECT COUNT(*) FROM rust_protocol_events WHERE run_id=$1 AND protocol='OMEGA'
        AND phase='NATIVE_TOOL_RECEIPT'",[&b.run_id],|r|r.get(0)))?;
    if (rows,events)!=(expected as i64,expected as i64) { return Err("AGENTIC_DELEGATION_NATIVE_RECEIPT_COVERAGE_CHANGED".into()); }Ok(())
}

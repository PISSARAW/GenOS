use super::*;
use super::super::{agentic_ledger as ledger,agentic_tools,agentic_context,agentic_parallel_journal as journal};
use serde_json::json;
use std::sync::atomic::Ordering;
mod fixture {
    use crate as genos_orchestrator;
    include!("../../tests/helpers/agentic_ledger_fixture.rs");
}
const TEXT:&str="Sources: selected note. Limites: semantic truth is not verified.";
fn pending()->fixture::Pending {
    fixture::with_config(|mut c| {
        c["max_parallel_agents"]=2.into();c["orchestration"]=json!({"coordinator":"reader","max_delegations":1});
        c["agents"]=json!([
            {"id":"worker","instruction":"Only execute the admitted assigned task","tools":["read_source"],"max_turns":3},
            {"id":"reader","instruction":"Delegate bounded work","tools":["delegate_task","write_artifact"],"artifact_names":["draft"],"max_turns":4}]);c
    })
}
fn run(f:&mut fixture::Pending,value:Value) {
    if f.permit.is_none() { f.prepare_permit(); }
    let b=f.binding.clone();let key=f.key.clone();
    let wave=f.store.transaction(&b,|tx|journal::begin_in(tx,&b,&[key])).unwrap();
    let model=f.complete(value);
    if model.tool_calls.is_empty() { f.finish_agent(&model); }
    else { agentic_tools::execute(&mut f.store,&b,&model.key).unwrap(); }
    assert!(journal::finish(&mut f.store,&b,&wave).unwrap().is_joined());
}
fn assigned()->fixture::Pending {
    let mut f=pending();run(&mut f,fixture::tool("delegate_task",json!({"agent_id":"worker","task":"Read only the selected source."}),"delegate-one"));f
}
fn returned()->fixture::Pending {
    let mut f=assigned();f.prepare_step("worker",0);run(&mut f,fixture::response(TEXT));
    let b=f.binding.clone();let next=StepKey{agent_id:"reader".into(),turn:1};
    f.store.transaction(&b,|tx|receive_returns_in(tx,&b,&next)).unwrap();f
}
fn db(f:&fixture::Pending)->rusqlite::Connection { rusqlite::Connection::open(f.directory.path().join("ledger.sqlite")).unwrap() }

#[test]
fn accepted_task_is_physically_copied_and_old_coordinator_context_remains_immutable() {
    let mut f=assigned();let b=f.binding.clone();let key=f.key.clone();
    let original=genos_api::native_inference::tool_request_hash(&f.request).unwrap();
    let receipt=f.store.transaction(&b,|tx| {
        let a=super::super::agentic_delegation::assigned_in(tx,&b,"worker")?.unwrap();
        let value=require_task_in(tx,&b,&a)?;
        assert_ne!(value.sender_store,value.receiver_store);
        assert_eq!(super::super::agentic_tools::object_in(tx,(&value.receiver_store,&a.task_hash))?,a.task.as_bytes());Ok(value)
    }).unwrap();
    db(&f).execute("UPDATE protocol_gqwf_objects SET bytes=x'00' WHERE store_id=$1 AND hash=$2",
        rusqlite::params![receipt.receiver_store,receipt.task_hash]).unwrap();
    let request=agentic_context::prepare(&mut f.store,&b,&key).unwrap();
    assert_eq!(genos_api::native_inference::tool_request_hash(&request).unwrap(),original);
    assert!(f.store.transaction(&b,|tx|view_in(tx,&b,&StepKey{agent_id:"worker".into(),turn:0})).is_err());
    assert_eq!(f.requests.load(Ordering::SeqCst),1);
}

#[test]
fn task_receipt_without_its_original_event_is_rejected_even_with_unchanged_cas() {
    let mut f=assigned();let b=f.binding.clone();
    db(&f).execute("DELETE FROM rust_protocol_events WHERE run_id=$1 AND phase='AGENTIC_TASK_DELIVERED'",[&b.run_id]).unwrap();
    let error=f.store.transaction(&b,|tx|super::super::agentic_delegation::assigned_in(tx,&b,"worker")).unwrap_err();
    assert!(error.contains("ORIGINAL_EVENT_CHANGED"),"{error}");
}

#[test]
fn handoff_gate_waits_for_real_return_but_does_not_require_coordinator_completion() {
    let mut f=assigned();let b=f.binding.clone();
    assert!(f.store.transaction(&b,|tx|require_settled_in(tx,&b)).is_err());
    f.prepare_step("worker",0);run(&mut f,fixture::response(TEXT));
    assert!(f.store.transaction(&b,|tx|require_settled_in(tx,&b)).is_err());
    let key=StepKey{agent_id:"reader".into(),turn:1};
    f.store.transaction(&b,|tx|receive_returns_in(tx,&b,&key)).unwrap();
    f.store.transaction(&b,|tx|require_settled_in(tx,&b)).unwrap();
    assert!(ledger::agent_record(&mut f.store,&b,"reader").unwrap().is_none());
    assert_eq!(f.requests.load(Ordering::SeqCst),2);
}

#[test]
fn successful_native_delegation_cannot_disappear_by_erasing_assignment_and_events() {
    let mut f=returned();let b=f.binding.clone();let connection=db(&f);
    connection.execute_batch("DELETE FROM protocol_agentic_delegations; DELETE FROM protocol_agentic_task_deliveries;
      DELETE FROM protocol_agentic_delegation_returns; DELETE FROM protocol_agentic_deliveries;
      DELETE FROM rust_protocol_events WHERE phase IN ('AGENTIC_WORKER_ASSIGNED','AGENTIC_TASK_DELIVERED','AGENTIC_DELEGATION_RETURNED','AGENT_DATA_RECEIVED');").unwrap();
    let error=f.store.transaction(&b,|tx|require_settled_in(tx,&b)).unwrap_err();
    assert!(error.contains("ACCEPTED_CALL_WITHOUT_ASSIGNMENT"),"{error}");
    assert_eq!(f.requests.load(Ordering::SeqCst),2);
}

#[test]
fn corrupt_return_destination_blocks_new_coordinator_context_and_not_its_origin() {
    let mut f=returned();let b=f.binding.clone();let origin=StepKey{agent_id:"reader".into(),turn:0};
    let original=genos_api::native_inference::tool_request_hash(&agentic_context::prepare(&mut f.store,&b,&origin).unwrap()).unwrap();
    let key=StepKey{agent_id:"reader".into(),turn:1};
    let view=f.store.transaction(&b,|tx|view_in(tx,&b,&key)).unwrap();
    assert!(view["model"]["delegated_results"][0]["text"].as_str().unwrap().contains("Sources"));
    let store=super::super::digest(&(&b,"agentic-receiver","worker","reader")).unwrap();
    db(&f).execute("UPDATE protocol_gqwf_objects SET bytes=x'00' WHERE store_id=$1 AND hash=$2",
        rusqlite::params![store,super::super::raw_hash(TEXT.as_bytes())]).unwrap();
    assert!(f.store.transaction(&b,|tx|view_in(tx,&b,&key)).is_err());
    let replay=agentic_context::prepare(&mut f.store,&b,&origin).unwrap();
    assert_eq!(genos_api::native_inference::tool_request_hash(&replay).unwrap(),original);
}

#[test]
fn return_receipt_rehash_does_not_allow_earlier_return_visibility() {
    let mut f=returned();let b=f.binding.clone();let connection=db(&f);
    let raw:String=connection.query_row("SELECT value_json FROM protocol_agentic_delegation_returns WHERE worker_id='worker'",[],|r|r.get(0)).unwrap();
    let mut value:ReturnDelivery=serde_json::from_str(&raw).unwrap();value.return_turn=0;value.receipt_hash.clear();
    value.receipt_hash=super::super::digest(&("genos.agentic.delegation-return/v1",&value)).unwrap();
    connection.execute("UPDATE protocol_agentic_delegation_returns SET value_json=$1,value_hash=$2 WHERE worker_id='worker'",
        rusqlite::params![serde_json::to_string(&value).unwrap(),super::super::digest(&value).unwrap()]).unwrap();
    let error=f.store.transaction(&b,|tx|view_in(tx,&b,&StepKey{agent_id:"reader".into(),turn:1})).unwrap_err();
    assert!(error.contains("RETURN_CHANGED"),"{error}");
}

#[test]
fn forged_admission_schema_cannot_hide_pending_delegation_from_the_handoff_guard() {
    let mut f=assigned();let b=f.binding.clone();let connection=db(&f);
    let raw:String=connection.query_row("SELECT payload_json FROM rust_protocol_events WHERE run_id=$1 AND protocol='RUNTIME' AND phase='ADMIT'",
        [&b.run_id],|r|r.get(0)).unwrap();
    let mut value:Value=serde_json::from_str(&raw).unwrap();value["schema"]="unrelated.profile/v1".into();
    connection.execute("UPDATE rust_protocol_events SET payload_json=$1 WHERE run_id=$2 AND protocol='RUNTIME' AND phase='ADMIT'",
        rusqlite::params![serde_json::to_string(&value).unwrap(),b.run_id]).unwrap();
    let error=f.store.transaction(&b,|tx|require_settled_in(tx,&b)).unwrap_err();
    assert!(error.contains("ADMISSION_CHANGED"),"{error}");
}

#[test]
fn erasing_a_model_does_not_hide_its_successful_native_tool_receipt() {
    let mut f=assigned();let b=f.binding.clone();
    db(&f).execute("DELETE FROM agentic_models WHERE run_id=$1",[&b.run_id]).unwrap();
    let error=f.store.transaction(&b,|tx|require_settled_in(tx,&b)).unwrap_err();
    assert!(error.contains("NATIVE_RECEIPT_COVERAGE_CHANGED"),"{error}");
}

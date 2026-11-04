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
        c["max_parallel_agents"]=2.into();c["limits"]["model_calls"]=24.into();
        c["orchestration"]=json!({"coordinator":"reader","max_delegations":4,"hierarchy":{
            "parents":{"leaf":"manager","spare":"manager","manager":"reader","sibling":"reader"},"max_depth":3,"max_children":2}});
        c["agents"]=json!([
            {"id":"leaf","instruction":"Only execute the admitted task","tools":["write_artifact"],"artifact_names":["note"],"max_turns":3},
            {"id":"spare","instruction":"Stay dormant unless assigned","tools":["read_source"],"max_turns":2},
            {"id":"manager","instruction":"Delegate only to direct admitted children","tools":["delegate_task","read_artifact"],"max_turns":4},
            {"id":"sibling","instruction":"Stay dormant unless assigned","tools":["read_source"],"max_turns":2},
            {"id":"reader","instruction":"Coordinate","tools":["delegate_task","read_artifact"],"max_turns":4}]);c
    })
}
fn run(f:&mut fixture::Pending,response:Value) {
    if f.permit.is_none() { f.prepare_permit(); }
    let b=f.binding.clone();let key=f.key.clone();
    let wave=f.store.transaction(&b,|tx|journal::begin_in(tx,&b,&[key])).unwrap();
    let record=f.complete(response);
    if record.tool_calls.is_empty() { f.finish_agent(&record); }
    else { agentic_tools::execute(&mut f.store,&b,&record.key).unwrap(); }
    assert!(journal::finish(&mut f.store,&b,&wave).unwrap().is_joined());
}
fn step(f:&mut fixture::Pending,agent:&str,turn:u32) {
    let b=f.binding.clone();let key=StepKey{agent_id:agent.into(),turn};
    f.store.transaction(&b,|tx|receive_returns_in(tx,&b,&key)).unwrap();f.prepare_step(agent,turn);
}
fn delegate(f:&mut fixture::Pending,child:&str) {
    run(f,fixture::tool("delegate_task",json!({"agent_id":child,"task":format!("Task for {child}; do not acquire any new permission.")}),"delegate"));
}
fn nested()->fixture::Pending {
    let mut f=pending();delegate(&mut f,"manager");step(&mut f,"manager",0);delegate(&mut f,"leaf");f
}
fn returned_leaf()->fixture::Pending {
    let mut f=nested();step(&mut f,"leaf",0);
    run(&mut f,fixture::tool("write_artifact",json!({"name":"note","text":"Private leaf artifact"}),"write-note"));
    step(&mut f,"leaf",1);run(&mut f,fixture::response(TEXT));
    let b=f.binding.clone();let key=StepKey{agent_id:"manager".into(),turn:1};
    f.store.transaction(&b,|tx|receive_returns_in(tx,&b,&key)).unwrap();f
}
fn db(f:&fixture::Pending)->rusqlite::Connection { rusqlite::Connection::open(f.directory.path().join("ledger.sqlite")).unwrap() }

#[test]
fn intermediate_parent_combines_received_task_and_only_its_direct_child_returns() {
    let mut f=returned_leaf();let b=f.binding.clone();let manager=StepKey{agent_id:"manager".into(),turn:1};
    let view=f.store.transaction(&b,|tx|view_in(tx,&b,&manager)).unwrap();
    assert_eq!(view["model"]["assignment"]["worker_id"],"manager");
    assert_eq!(view["model"]["delegated_results"][0]["agent_id"],"leaf");
    assert_eq!(view["model"]["available_workers"],json!(["spare"]));
    assert_eq!(view["model"]["delegated_results"][0]["artifacts"][0]["text"],"Private leaf artifact");
    assert!(f.store.transaction(&b,|tx|view_in(tx,&b,&StepKey{agent_id:"reader".into(),turn:1})).is_err());
    step(&mut f,"manager",1);run(&mut f,fixture::response(TEXT));step(&mut f,"reader",1);
    let root=f.store.transaction(&b,|tx|view_in(tx,&b,&StepKey{agent_id:"reader".into(),turn:1})).unwrap();
    assert_eq!(root["model"]["delegated_results"].as_array().unwrap().len(),1);
    assert_eq!(root["model"]["delegated_results"][0]["agent_id"],"manager");
    assert_eq!(root["model"]["available_workers"],json!(["sibling"]));
}

#[test]
fn local_turn_prefix_preserves_root_and_manager_origin_requests_after_deeper_effects() {
    let mut f=pending();let b=f.binding.clone();let root_key=f.key.clone();
    let root_hash=genos_api::native_inference::tool_request_hash(&f.request).unwrap();
    delegate(&mut f,"manager");step(&mut f,"manager",0);let manager_key=f.key.clone();
    let manager_hash=genos_api::native_inference::tool_request_hash(&f.request).unwrap();delegate(&mut f,"leaf");
    for (key,expected) in [(&root_key,root_hash),(&manager_key,manager_hash)] {
        let old=agentic_context::prepare(&mut f.store,&b,key).unwrap();
        assert_eq!(genos_api::native_inference::tool_request_hash(&old).unwrap(),expected);
    }
    let root=f.store.transaction(&b,|tx|view_in(tx,&b,&root_key)).unwrap();
    assert_eq!(root["model"]["available_workers"],json!(["manager","sibling"]));
    assert!(root["model"]["delegated_results"].as_array().unwrap().is_empty());
    assert_eq!(f.requests.load(Ordering::SeqCst),2);
}

#[test]
fn artifact_read_authority_is_not_transitive_through_the_tree() {
    let mut f=returned_leaf();let b=f.binding.clone();
    let allowed=StepKey{agent_id:"manager".into(),turn:1};let denied=StepKey{agent_id:"reader".into(),turn:1};
    f.store.transaction(&b,|tx| {
        let artifact=received_artifact_in(tx,&b,(&allowed,"leaf","note"))?.unwrap();
        assert_eq!(artifact.text,"Private leaf artifact");
        assert!(received_artifact_in(tx,&b,(&denied,"leaf","note"))?.is_none());Ok(())
    }).unwrap();
    let receiver=super::super::digest(&(&b,"agentic-receiver","leaf","manager")).unwrap();
    db(&f).execute("UPDATE protocol_gqwf_objects SET bytes=x'00' WHERE store_id=$1 AND hash=$2",
        rusqlite::params![receiver,super::super::raw_hash(b"Private leaf artifact")]).unwrap();
    assert!(f.store.transaction(&b,|tx|received_artifact_in(tx,&b,(&allowed,"leaf","note"))).is_err());
}

#[test]
fn all_costs_can_be_settled_while_handoff_still_waits_for_nested_child_completion() {
    let mut f=nested();let b=f.binding.clone();let state=ledger::state(&mut f.store,&b).unwrap();
    assert_eq!(state.held,ledger::Amounts::default());assert_eq!(state.unknown_operations,0);
    assert!(f.store.transaction(&b,|tx|require_settled_in(tx,&b)).is_err());
    step(&mut f,"leaf",0);run(&mut f,fixture::response(TEXT));step(&mut f,"manager",1);
    run(&mut f,fixture::response(TEXT));
    let key=StepKey{agent_id:"reader".into(),turn:1};f.store.transaction(&b,|tx|receive_returns_in(tx,&b,&key)).unwrap();
    f.store.transaction(&b,|tx|require_settled_in(tx,&b)).unwrap();
    assert!(ledger::agent_record(&mut f.store,&b,"reader").unwrap().is_none());
}

#[test]
fn descendant_return_transplant_is_rejected_without_grandparent_delivery() {
    let mut f=returned_leaf();let b=f.binding.clone();let connection=db(&f);
    let raw:String=connection.query_row("SELECT value_json FROM protocol_agentic_delegation_returns WHERE worker_id='leaf'",[],|r|r.get(0)).unwrap();
    let mut value:ReturnDelivery=serde_json::from_str(&raw).unwrap();value.coordinator_id="reader".into();value.receipt_hash.clear();
    value.receipt_hash=super::super::digest(&("genos.agentic.delegation-return/v1",&value)).unwrap();
    connection.execute("UPDATE protocol_agentic_delegation_returns SET value_json=$1,value_hash=$2 WHERE worker_id='leaf'",
        rusqlite::params![serde_json::to_string(&value).unwrap(),super::super::digest(&value).unwrap()]).unwrap();
    assert!(f.store.transaction(&b,|tx|view_in(tx,&b,&StepKey{agent_id:"manager".into(),turn:1})).is_err());
    let count:i64=connection.query_row("SELECT COUNT(*) FROM protocol_agentic_deliveries WHERE sender='leaf' AND receiver='reader'",[],|r|r.get(0)).unwrap();
    assert_eq!(count,0);
}

#[test]
fn closure_covers_nested_calls_and_dormant_slots_then_publication_rolls_back_atomically() {
    let mut f=returned_leaf();let b=f.binding.clone();step(&mut f,"manager",1);run(&mut f,fixture::response(TEXT));
    step(&mut f,"reader",1);run(&mut f,fixture::response(TEXT));
    let proof=f.store.transaction(&b,|tx|closure_in(tx,&b)).unwrap();
    assert_eq!(proof["assignments"].as_array().unwrap().len(),2);
    assert_eq!(proof["unused_slots"],json!(["spare","sibling"]));
    assert_eq!(proof["hierarchy"]["parents"]["leaf"],"manager");
    let evidence=super::super::agentic_evidence::qualify(&mut f.store,&b).unwrap();assert!(evidence.contract_satisfied());
    let connection=db(&f);
    connection.execute_batch("CREATE TRIGGER reject_hierarchical_publish BEFORE INSERT ON protocol_agentic_publications BEGIN SELECT RAISE(ABORT,'hierarchical publication abort'); END;").unwrap();
    assert!(super::super::agentic_exchange::publish(&mut f.store,&b,&evidence).is_err());
    assert_eq!(connection.query_row("SELECT generation FROM protocol_gqwf_heads",[],|r|r.get::<_,i64>(0)).unwrap(),0);
    let status:String=connection.query_row("SELECT status FROM rust_protocol_runs WHERE run_id=$1",[&b.run_id],|r|r.get(0)).unwrap();assert_ne!(status,"completed");
    assert_eq!(connection.query_row("SELECT COUNT(*) FROM rust_protocol_events WHERE phase='AGENTIC_EMIT_COMMITTED'",[],|r|r.get::<_,i64>(0)).unwrap(),0);
    connection.execute_batch("DROP TRIGGER reject_hierarchical_publish").unwrap();
    let first=super::super::agentic_exchange::publish(&mut f.store,&b,&evidence).unwrap();
    let replay=super::super::agentic_exchange::publish(&mut f.store,&b,&evidence).unwrap();assert_eq!(first,replay);
    assert!(!first.semantic_truth_verified && !first.promotable && !first.external_effects_authorized);
    assert_eq!(f.requests.load(Ordering::SeqCst),6);
}

#[test]
fn rehashed_child_task_receipt_cannot_grant_its_grandparent_the_task_namespace() {
    let mut f=nested();let b=f.binding.clone();let manager=StepKey{agent_id:"manager".into(),turn:0};
    let original=genos_api::native_inference::tool_request_hash(&agentic_context::prepare(&mut f.store,&b,&manager).unwrap()).unwrap();
    let connection=db(&f);
    let raw:String=connection.query_row("SELECT value_json FROM protocol_agentic_task_deliveries WHERE worker_id='leaf'",[],|r|r.get(0)).unwrap();
    let mut value:TaskDelivery=serde_json::from_str(&raw).unwrap();let previous=value.receiver_store.clone();
    value.receiver_store=super::super::digest(&(&b,"agentic-task-receiver","reader")).unwrap();
    connection.execute("INSERT INTO protocol_gqwf_objects SELECT $1,hash,bytes FROM protocol_gqwf_objects WHERE store_id=$2",
        rusqlite::params![value.receiver_store,previous]).unwrap();
    value.receipt_hash.clear();value.receipt_hash=super::super::digest(&("genos.agentic.task-delivery/v1",&value)).unwrap();
    connection.execute("UPDATE protocol_agentic_task_deliveries SET value_json=$1,value_hash=$2 WHERE worker_id='leaf'",
        rusqlite::params![serde_json::to_string(&value).unwrap(),super::super::digest(&value).unwrap()]).unwrap();
    assert!(f.store.transaction(&b,|tx|super::super::agentic_delegation::assigned_in(tx,&b,"leaf")).is_err());
    let old=agentic_context::prepare(&mut f.store,&b,&manager).unwrap();
    assert_eq!(genos_api::native_inference::tool_request_hash(&old).unwrap(),original);
}

#[test]
fn removing_a_nested_assignment_and_morph_event_cannot_hide_its_accepted_native_call() {
    let mut f=nested();let b=f.binding.clone();let connection=db(&f);
    connection.execute_batch("DELETE FROM protocol_agentic_delegations WHERE worker_id='leaf';
      DELETE FROM protocol_agentic_task_deliveries WHERE worker_id='leaf';
      DELETE FROM rust_protocol_events WHERE phase IN ('AGENTIC_WORKER_ASSIGNED','AGENTIC_TASK_DELIVERED')
        AND json_extract(payload_json,'$.worker_id')='leaf';").unwrap();
    let error=f.store.transaction(&b,|tx|require_settled_in(tx,&b)).unwrap_err();
    assert!(error.contains("ACCEPTED_CALL_WITHOUT_ASSIGNMENT"),"{error}");
    assert_eq!(f.requests.load(Ordering::SeqCst),2);
}

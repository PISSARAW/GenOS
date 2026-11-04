use super::*;
use crate::mission_protocols::{agentic_context,agentic_tools,agentic_parallel_journal as journal};
use genos_api::native_inference::Finish;
use std::sync::atomic::Ordering;

mod fixture {
    use crate as genos_orchestrator;
    include!("../../tests/helpers/agentic_ledger_fixture.rs");
}

const TASK:&str="Read the selected note and preserve uncertainty";
const TEXT:&str="Sources: selected note. Limites: semantic truth not verified.";

fn pending() -> fixture::Pending {
    fixture::with_config(|mut config| {
        config["max_parallel_agents"]=2.into();
        config["orchestration"]=json!({"coordinator":"reader","max_delegations":2});
        config["agents"]=json!([
            {"id":"worker","instruction":"Execute only the assigned task","tools":["read_source"],"max_turns":3},
            {"id":"spare","instruction":"Execute only the assigned task","tools":["read_source"],"max_turns":3},
            {"id":"reader","instruction":"Delegate only to admitted workers","tools":["delegate_task","write_artifact"],
                "artifact_names":["draft"],"max_turns":4}]);config
    })
}

fn observe(f:&mut fixture::Pending, response:Value) -> (ModelRecord,journal::WaveHandle) {
    if f.permit.is_none() { f.prepare_permit(); }
    let binding=f.binding.clone();let key=f.key.clone();
    let wave=f.store.transaction(&binding,|tx|journal::begin_in(tx,&binding,&[key])).unwrap();
    (f.complete(response),wave)
}

fn consume(f:&mut fixture::Pending, input:(&ModelRecord,&journal::WaveHandle)) {
    match input.0.finish {
        Finish::ToolRequested=> { agentic_tools::execute(&mut f.store,&f.binding,&input.0.key).unwrap(); },
        Finish::Complete=> { f.finish_agent(input.0); },
        _=>panic!("fixture requires a native known terminal observation"),
    }
    assert!(journal::finish(&mut f.store,&f.binding,input.1).unwrap().is_joined());
}

fn run(f:&mut fixture::Pending, response:Value) -> ModelRecord {
    let (record,wave)=observe(f,response);consume(f,(&record,&wave));record
}

fn delegation(worker:&str) -> Value {
    fixture::tool("delegate_task",json!({"agent_id":worker,"task":TASK}),"delegate-one")
}

#[test]
fn optional_orchestration_keeps_old_serialized_config_and_rejects_unbounded_grants() {
    let f=pending();let base=f.spec.config.clone();base.validate().unwrap();
    for limit in [0,3] {
        let mut config=base.clone();config.orchestration.as_mut().unwrap().max_delegations=limit;
        assert!(config.validate().is_err());
    }
    let mut wrong=base.clone();wrong.max_parallel_agents=1;assert!(wrong.validate().is_err());
    wrong=base.clone();wrong.agents[0].depends_on.push("reader".into());assert!(wrong.validate().is_err());
    wrong=base.clone();wrong.agents[0].tools.push(super::super::agentic_spec::ToolKind::DelegateTask);
    assert!(wrong.validate().is_err());
    let old=fixture::unprepared();let wire=serde_json::to_value(&old.spec.config).unwrap();
    assert!(wire.get("orchestration").is_none());old.spec.config.validate().unwrap();
}

#[test]
fn native_assignment_is_unique_and_does_not_rewrite_its_origin_context() {
    let mut f=pending();let key=f.key.clone();let request_hash=genos_api::native_inference::tool_request_hash(&f.request).unwrap();
    let source=run(&mut f,delegation("worker"));
    let binding=f.binding.clone();
    f.store.transaction(&binding,|tx| {
        let assignment=assigned_in(tx,&binding,"worker")?.unwrap();
        assert_eq!(assignment.parent,source.key);assert_eq!(assignment.task,TASK);
        assert_eq!(assignment.task_hash,raw_hash(TASK.as_bytes()));assert_eq!(assignment.model_hash,source.model_hash);
        assert!(before_in(tx,&binding,&key)?.is_empty());
        assert_eq!(before_in(tx,&binding,&StepKey { agent_id:"reader".into(),turn:1 })?.len(),1);
        assert!(!eligible_in(tx,&binding,&StepKey { agent_id:"reader".into(),turn:1 })?);
        assert!(eligible_in(tx,&binding,&StepKey { agent_id:"worker".into(),turn:0 })?);
        assert!(!eligible_in(tx,&binding,&StepKey { agent_id:"spare".into(),turn:0 })?);Ok(())
    }).unwrap();
    let replay=agentic_context::prepare(&mut f.store,&binding,&key).unwrap();
    assert_eq!(genos_api::native_inference::tool_request_hash(&replay).unwrap(),request_hash);
    assert_eq!(agentic_tools::execute(&mut f.store,&binding,&key).unwrap().len(),1);
    assert_eq!(agentic_ledger::state(&mut f.store,&binding).unwrap().spent.tool_calls,1);
    assert_eq!(f.requests.load(Ordering::SeqCst),1);
}

#[test]
fn two_delegations_from_the_same_native_turn_are_registered_while_parent_waits() {
    let mut f=pending();let mut response=delegation("worker");
    response["message"]["tool_calls"].as_array_mut().unwrap().push(json!({"id":"delegate-two","type":"function",
        "function":{"name":"delegate_task","arguments":{"agent_id":"spare","task":"Inspect the limitation"}}}));
    run(&mut f,response);let binding=f.binding.clone();
    f.store.transaction(&binding,|tx| {
        let values=all_in(tx,&binding)?;assert_eq!(values.len(),2);
        assert_eq!(values[0].parent,values[1].parent);assert_ne!(values[0].call_index,values[1].call_index);
        assert!(!eligible_in(tx,&binding,&StepKey { agent_id:"reader".into(),turn:1 })?);Ok(())
    }).unwrap();
    assert_eq!(agentic_ledger::state(&mut f.store,&binding).unwrap().spent.tool_calls,2);
    assert_eq!(f.requests.load(Ordering::SeqCst),1);
}

#[test]
fn child_completion_and_return_delivery_resume_the_coordinator_without_running_dormant_roles() {
    let mut f=pending();let origin=f.key.clone();let source_hash=genos_api::native_inference::tool_request_hash(&f.request).unwrap();
    run(&mut f,delegation("worker"));f.prepare_step("worker",0);
    assert!(serde_json::to_string(&f.request.messages).unwrap().contains(TASK));
    run(&mut f,fixture::response(TEXT));
    let binding=f.binding.clone();let next=StepKey { agent_id:"reader".into(),turn:1 };
    f.store.transaction(&binding,|tx|super::super::agentic_delegation_exchange::receive_returns_in(tx,&binding,&next)).unwrap();
    f.prepare_step("reader",1);run(&mut f,fixture::response(TEXT));
    f.store.transaction(&binding,|tx|require_all_in(tx,&binding)).unwrap();
    assert!(agentic_ledger::agent_record(&mut f.store,&binding,"spare").unwrap().is_none());
    let original=agentic_context::prepare(&mut f.store,&binding,&origin).unwrap();
    assert_eq!(genos_api::native_inference::tool_request_hash(&original).unwrap(),source_hash);
    let evidence=super::super::agentic_evidence::qualify(&mut f.store,&binding).unwrap();
    assert!(evidence.contract_satisfied());super::super::agentic_exchange::publish(&mut f.store,&binding,&evidence).unwrap();
    let state=agentic_ledger::release(&mut f.store,&binding).unwrap();
    assert_eq!((state.spent.model_calls,state.spent.tool_calls),(3,1));assert_eq!(state.held,agentic_ledger::Amounts::default());
    assert_eq!(f.requests.load(Ordering::SeqCst),3);
}

#[test]
fn a_native_tool_receipt_failure_rolls_back_assignment_morph_delivery_and_budget() {
    let mut f=pending();let (_,wave)=observe(&mut f,delegation("worker"));let binding=f.binding.clone();
    let before=agentic_ledger::state(&mut f.store,&binding).unwrap();
    let db=rusqlite::Connection::open(f.directory.path().join("ledger.sqlite")).unwrap();
    db.execute_batch("CREATE TRIGGER reject_delegation_receipt BEFORE INSERT ON rust_protocol_events
        WHEN NEW.phase='NATIVE_TOOL_RECEIPT' BEGIN SELECT RAISE(ABORT,'fixture receipt failure'); END;").unwrap();
    let objects:u64=db.query_row("SELECT count(*) FROM protocol_gqwf_objects",[],|row|row.get(0)).unwrap();
    assert!(agentic_tools::execute(&mut f.store,&binding,&f.key).is_err());
    f.store.transaction(&binding,|tx| { assert!(all_in(tx,&binding)?.is_empty());Ok(()) }).unwrap();
    assert_eq!(db.query_row("SELECT count(*) FROM protocol_gqwf_objects",[],|row|row.get::<_,u64>(0)).unwrap(),objects);
    assert_eq!(agentic_ledger::state(&mut f.store,&binding).unwrap(),before);
    db.execute_batch("DROP TRIGGER reject_delegation_receipt").unwrap();
    agentic_tools::execute(&mut f.store,&binding,&f.key).unwrap();
    assert!(journal::finish(&mut f.store,&binding,&wave).unwrap().is_joined());
    assert_eq!(f.requests.load(Ordering::SeqCst),1);
}

#[test]
fn self_delegation_is_a_native_denied_attempt_and_never_activates_a_role() {
    let mut f=pending();run(&mut f,delegation("reader"));let binding=f.binding.clone();
    f.store.transaction(&binding,|tx| { assert!(all_in(tx,&binding)?.is_empty());Ok(()) }).unwrap();
    let receipts=agentic_tools::execute(&mut f.store,&binding,&f.key).unwrap();
    assert_eq!(receipts[0].output()["status"],"denied");
    let state=agentic_ledger::state(&mut f.store,&binding).unwrap();
    assert_eq!((state.spent.model_calls,state.spent.tool_calls),(1,1));
    assert_eq!(f.requests.load(Ordering::SeqCst),1);
}

#[test]
fn an_assignment_cannot_be_transplanted_and_future_rows_do_not_rewrite_old_contexts() {
    let mut f=pending();let key=f.key.clone();let original=genos_api::native_inference::tool_request_hash(&f.request).unwrap();
    let mut response=delegation("worker");
    response["message"]["tool_calls"].as_array_mut().unwrap().push(json!({"id":"delegate-two","type":"function",
        "function":{"name":"delegate_task","arguments":{"agent_id":"spare","task":"Inspect the limitation"}}}));
    run(&mut f,response);
    let db=rusqlite::Connection::open(f.directory.path().join("ledger.sqlite")).unwrap();
    db.execute("UPDATE protocol_agentic_delegations SET value_json=(SELECT value_json FROM protocol_agentic_delegations WHERE worker_id='spare'),
        value_hash=(SELECT value_hash FROM protocol_agentic_delegations WHERE worker_id='spare') WHERE worker_id='worker'",[]).unwrap();
    let binding=f.binding.clone();
    assert!(f.store.transaction(&binding,|tx|assigned_in(tx,&binding,"worker")).is_err());
    let replay=agentic_context::prepare(&mut f.store,&binding,&key).unwrap();
    assert_eq!(genos_api::native_inference::tool_request_hash(&replay).unwrap(),original);
    assert_eq!(f.requests.load(Ordering::SeqCst),1);
}

#[path="agentic_hierarchy_runtime_tests.rs"]
mod hierarchy;

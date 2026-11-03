#![cfg(feature="native-llm")]
#[path="helpers/dynamic_agentic_fixture.rs"] mod fixture;
use fixture::{Fixture,Mode};
use genos_orchestrator::mission_protocols::{agentic_engine,agentic_ledger,Store,digest};
use serde_json::Value;
use std::collections::BTreeSet;

#[test]
fn coordinator_delegates_two_real_parallel_tasks_then_adaptively_assigns_the_third_worker() {
    let f=Fixture::new(Mode::Adaptive);
    let report=agentic_engine::run(f.request()).unwrap();
    assert_complete(&report,(10,7));
    assert_eq!(f.calls().len(),10); assert_eq!(f.child_arrivals_before_first_response(),2);
    assert_eq!(report.parallelism.peak_active_step_workers,2);
    let ids:BTreeSet<_>=report.agents.iter().map(|agent|agent.agent_id.as_str()).collect();
    assert_eq!(ids,BTreeSet::from(["a","b","c","coordinator"]));
    let calls=f.calls();
    let parent_calls:Vec<_>=calls.iter().filter(|request|agent_id(request)=="coordinator").collect();
    assert_eq!(parent_calls.len(),4);
    assert!(!parent_calls[0]["messages"].to_string().contains("worker-a-result"));
    assert!(parent_calls[1]["messages"].to_string().contains("worker-a-result"));
    assert!(parent_calls[1]["messages"].to_string().contains("worker-b-result"));
    assert!(!parent_calls[1]["messages"].to_string().contains("worker-c-result"));
    assert!(parent_calls[2]["messages"].to_string().contains("worker-c-result"));
    assert_tasks_were_consumed(&calls);
    assert_historical_requests(&f,&report.binding);
    let replay=agentic_engine::run(f.request()).unwrap();
    assert_complete(&replay,(10,7)); assert!(replay.replayed);
    assert_eq!(replay.usage,report.usage); assert_eq!(f.calls().len(),10);
    assert_eq!(replay.parallelism.waves_prepared,0);
}

#[test]
fn unselected_preadmitted_worker_is_dormant_and_never_becomes_a_completed_or_dispatched_agent() {
    let f=Fixture::new(Mode::Subset);
    let report=agentic_engine::run(f.request()).unwrap();
    assert_complete(&report,(7,5));
    assert_eq!(f.calls().len(),7); assert_eq!(f.child_arrivals_before_first_response(),2);
    assert!(f.calls().iter().all(|request|agent_id(request)!="c"));
    let ids:BTreeSet<_>=report.agents.iter().map(|agent|agent.agent_id.as_str()).collect();
    assert_eq!(ids,BTreeSet::from(["a","b","coordinator"]));
    let db=f.database();
    assert_eq!(db.query_row("SELECT COUNT(*) FROM agentic_models WHERE agent_id='c'",[],|row|row.get::<_,u64>(0)).unwrap(),0);
    assert_eq!(db.query_row("SELECT COUNT(*) FROM agentic_agents WHERE agent_id='c'",[],|row|row.get::<_,u64>(0)).unwrap(),0);
    assert_historical_requests(&f,&report.binding);
}

#[test]
fn an_unknown_delegated_call_retains_the_mission_exposure_and_never_resumes_parent_or_redispatches_on_replay() {
    let f=Fixture::new(Mode::UnknownA);
    let report=agentic_engine::run(f.request()).unwrap();
    assert_eq!(report.status,"unresolved"); assert!(report.publication.is_none());
    assert!(!report.artifact_contract_verified); assert!(!report.usage.released);
    assert_eq!(report.usage.spent.model_calls,3); assert_eq!(report.usage.spent.tokens,120);
    assert_eq!(report.usage.held.tokens,2304); assert_eq!(report.usage.unknown_operations,1);
    assert_eq!(f.calls().len(),3); assert!(f.right_replied());
    assert_eq!(f.calls().iter().filter(|request|agent_id(request)=="coordinator").count(),1);
    let replay=agentic_engine::run(f.request()).unwrap();
    assert_eq!(replay.status,"unresolved"); assert!(replay.publication.is_none());
    assert_eq!(replay.usage,report.usage); assert_eq!(f.calls().len(),3);
    assert_eq!(replay.parallelism.waves_prepared,0);
}

#[test]
fn registration_rollback_recovers_known_parent_and_activates_children_in_the_same_scheduler_scan() {
    let f=Fixture::new(Mode::RegistrationAbort); f.arm_registration_abort();
    let first=agentic_engine::run(f.request()).unwrap();
    assert_eq!(first.status,"unresolved"); assert!(first.publication.is_none());
    assert_eq!(first.usage.spent.model_calls,1); assert_eq!(first.usage.spent.tool_calls,1);
    assert_eq!(f.calls().len(),1);
    let committed:u64=f.database().query_row("SELECT COUNT(*) FROM protocol_agentic_tool_receipts WHERE agent_id='coordinator'",
        [],|row|row.get(0)).unwrap();
    assert_eq!(committed,1);
    f.allow_registration();
    let resumed=agentic_engine::run(f.request()).unwrap();
    assert_complete(&resumed,(7,5)); assert!(resumed.replayed);
    assert_eq!(f.calls().len(),7);
    assert_eq!(f.calls().iter().filter(|request|agent_id(request)=="coordinator").count(),3);
    assert_eq!(resumed.binding,first.binding);
    assert_historical_requests(&f,&resumed.binding);
}

#[test]
fn corrupting_the_return_copy_received_by_parent_refuses_publication_replay_without_another_model_call() {
    let f=Fixture::new(Mode::Subset);
    let first=agentic_engine::run(f.request()).unwrap();
    assert_complete(&first,(7,5));
    let child=first.agents.iter().find(|agent|agent.agent_id=="a").unwrap();
    let receiver=digest(&(&first.binding,"agentic-receiver","a","coordinator")).unwrap();
    let db=rusqlite::Connection::open(&f.database).unwrap();
    let bytes:Vec<u8>=db.query_row("SELECT bytes FROM protocol_gqwf_objects WHERE store_id=?1 AND hash=?2",
        rusqlite::params![receiver,child.result_hash],|row|row.get(0)).unwrap();
    assert_eq!(bytes,child.text.as_bytes());
    Store::open(&f.database).unwrap().current(&first.binding).unwrap();
    assert_eq!(db.execute("UPDATE protocol_gqwf_objects SET bytes=X'00' WHERE store_id=?1 AND hash=?2",
        rusqlite::params![receiver,child.result_hash]).unwrap(),1);
    let reason=match agentic_engine::run(f.request()) {
        Err(error)=>error,
        Ok(report)=> {
            assert_eq!(report.status,"unresolved"); assert!(report.publication.is_none());
            assert!(!report.artifact_contract_verified);
            report.error.expect("integrity refusal reason missing")
        }
    };
    assert_eq!(reason,"AGENTIC_EXCHANGE_OBJECT_CORRUPT");
    assert_eq!(f.calls().len(),7);
}

fn assert_complete(report:&agentic_engine::NativeAgenticReport,costs:(u64,u64)) {
    assert_eq!(report.status,"completed"); assert!(report.artifact_contract_verified);
    assert_eq!(report.artifact.text,fixture::FINAL); assert!(report.publication.is_some());
    assert!(!report.semantic_truth_verified); assert!(!report.promotable); assert!(!report.external_effects_authorized);
    assert_eq!(report.usage.spent.model_calls,costs.0);
    assert_eq!(report.usage.spent.tokens,costs.0*40); assert_eq!(report.usage.spent.tool_calls,costs.1);
    assert_eq!(report.usage.unknown_operations,0); assert_eq!(report.usage.held.tokens,0); assert!(report.usage.released);
    for protocol in ["CONTINUITY","MORPH","SYNAPSE","ALLOSTASIS","OMEGA","EVIDENCE","GQWF"] {
        assert!(report.protocols.contains(&protocol.to_owned()));
    }
}

fn agent_id(request:&Value) -> String {
    request["messages"].as_array().unwrap().iter().find_map(|message| {
        let value:Value=serde_json::from_str(message["content"].as_str()?).ok()?;
        value["own_agent_id"].as_str().map(str::to_owned)
    }).expect("agent identity in actual model input missing")
}

fn assert_tasks_were_consumed(calls:&[Value]) {
    for id in ["a","b","c"] {
        let request=calls.iter().find(|request|agent_id(request)==id).unwrap();
        assert!(request["messages"].to_string().contains(&format!("task-{id}:")));
    }
}

fn assert_historical_requests(f:&Fixture,binding:&genos_orchestrator::mission_protocols::Binding) {
    let db=f.database();
    let rows:Vec<(String,u32)>=db.prepare("SELECT agent_id,turn FROM agentic_models WHERE status='observed' ORDER BY agent_id,turn").unwrap()
        .query_map([],|row|Ok((row.get(0)?,row.get(1)?))).unwrap().map(Result::unwrap).collect();
    let mut store=Store::open(&f.database).unwrap();
    for (agent_id,turn) in rows {
        let key=agentic_ledger::StepKey { agent_id,turn };
        let record=agentic_ledger::model_record(&mut store,binding,&key).unwrap();
        assert_eq!(record.key,key);
    }
}

#![cfg(feature="native-llm")]
#[path="helpers/hierarchical_agentic_fixture.rs"] mod fixture;
use fixture::{Fixture,Mode,agent_id,model_input};
use genos_orchestrator::mission_protocols::{agentic_engine,agentic_ledger,agentic_context,Store,digest};
use serde_json::Value;
use std::collections::BTreeSet;

#[test]
fn two_intermediate_parents_delegate_parallel_leaves_and_receive_only_their_own_children() {
    let f=Fixture::new(Mode::Tree);
    assert_eq!(f.spec.timeout_ms,600000);assert_eq!(f.spec.config.turn_timeout_ms,20000);
    let started=genos_orchestrator::mission_protocols::now_ms();
    let report=agentic_engine::run(f.request()).unwrap();
    assert!(report.binding.expires_ms>started+180000);
    assert_complete(&report);
    assert_eq!(f.provider.calls(),14);
    assert_eq!(f.provider.arrivals().values().copied().collect::<Vec<_>>(),vec![2,2]);
    assert_eq!(report.parallelism.peak_active_step_workers,2);
    assert_eq!(report.parallelism.waves_prepared,9);
    let actors:BTreeSet<_>=report.agents.iter().map(|agent|agent.agent_id.as_str()).collect();
    assert_eq!(actors,BTreeSet::from(["root","mid_left","mid_right","leaf_left","leaf_right"]));
    let requests=f.provider.requests();
    assert_parent_contexts(&requests);
    assert_durable_tree(&f);
    assert_historical_requests(&f,&report.binding);
    let replay=agentic_engine::run(f.request()).unwrap();
    assert_complete(&replay);assert!(replay.replayed);
    assert_eq!(replay.usage,report.usage);assert_eq!(f.provider.calls(),14);
    assert_eq!(replay.parallelism.waves_prepared,0);
}

#[test]
fn unknown_leaf_retains_the_common_budget_and_blocks_both_ancestor_levels_on_restart() {
    let f=Fixture::new(Mode::UnknownLeafLeft);
    let report=agentic_engine::run(f.request()).unwrap();
    assert_eq!(report.status,"unresolved");assert!(report.publication.is_none());
    assert!(!report.artifact_contract_verified);assert!(!report.usage.released);
    assert_eq!(report.usage.spent.model_calls,5);assert_eq!(report.usage.spent.tokens,200);
    assert_eq!(report.usage.held.tokens,4352);assert_eq!(report.usage.unknown_operations,1);
    assert_eq!(f.provider.calls(),5);
    let requests=f.provider.requests();
    for id in ["root","mid_left","mid_right"] {
        assert_eq!(requests.iter().filter(|request|agent_id(request)==id).count(),1);
    }
    let replay=agentic_engine::run(f.request()).unwrap();
    assert_eq!(replay.status,"unresolved");assert!(replay.publication.is_none());
    assert_eq!(replay.usage,report.usage);assert_eq!(f.provider.calls(),5);
    assert_eq!(replay.parallelism.waves_prepared,0);
    assert_eq!(f.connection().query_row("SELECT COUNT(*) FROM protocol_agentic_artifacts",[],|row|row.get::<_,u64>(0)).unwrap(),0);
}

#[test]
fn known_intermediate_registration_resumes_after_transaction_abort_without_reissuing_the_parent_request() {
    let f=Fixture::new(Mode::RegistrationAbort);f.arm_registration_abort();
    let first=agentic_engine::run(f.request()).unwrap();
    assert_eq!(first.status,"unresolved");assert!(first.publication.is_none());
    assert_eq!(f.provider.calls(),3);assert_eq!(first.usage.spent.model_calls,3);
    let db=f.connection();
    assert_eq!(db.query_row("SELECT COUNT(*) FROM protocol_agentic_delegations WHERE worker_id='leaf_left'",[],|row|row.get::<_,u64>(0)).unwrap(),0);
    assert_eq!(db.query_row("SELECT COUNT(*) FROM protocol_agentic_task_deliveries WHERE worker_id='leaf_left'",[],|row|row.get::<_,u64>(0)).unwrap(),0);
    f.allow_registration();
    let resumed=agentic_engine::run(f.request()).unwrap();
    assert_complete(&resumed);assert!(resumed.replayed);assert_eq!(resumed.binding,first.binding);
    assert_eq!(f.provider.calls(),14);
    assert_eq!(f.provider.requests().iter().filter(|request|agent_id(request)=="mid_left").count(),3);
    assert_historical_requests(&f,&resumed.binding);
}

#[test]
fn corrupt_leaf_return_received_by_intermediate_parent_refuses_root_publication_replay() {
    let f=Fixture::new(Mode::Tree);
    let completed=agentic_engine::run(f.request()).unwrap();assert_complete(&completed);
    let leaf=completed.agents.iter().find(|agent|agent.agent_id=="leaf_left").unwrap();
    let receiver=digest(&(&completed.binding,"agentic-receiver","leaf_left","mid_left")).unwrap();
    let db=rusqlite::Connection::open(&f.database).unwrap();
    let original:Vec<u8>=db.query_row("SELECT bytes FROM protocol_gqwf_objects WHERE store_id=?1 AND hash=?2",
        rusqlite::params![receiver,leaf.result_hash],|row|row.get(0)).unwrap();
    assert_eq!(original,leaf.text.as_bytes());
    assert_eq!(db.execute("UPDATE protocol_gqwf_objects SET bytes=X'00' WHERE store_id=?1 AND hash=?2",
        rusqlite::params![receiver,leaf.result_hash]).unwrap(),1);
    let reason=match agentic_engine::run(f.request()) {
        Err(reason)=>reason,
        Ok(report)=> {
            assert_eq!(report.status,"unresolved");assert!(report.publication.is_none());
            assert!(!report.artifact_contract_verified);report.error.unwrap()
        },
    };
    assert_eq!(reason,"AGENTIC_EXCHANGE_OBJECT_CORRUPT");assert_eq!(f.provider.calls(),14);
}

#[track_caller]
fn assert_complete(report:&agentic_engine::NativeAgenticReport) {
    assert_eq!(report.status,"completed","{:?}",report.error);assert!(report.publication.is_some());
    assert!(report.artifact_contract_verified);assert_eq!(report.artifact.text,fixture::FINAL);
    assert!(!report.semantic_truth_verified);assert!(!report.promotable);assert!(!report.external_effects_authorized);
    assert_eq!(report.usage.spent.model_calls,14);assert_eq!(report.usage.spent.tokens,560);
    assert_eq!(report.usage.spent.tool_calls,11);assert_eq!(report.usage.unknown_operations,0);
    assert_eq!(report.usage.held.tokens,0);assert!(report.usage.released);
    assert_eq!(report.usage.limits.wall_ms,570000);assert_eq!(report.usage.protected.wall_ms,28500);
    for protocol in ["CONTINUITY","MORPH","SYNAPSE","ALLOSTASIS","OMEGA","EVIDENCE","GQWF"] {
        assert!(report.protocols.contains(&protocol.to_owned()));
    }
}

fn assert_parent_contexts(requests:&[Value]) {
    for side in ["left","right"] {
        let mid=format!("mid_{side}");let leaf=format!("leaf_{side}");
        let turns:Vec<_>=requests.iter().filter(|request|agent_id(request)==mid).collect();
        assert_eq!(turns.len(),3);
        let first=model_input(turns[0]);let next=model_input(turns[1]);
        assert_eq!(first["orchestration"]["assignment"]["task"],format!("mid-task-{side}: combine your delegated findings"));
        assert_eq!(next["orchestration"]["assignment"],first["orchestration"]["assignment"]);
        assert_eq!(first["orchestration"]["delegated_results"],serde_json::json!([]));
        let results=next["orchestration"]["delegated_results"].as_array().unwrap();
        assert_eq!(results.len(),1);assert_eq!(results[0]["agent_id"],leaf);
        assert!(results[0]["text"].as_str().unwrap().contains(&format!("leaf-{side}-result")));
        let leaf_first=requests.iter().find(|request|agent_id(request)==leaf).unwrap();
        assert_eq!(model_input(leaf_first)["orchestration"]["assignment"]["task"],format!("leaf-task-{side}: inspect the admitted source"));
    }
    let root:Vec<_>=requests.iter().filter(|request|agent_id(request)=="root").collect();
    assert_eq!(root.len(),4);
    let returned=model_input(root[1]);let results=returned["orchestration"]["delegated_results"].as_array().unwrap();
    assert_eq!(results.len(),2);
    assert_eq!(results.iter().map(|value|value["agent_id"].as_str().unwrap()).collect::<BTreeSet<_>>(),BTreeSet::from(["mid_left","mid_right"]));
}

fn assert_durable_tree(f:&Fixture) {
    let db=f.connection();
    let edges:Vec<(String,String)>=db.prepare("SELECT worker_id,parent_agent FROM protocol_agentic_delegations ORDER BY worker_id").unwrap()
        .query_map([],|row|Ok((row.get(0)?,row.get(1)?))).unwrap().map(Result::unwrap).collect();
    assert_eq!(edges,vec![("leaf_left".into(),"mid_left".into()),("leaf_right".into(),"mid_right".into()),
        ("mid_left".into(),"root".into()),("mid_right".into(),"root".into())]);
    assert_eq!(db.query_row("SELECT COUNT(*) FROM agentic_models WHERE agent_id='idle'",[],|row|row.get::<_,u64>(0)).unwrap(),0);
    assert_eq!(db.query_row("SELECT COUNT(*) FROM agentic_pools",[],|row|row.get::<_,u64>(0)).unwrap(),1);
}

fn assert_historical_requests(f:&Fixture,binding:&genos_orchestrator::mission_protocols::Binding) {
    let db=f.connection();
    let rows:Vec<(String,u32)>=db.prepare("SELECT agent_id,turn FROM agentic_models WHERE status='observed'").unwrap()
        .query_map([],|row|Ok((row.get(0)?,row.get(1)?))).unwrap().map(Result::unwrap).collect();
    let mut store=Store::open(&f.database).unwrap();
    for (agent_id,turn) in rows {
        let key=agentic_ledger::StepKey { agent_id,turn };
        let record=agentic_ledger::model_record(&mut store,binding,&key).unwrap();
        let request=agentic_context::prepare(&mut store,binding,&key).unwrap();
        assert_eq!(genos_api::native_inference::tool_request_hash(&request).unwrap(),record.request_hash);
        assert!(request.base.expires_ms<=binding.expires_ms);
    }
}

#![cfg(feature="native-llm")]
#[path="helpers/agentic_parallel_fixture.rs"] mod fixture;
use fixture::{Fixture,Mode};
use genos_orchestrator::mission_protocols::{agentic_engine,raw_hash};
use serde_json::{Value,json};

#[test]
fn two_http_requests_arrive_before_either_response_and_the_sink_consumes_both_received_results() {
    let f=Fixture::new(Mode::Parallel);
    let report=agentic_engine::run(f.request()).unwrap();
    assert_eq!(report.status,"completed"); assert!(report.artifact_contract_verified);
    assert_eq!(report.artifact.text,fixture::FINAL);
    assert!(!report.semantic_truth_verified); assert!(!report.promotable); assert!(!report.external_effects_authorized);
    assert_eq!(f.arrivals_before_first_response(),2);
    assert_eq!(f.calls().len(),6);
    assert_eq!(report.parallelism.peak_active_step_workers,2);
    assert_eq!(report.parallelism.waves_prepared,4);
    assert_eq!(report.usage.spent.model_calls,6); assert_eq!(report.usage.spent.tool_calls,3);
    assert_eq!(report.usage.spent.tokens,240); assert_eq!(report.usage.unknown_operations,0);
    assert!(report.usage.released);
    assert!(f.calls().iter().any(|request|sink_has_both_results(request)));
    for protocol in ["CONTINUITY","MORPH","SYNAPSE","ALLOSTASIS","OMEGA","EVIDENCE","GQWF"] {
        assert!(report.protocols.contains(&protocol.to_owned()));
    }
    let replay=agentic_engine::run(f.request()).unwrap();
    assert_eq!(replay.status,"completed"); assert!(replay.replayed);
    assert_eq!(replay.usage,report.usage);
    assert_eq!(serde_json::to_value(replay.publication).unwrap(),serde_json::to_value(report.publication).unwrap());
    assert_eq!(replay.parallelism.peak_active_step_workers,0); assert_eq!(replay.parallelism.waves_prepared,0);
    assert_eq!(f.calls().len(),6);
    let (hash,bytes):(String,Vec<u8>)=f.database().query_row("SELECT a.hash,o.bytes FROM protocol_agentic_artifacts a
        JOIN protocol_gqwf_objects o ON o.store_id=a.store_id AND o.hash=a.hash WHERE a.agent_id='sink' AND a.name='draft'",
        [],|row|Ok((row.get(0)?,row.get(1)?))).unwrap();
    assert_eq!(bytes,fixture::FINAL.as_bytes()); assert_eq!(hash,raw_hash(&bytes));
}

fn sink_has_both_results(request:&Value) -> bool {
    request["messages"].as_array().unwrap().iter().any(|message| {
        let Ok(data)=serde_json::from_str::<Value>(message["content"].as_str().unwrap_or("")) else { return false; };
        if data["own_agent_id"]!="sink" { return false; }
        let Some(dependencies)=data["dependencies"].as_array() else { return false; };
        dependencies.len()==2 && dependencies.iter().all(|dependency| {
            let id=dependency["agent_id"].as_str().unwrap();
            dependency["text"].as_str().unwrap().contains(&format!("{id}-result"))
        })
    })
}

#[test]
fn aggregate_token_capacity_admits_only_one_worker_without_spending_the_protected_reserve() {
    let f=Fixture::new(Mode::SerialCapacity);
    let report=agentic_engine::run(f.request()).unwrap();
    assert_eq!(report.status,"completed"); assert_eq!(report.max_parallel_agents,2);
    assert_eq!(report.parallelism.peak_active_step_workers,1);
    assert_eq!(report.parallelism.waves_prepared,6);
    assert_eq!(f.arrivals_before_first_response(),1);
    assert_eq!(f.calls().len(),6);
    assert_eq!(report.usage.spent.tokens,240);
    assert_eq!(report.usage.held.tokens,0);
    assert_eq!(report.usage.protected.tokens,225);
    assert!(report.usage.spent.tokens+report.usage.protected.tokens<=report.usage.limits.tokens);
}

#[test]
fn ambiguous_left_response_retains_exposure_joins_the_delayed_sibling_and_never_launches_another_wave() {
    let f=Fixture::new(Mode::UnknownLeft);
    let report=agentic_engine::run(f.request()).unwrap();
    assert_eq!(report.status,"unresolved"); assert!(report.publication.is_none());
    assert!(!report.artifact_contract_verified); assert!(!report.semantic_truth_verified);
    assert_eq!(f.arrivals_before_first_response(),2);
    assert!(f.right_replied()); assert_eq!(f.calls().len(),2);
    assert_eq!(report.usage.spent.model_calls,2);
    assert_eq!(report.usage.spent.tokens,80);
    assert_eq!(report.usage.held.tokens,2304);
    assert_eq!(report.usage.unknown_operations,1); assert!(!report.usage.released);
    assert_eq!(report.parallelism.waves_prepared,1);
    let observed_right:u64=f.database().query_row("SELECT COUNT(*) FROM agentic_models WHERE agent_id='right' AND status='observed'",
        [],|row|row.get(0)).unwrap();
    assert_eq!(observed_right,1);
    let replay=agentic_engine::run(f.request()).unwrap();
    assert_eq!(replay.status,"unresolved"); assert!(replay.replayed);
    assert_eq!(replay.usage,report.usage); assert_eq!(replay.parallelism.waves_prepared,0);
    assert_eq!(f.calls().len(),2);
}

#[test]
fn parallel_library_profile_refuses_a_database_outside_its_guarded_native_journal() {
    let f=Fixture::new(Mode::Parallel);
    let mut request=f.request();
    request.database=f.directory.path().join("custom.sqlite");
    let report=agentic_engine::run(request).unwrap();
    assert_eq!(report.status,"unresolved"); assert!(report.publication.is_none());
    assert_eq!(report.usage.spent.model_calls,0);
    assert_eq!(report.parallelism.waves_prepared,0); assert_eq!(f.calls().len(),0);
    assert!(report.error.unwrap().contains("AGENTIC_PARALLEL_NATIVE_JOURNAL_REQUIRED"));
    assert_eq!(serde_json::to_value(report.usage.held).unwrap(),json!({"tokens":0,"model_calls":0,"tool_calls":0,"wall_ms":0}));
}

#[test]
fn recovery_checks_every_pending_member_before_retrying_a_known_members_rolled_back_tool() {
    let f=Fixture::new(Mode::PendingRight);
    prepare_faulted_wave(&f);
    let first=agentic_engine::run(f.request()).unwrap();
    assert_eq!(first.status,"unresolved"); assert!(first.publication.is_none());
    assert_eq!(first.usage.spent.model_calls,1); assert_eq!(first.usage.spent.tokens,40);
    assert_eq!(first.usage.spent.tool_calls,0);
    assert_eq!(first.usage.held.model_calls,1); assert_eq!(first.usage.held.tokens,2304);
    assert_eq!(f.calls().len(),1);
    let db=rusqlite::Connection::open(&f.database).unwrap();
    let states:Vec<(String,String)>=db.prepare("SELECT agent_id,status FROM agentic_models ORDER BY agent_id").unwrap()
        .query_map([],|row|Ok((row.get(0)?,row.get(1)?))).unwrap().map(Result::unwrap).collect();
    assert_eq!(states,vec![("left".into(),"observed".into()),("right".into(),"intent".into())]);
    db.execute_batch("DROP TRIGGER abort_left_receipt").unwrap();
    let resumed=agentic_engine::run(f.request()).unwrap();
    assert_eq!(resumed.status,"unresolved"); assert!(resumed.publication.is_none());
    assert_eq!(resumed.usage,first.usage); assert_eq!(resumed.parallelism.waves_prepared,0);
    assert_eq!(resumed.usage.spent.tool_calls,0); assert_eq!(f.calls().len(),1);
    assert_eq!(db.query_row("SELECT COUNT(*) FROM protocol_agentic_tool_receipts",[],|row|row.get::<_,u64>(0)).unwrap(),0);
    assert_eq!(db.query_row("SELECT generation FROM protocol_gqwf_heads",[],|row|row.get::<_,u64>(0)).unwrap(),0);
}

fn prepare_faulted_wave(f:&Fixture) {
    use genos_orchestrator::mission_protocols::{Store,agentic_ledger,agentic_exchange};
    let mut store=Store::open(&f.database).unwrap();
    let binding=store.admit_agentic(&f.spec).unwrap();
    agentic_ledger::initialize(&mut store,&binding).unwrap();
    agentic_exchange::initialize(&mut store,&binding).unwrap();
    let db=rusqlite::Connection::open(&f.database).unwrap();
    db.execute_batch("CREATE TRIGGER abort_right_claim BEFORE UPDATE OF status ON agentic_models
        WHEN NEW.agent_id='right' AND NEW.status='dispatching'
        BEGIN SELECT RAISE(ABORT,'TEST_RIGHT_NOT_CLAIMED'); END;
      CREATE TRIGGER abort_left_receipt BEFORE INSERT ON protocol_agentic_tool_receipts
        WHEN NEW.agent_id='left' BEGIN SELECT RAISE(ABORT,'TEST_LEFT_TOOL_ROLLBACK'); END;").unwrap();
}

#[path="helpers/rust_agentic_parallel_fixture.rs"] mod fixture;
use fixture::{Fixture,success,unresolved};
use serde_json::Value;
use std::collections::BTreeSet;

fn identity()->String { uuid::Uuid::new_v4().to_string() }
fn assert_complete(report:&Value) {
    assert_eq!(report["artifact"]["text"],fixture::TEXT);assert_eq!(report["artifact_contract_verified"],true);
    for field in ["semantic_truth_verified","promotable","external_effects_authorized"] { assert_eq!(report[field],false); }
    assert_eq!(report["agents"].as_array().unwrap().len(),3);
    assert_eq!(report["usage"]["spent"]["model_calls"],6);assert_eq!(report["usage"]["spent"]["tokens"],240);
    assert_eq!(report["usage"]["spent"]["tool_calls"],3);assert_eq!(report["usage"]["unknown_operations"],0);
    assert_eq!(report["usage"]["released"],true);assert_eq!(report["usage"]["held"]["model_calls"],0);
    for protocol in ["CONTINUITY","MORPH","SYNAPSE","OMEGA","ALLOSTASIS","EVIDENCE","GQWF"] {
        assert!(report["protocols"].as_array().unwrap().iter().any(|value|value==protocol));
    }
}

#[test]
fn two_real_http_requests_overlap_before_tools_and_dependent_publication_then_replay_is_idle() {
    let _guard=fixture::serial();let f=Fixture::new((true,false));let mission=identity();
    let first=success(f.command(&mission).output().unwrap());assert_complete(&first);
    assert_eq!(f.calls(),6);assert_eq!(f.finished(),6);assert_eq!(f.peak(),2);
    assert_eq!(first["max_parallel_agents"],2);assert_eq!(first["parallelism"]["waves_prepared"],4);
    assert_eq!(first["parallelism"]["peak_active_step_workers"],2);
    let requests=f.requests();
    assert_eq!(requests[..2].iter().map(fixture::agent_id).collect::<BTreeSet<_>>(),BTreeSet::from(["left".into(),"right".into()]));
    for request in requests.iter().filter(|request|fixture::agent_id(request)=="writer") {
        let text=request["messages"].to_string();assert!(text.contains("left-marker") && text.contains("right-marker"));
    }
    assert_cas_and_waves(&f);
    let replay=success(f.command(&mission).output().unwrap());assert_complete(&replay);
    assert_eq!(replay["replayed"],true);assert_eq!(replay["parallelism"]["waves_prepared"],0);
    assert_eq!(replay["parallelism"]["peak_active_step_workers"],0);
    for field in ["agents","usage","artifact","publication"] { assert_eq!(first[field],replay[field]); }
    assert_eq!(f.calls(),6);assert_cas_and_waves(&f);
}

fn assert_cas_and_waves(f:&Fixture) {
    let db=f.database();
    let (hash,bytes):(String,Vec<u8>)=db.query_row("SELECT a.hash,o.bytes FROM protocol_agentic_artifacts a
        JOIN protocol_gqwf_objects o ON o.store_id=a.store_id AND o.hash=a.hash WHERE a.agent_id='writer' AND a.name='draft'",
        [],|row|Ok((row.get(0)?,row.get(1)?))).unwrap();
    assert_eq!(bytes,fixture::TEXT.as_bytes());
    assert_eq!(genos_orchestrator::mission_protocols::raw_hash(&bytes),hash);
    let (waves,joined):(u64,u64)=db.query_row("SELECT COUNT(*),SUM(status='joined') FROM protocol_agentic_parallel_waves",
        [],|row|Ok((row.get(0)?,row.get(1)?))).unwrap();
    assert_eq!((waves,joined),(4,4));
    let members:u64=db.query_row("SELECT COUNT(*) FROM protocol_agentic_parallel_members",[],|row|row.get(0)).unwrap();
    assert_eq!(members,6);
}

#[test]
fn absent_parallel_option_keeps_the_same_three_agent_graph_sequential() {
    let _guard=fixture::serial();let f=Fixture::new((false,false));let mut config=f.config();
    config.as_object_mut().unwrap().remove("max_parallel_agents");f.write_config(config);
    let report=success(f.command(&identity()).output().unwrap());assert_complete(&report);
    assert_eq!(report["max_parallel_agents"],1);assert_eq!(report["parallelism"]["waves_prepared"],0);
    assert_eq!(report["parallelism"]["peak_active_step_workers"],0);assert_eq!(f.peak(),1);assert_eq!(f.calls(),6);
}

#[test]
fn invalid_parallel_width_is_refused_before_http_or_journal_creation() {
    let _guard=fixture::serial();let f=Fixture::new((false,false));
    for width in [0,4,5] {
        let mut config=f.config();config["max_parallel_agents"]=width.into();f.write_config(config);
        let output=f.command(&identity()).output().unwrap();assert!(!output.status.success());
        assert!(!f.database_path().exists());assert_eq!(f.calls(),0);
    }
}

#[test]
fn low_global_call_budget_narrows_a_later_wave_without_spending_the_reserve() {
    let _guard=fixture::serial();let f=Fixture::new((true,false));let mut config=f.config();
    config["limits"]["model_calls"]=4.into();f.write_config(config);let mission=identity();
    let report=unresolved(f.command(&mission).output().unwrap());
    assert_eq!(f.calls(),3);assert_eq!(f.peak(),2);assert_eq!(report["usage"]["spent"]["model_calls"],3);
    assert_eq!(report["usage"]["limits"]["model_calls"],4);assert_eq!(report["usage"]["protected"]["model_calls"],1);
    let db=f.database();let mut query=db.prepare("SELECT json_array_length(descriptor_json,'$.members') FROM protocol_agentic_parallel_waves ORDER BY rowid").unwrap();
    let widths:Vec<u64>=query.query_map([],|row|row.get(0)).unwrap().map(Result::unwrap).collect();
    assert_eq!(widths,vec![2,1]);drop(query);drop(db);
    let replay=unresolved(f.command(&mission).output().unwrap());
    assert_eq!(report["usage"],replay["usage"]);assert_eq!(f.calls(),3);
}

#[test]
fn missing_usage_joins_the_sibling_and_retains_exposure_without_redispatch_on_restart() {
    let _guard=fixture::serial();let f=Fixture::new((true,true));let mission=identity();
    let first=unresolved(f.command(&mission).output().unwrap());
    assert_eq!(f.calls(),2);assert_eq!(f.finished(),2);assert_eq!(f.peak(),2);
    assert_eq!(first["usage"]["unknown_operations"],1);assert!(first["usage"]["held"]["tokens"].as_u64().unwrap()>0);
    let replay=unresolved(f.command(&mission).output().unwrap());
    assert_eq!(first["usage"],replay["usage"]);assert_eq!(f.calls(),2);
    assert_eq!(replay["parallelism"]["waves_prepared"],0);
}

#[test]
fn stopped_wave_recovers_a_known_writer_after_real_tool_transaction_abort_without_resending_it() {
    let _guard=fixture::serial();let f=Fixture::new((true,false));let mission=identity();f.fail_writer_receipt();
    let first=unresolved(f.command(&mission).output().unwrap());assert_eq!(f.calls(),5);
    assert_eq!(first["usage"]["spent"]["model_calls"],5);
    let db=f.database();
    let drafts:u64=db.query_row("SELECT COUNT(*) FROM protocol_agentic_artifacts WHERE agent_id='writer'",[],|row|row.get(0)).unwrap();
    let stopped:u64=db.query_row("SELECT COUNT(*) FROM protocol_agentic_parallel_waves WHERE status='stopped'",[],|row|row.get(0)).unwrap();
    assert_eq!((drafts,stopped),(0,1));drop(db);f.allow_writer_receipt();
    let replay=success(f.command(&mission).output().unwrap());assert_complete(&replay);
    assert_eq!(f.calls(),6);assert_eq!(replay["parallelism"]["waves_prepared"],1);assert_cas_and_waves(&f);
}

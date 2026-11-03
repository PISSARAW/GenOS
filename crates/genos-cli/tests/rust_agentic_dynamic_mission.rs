#[path="helpers/rust_agentic_dynamic_fixture.rs"] mod fixture;
use fixture::{Fixture,success,unresolved};
use serde_json::Value;

fn identity()->String { uuid::Uuid::new_v4().to_string() }

fn assert_complete(report:&Value) {
    assert_eq!(report["artifact"]["text"],fixture::TEXT);
    assert_eq!(report["artifact_contract_verified"],true);
    assert_eq!(report["agents"].as_array().unwrap().len(),3);
    assert_eq!(report["usage"]["spent"]["model_calls"],7);
    assert_eq!(report["usage"]["spent"]["tokens"],280);
    assert_eq!(report["usage"]["spent"]["tool_calls"],5);
    assert_eq!(report["usage"]["unknown_operations"],0);
    assert_eq!(report["usage"]["released"],true);
    for field in ["semantic_truth_verified","promotable","external_effects_authorized"] { assert_eq!(report[field],false); }
    for protocol in ["CONTINUITY","MORPH","SYNAPSE","OMEGA","ALLOSTASIS","EVIDENCE","GQWF"] {
        assert!(report["protocols"].as_array().unwrap().iter().any(|value|value==protocol));
    }
}

#[test]
fn native_delegation_activates_only_selected_workers_and_replay_does_no_new_work() {
    let _guard=fixture::serial();let f=Fixture::new((true,false));let mission=identity();
    let first=success(f.command(&mission).output().unwrap());assert_complete(&first);
    assert_eq!(f.calls(),7);assert_eq!(f.finished(),7);assert_eq!(f.peak(),2);
    assert_eq!(first["parallelism"]["waves_prepared"],5);
    assert_eq!(first["parallelism"]["peak_active_step_workers"],2);
    let requests=f.requests();assert_eq!(fixture::agent_id(&requests[0]),"writer");
    assert!(requests.iter().all(|request|fixture::agent_id(request)!="idle"));
    for request in requests.iter().filter(|request|fixture::agent_id(request)!="writer") {
        let text=request["messages"].to_string();assert!(text.contains("Read notes.txt and return"));
    }
    for request in requests.iter().filter(|request|fixture::agent_id(request)=="writer").skip(1) {
        let text=request["messages"].to_string();assert!(text.contains("left-marker") && text.contains("right-marker"));
    }
    let replay=success(f.command(&mission).output().unwrap());assert_complete(&replay);
    assert_eq!(f.calls(),7);assert_eq!(replay["parallelism"]["waves_prepared"],0);
    for field in ["agents","usage","artifact","publication"] { assert_eq!(first[field],replay[field]); }
}

#[test]
fn invalid_dynamic_authority_is_refused_before_any_http_or_journal() {
    let _guard=fixture::serial();let f=Fixture::new((false,false));let original=f.config();
    let mut bad=original.clone();bad["max_parallel_agents"]=1.into();
    let mut worker_grant=original.clone();worker_grant["agents"][0]["tools"]=serde_json::json!(["delegate_task"]);
    let mut coordinator=original.clone();coordinator["orchestration"]["coordinator"]="left".into();
    let mut too_many=original.clone();too_many["orchestration"]["max_delegations"]=4.into();
    for config in [bad,worker_grant,coordinator,too_many] {
        f.write_config(config);let output=f.command(&identity()).output().unwrap();
        assert!(!output.status.success());assert_eq!(f.calls(),0);assert!(!f.database_path().exists());
    }
}

#[test]
fn missing_child_usage_retains_exposure_and_never_resumes_parent_or_redispatches() {
    let _guard=fixture::serial();let f=Fixture::new((true,true));let mission=identity();
    let first=unresolved(f.command(&mission).output().unwrap());
    assert_eq!(f.calls(),3);assert_eq!(f.finished(),3);assert_eq!(f.peak(),2);
    assert_eq!(first["usage"]["unknown_operations"],1);
    assert!(first["usage"]["held"]["tokens"].as_u64().unwrap()>0);
    let replay=unresolved(f.command(&mission).output().unwrap());
    assert_eq!(first["usage"],replay["usage"]);assert_eq!(f.calls(),3);
    assert_eq!(f.requests().iter().filter(|request|fixture::agent_id(request)=="writer").count(),1);
}

#[test]
fn aborted_delegation_receipt_rolls_back_activation_then_known_observation_recovers() {
    let _guard=fixture::serial();let f=Fixture::new((true,false));let mission=identity();
    f.fail_writer_receipt();let first=unresolved(f.command(&mission).output().unwrap());
    assert_eq!(f.calls(),1);assert_eq!(first["usage"]["spent"]["tool_calls"],0);
    let db=f.database();
    let activations:u64=db.query_row("SELECT COUNT(*) FROM rust_protocol_events WHERE protocol='MORPH' AND phase='AGENTIC_WORKER_ASSIGNED'",[],|row|row.get(0)).unwrap();
    assert_eq!(activations,0);drop(db);f.allow_writer_receipt();
    let resumed=success(f.command(&mission).output().unwrap());assert_complete(&resumed);
    assert_eq!(f.calls(),7);assert_eq!(resumed["replayed"],true);
    let db=f.database();
    let recovered:u64=db.query_row("SELECT COUNT(*) FROM rust_protocol_events WHERE phase='AGENTIC_WAVE_RECOVERED'",[],|row|row.get(0)).unwrap();
    assert_eq!(recovered,1);
}

#[test]
fn continuity_refuses_pending_delegates_despite_known_http_joined_waves_and_zero_held_budget() {
    use genos_orchestrator::mission_protocols::{Binding,Store,continuity::HandoffRequest};
    let _guard=fixture::serial();let f=Fixture::new((true,false));let mut config=f.config();
    config["agents"].as_array_mut().unwrap().remove(2);
    config["orchestration"]["max_delegations"]=2.into();config["limits"]["model_calls"]=4.into();
    f.write_config(config);let report=unresolved(f.command(&identity()).output().unwrap());
    assert_eq!(f.calls(),3);assert_eq!(report["usage"]["held"]["tokens"],0);
    assert_eq!(report["usage"]["held"]["model_calls"],0);assert_eq!(report["usage"]["unknown_operations"],0);
    let db=f.database();
    let open:u64=db.query_row("SELECT COUNT(*) FROM protocol_agentic_parallel_waves WHERE status!='joined'",[],|row|row.get(0)).unwrap();
    assert_eq!(open,0);drop(db);
    let binding:Binding=serde_json::from_value(report["binding"].clone()).unwrap();
    let mut store=Store::open(&f.database_path()).unwrap();
    let checkpoint=store.checkpoint(&binding,&serde_json::json!({"phase":"pending_delegates_without_exposure"})).unwrap();
    let successor=store.prepare_successor(&binding).unwrap();
    assert!(store.handoff(&binding,&HandoffRequest { successor:successor.clone(),checkpoint }).is_err());
    store.current(&binding).unwrap();assert!(store.current(&successor).is_err());
}

#[test]
fn coordinator_can_read_only_a_delegated_artifact_actually_received_before_its_current_turn() {
    let _guard=fixture::serial();let f=Fixture::new((true,false));f.enable_artifact_returns();
    let mission=identity();let report=success(f.command(&mission).output().unwrap());
    assert_eq!(f.calls(),8);assert_eq!(report["usage"]["spent"]["model_calls"],8);
    assert_eq!(report["usage"]["spent"]["tool_calls"],8);
    let db=f.database();
    let mut query=db.prepare("SELECT receipt_json FROM protocol_agentic_tool_receipts WHERE agent_id='writer' AND json_extract(receipt_json,'$.name')='read_artifact' ORDER BY turn").unwrap();
    let reads:Vec<Value>=query.query_map([],|row|row.get::<_,String>(0)).unwrap()
        .map(|row|serde_json::from_str(&row.unwrap()).unwrap()).collect();
    assert_eq!(reads.len(),2);assert_eq!(reads[0]["output"]["status"],"denied");
    assert_eq!(reads[1]["output"]["status"],"ok");assert_eq!(reads[1]["output"]["data"]["text"],"left-private-note");
    assert_eq!(reads[1]["objects"].as_array().unwrap().len(),1);drop(query);drop(db);
    let replay=success(f.command(&mission).output().unwrap());assert_eq!(f.calls(),8);
    for field in ["usage","publication","artifact"] { assert_eq!(report[field],replay[field]); }
}

#[test]
fn a_delegation_batch_denies_an_early_write_even_before_registration_then_accepts_a_later_retry() {
    let _guard=fixture::serial();let f=Fixture::new((true,false));f.enable_early_write();let mission=identity();
    let report=success(f.command(&mission).output().unwrap());
    assert_eq!(f.calls(),7);assert_eq!(report["usage"]["spent"]["tool_calls"],6);
    let db=f.database();
    let mut query=db.prepare("SELECT receipt_json FROM protocol_agentic_tool_receipts WHERE agent_id='writer' AND json_extract(receipt_json,'$.name')='write_artifact' ORDER BY turn").unwrap();
    let writes:Vec<Value>=query.query_map([],|row|row.get::<_,String>(0)).unwrap()
        .map(|row|serde_json::from_str(&row.unwrap()).unwrap()).collect();
    assert_eq!(writes.len(),2);assert_eq!(writes[0]["call_index"],0);
    assert_eq!(writes[0]["output"]["status"],"denied");
    assert_eq!(writes[0]["output"]["error"]["code"],"AGENTIC_DELEGATION_BATCH_REGISTRATION_ONLY");
    assert_eq!(writes[1]["output"]["status"],"ok");assert_eq!(writes[1]["key"]["turn"],1);
    let producer:String=db.query_row("SELECT producer_operation FROM protocol_agentic_artifacts WHERE agent_id='writer' AND name='draft'",[],|row|row.get(0)).unwrap();
    assert_eq!(producer,"tool/writer/1/0");drop(query);drop(db);
    let replay=success(f.command(&mission).output().unwrap());assert_eq!(f.calls(),7);
    assert_eq!(report["usage"],replay["usage"]);assert_eq!(report["publication"],replay["publication"]);
}

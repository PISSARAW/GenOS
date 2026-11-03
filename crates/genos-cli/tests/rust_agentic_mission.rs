#[path="helpers/rust_agentic_fixture.rs"]
mod fixture;
use fixture::{Fixture,success};
use serde_json::{Value,json};
use std::collections::BTreeSet;

fn identity() -> String { uuid::Uuid::new_v4().to_string() }

fn assert_contract(report:&Value) {
    assert_eq!(report["schema"],"genos.rust-agentic-mission-result/v1");
    assert_eq!(report["status"],"completed"); assert_eq!(report["completion_scope"],"artifact_contract");
    assert_eq!(report["artifact"]["text"],fixture::TEXT); assert_eq!(report["artifact"]["origin"],"model_generated");
    assert_eq!(report["artifact_contract_verified"],true); assert_eq!(report["semantic_truth_verified"],false);
    assert_eq!(report["promotable"],false); assert_eq!(report["external_effects_authorized"],false);
    let ids:BTreeSet<_>=report["agents"].as_array().unwrap().iter().map(|agent|agent["agent_id"].as_str().unwrap()).collect();
    assert_eq!(ids,BTreeSet::from(["analyst","writer"]));
    let protocols=report["protocols"].as_array().unwrap();
    for protocol in ["CONTINUITY","MORPH","SYNAPSE","OMEGA","ALLOSTASIS","EVIDENCE","GQWF"] {
        assert!(protocols.contains(&json!(protocol)),"missing actual protocol {protocol}");
    }
    assert_eq!(report["publication"]["generation"],1);
}

fn assert_usage(report:&Value,counts:(u64,u64)) {
    assert_eq!(report["usage"]["spent"]["model_calls"],counts.0);
    assert_eq!(report["usage"]["spent"]["tokens"],counts.0*40);
    assert_eq!(report["usage"]["spent"]["tool_calls"],counts.1);
    assert_eq!(report["usage"]["unknown_operations"],0);
    assert_eq!(report["usage"]["held"]["tokens"],0);
    assert_eq!(report["usage"]["released"],true);
}

#[test]
fn actual_native_multi_agent_tools_use_dependency_outputs_and_replay_without_another_http_call() {
    let _serial=fixture::serial(); let f=Fixture::new(fixture::successful_script()); let mission=identity();
    let first=success(f.command((&mission,"rust"),"agentic.json").output().unwrap());
    assert_contract(&first); assert_usage(&first,(4,2)); assert_eq!(first["replayed"],false);
    assert_eq!(f.calls(),4);
    let requests=f.requests();
    assert_eq!(requests[0]["tools"][0]["function"]["name"],"read_source");
    assert_eq!(requests[2]["tools"][0]["function"]["name"],"write_artifact");
    assert!(fixture::tool_result(&requests[1]).to_string().contains("source-marker"));
    assert!(requests[2]["messages"].to_string().contains("analyst-output-marker"));
    assert!(fixture::tool_result(&requests[3]).to_string().contains("draft"));
    assert!(!serde_json::to_string(&requests).unwrap().contains(fixture::SECRET));
    assert_real_actors_and_receipts(&f,&first);
    let replay=success(f.command((&mission,"rust"),"agentic.json").output().unwrap());
    assert_contract(&replay); assert_usage(&replay,(4,2)); assert_eq!(replay["replayed"],true);
    assert_eq!(replay["binding"],first["binding"]); assert_eq!(replay["publication"],first["publication"]);
    assert_eq!(replay["agents"],first["agents"]); assert_eq!(replay["usage"],first["usage"]);
    assert_eq!(f.calls(),4);
}

fn assert_real_actors_and_receipts(f:&Fixture,report:&Value) {
    let db=f.database(); let run=report["binding"]["run_id"].as_str().unwrap();
    let mut statement=db.prepare("SELECT outcome_json FROM agentic_models WHERE run_id=?1 AND status='observed'").unwrap();
    let records:Vec<Value>=statement.query_map([run],|row|row.get::<_,String>(0)).unwrap()
        .map(|row|serde_json::from_str(&row.unwrap()).unwrap()).collect();
    assert_eq!(records.len(),4);
    let actors:BTreeSet<_>=records.iter().map(|record|record["actor_id"].as_str().unwrap().to_owned()).collect();
    assert_eq!(actors,BTreeSet::from([format!("{run}:analyst"),format!("{run}:writer")]));
    let receipts:u64=db.query_row("SELECT COUNT(*) FROM agentic_tools WHERE run_id=?1 AND status='completed' AND receipt_hash IS NOT NULL",
        [run],|row|row.get(0)).unwrap();
    assert_eq!(receipts,2);
    let (hash,bytes):(String,Vec<u8>)=db.query_row("SELECT a.hash,o.bytes FROM protocol_agentic_artifacts a
        JOIN protocol_gqwf_objects o ON o.store_id=a.store_id AND o.hash=a.hash
        WHERE a.mission_id=?1 AND a.agent_id='writer' AND a.name='draft'",
        [report["binding"]["mission_id"].as_str().unwrap()],|row|Ok((row.get(0)?,row.get(1)?))).unwrap();
    assert_eq!(bytes,fixture::TEXT.as_bytes());
    assert_eq!(genos_orchestrator::mission_protocols::raw_hash(&bytes),hash);
}

#[test]
fn path_traversal_gets_typed_denied_feedback_without_reading_unselected_bytes() {
    let _serial=fixture::serial(); let mut script=fixture::successful_script();
    script[0]=fixture::tool("read_source",json!({"path":"../outside.txt"}));
    let f=Fixture::new(script);
    let report=success(f.command((&identity(),"rust"),"agentic.json").output().unwrap());
    assert_contract(&report); assert_eq!(f.calls(),4);
    let requests=f.requests(); let result=fixture::tool_result(&requests[1]);
    assert_eq!(result["status"],"denied");
    assert!(!serde_json::to_string(&requests).unwrap().contains(fixture::SECRET));
    assert_eq!(std::fs::read_to_string(f.directory.path().join("outside.txt")).unwrap(),fixture::SECRET);
}

#[test]
fn unconfigured_tool_response_is_refused_without_an_effect_or_fake_completion() {
    let _serial=fixture::serial();
    let f=Fixture::new(vec![fixture::tool("unconfigured_shell",json!({"command":"invented side effect"}))]);
    let report=fixture::unresolved(f.command((&identity(),"rust"),"agentic.json").output().unwrap());
    assert_eq!(f.calls(),1); assert_eq!(report["usage"]["spent"]["tool_calls"],0);
    assert_eq!(f.database().query_row("SELECT COUNT(*) FROM agentic_tools",[],|row|row.get::<_,u64>(0)).unwrap(),0);
    assert_eq!(f.database().query_row("SELECT COUNT(*) FROM rust_protocol_runs WHERE status='completed'",[],|row|row.get::<_,u64>(0)).unwrap(),0);
}

#[test]
fn json_prose_never_executes_a_tool_even_if_it_claims_success() {
    let _serial=fixture::serial();
    let prose=r#"PASS {"tool_calls":[{"function":{"name":"write_artifact","arguments":{"name":"draft","text":"fabricated"}}}]}"#;
    let f=Fixture::new(vec![fixture::completion(prose),fixture::completion(fixture::TEXT)]);
    let report=success(f.command((&identity(),"rust"),"agentic.json").output().unwrap());
    assert_contract(&report); assert_usage(&report,(2,0)); assert_eq!(f.calls(),2);
    assert_eq!(f.database().query_row("SELECT COUNT(*) FROM agentic_tools",[],|row|row.get::<_,u64>(0)).unwrap(),0);
    assert!(!f.requests()[1]["messages"].as_array().unwrap().iter().any(|message|message["role"]=="tool"));
}

#[test]
fn missing_usage_retains_exposure_and_blocks_tools_and_later_agents() {
    let _serial=fixture::serial(); let mut response=fixture::tool("read_source",json!({"path":"notes.txt"}));
    response.as_object_mut().unwrap().remove("eval_count");
    let f=Fixture::new(vec![response]);
    let report=fixture::unresolved(f.command((&identity(),"rust"),"agentic.json").output().unwrap());
    assert_eq!(f.calls(),1); assert_eq!(report["usage"]["spent"]["model_calls"],1);
    assert_eq!(report["usage"]["spent"]["tokens"],17); assert_eq!(report["usage"]["spent"]["tool_calls"],0);
    assert_eq!(report["usage"]["unknown_operations"],1); assert_eq!(report["usage"]["held"]["tokens"],2560);
    assert_eq!(report["usage"]["released"],false); assert!(report["agents"].as_array().unwrap().is_empty());
    assert_eq!(f.database().query_row("SELECT COUNT(*) FROM agentic_tools",[],|row|row.get::<_,u64>(0)).unwrap(),0);
}

#[test]
fn changed_source_refuses_replay_without_a_fifth_inference() {
    let _serial=fixture::serial(); let f=Fixture::new(fixture::successful_script()); let mission=identity();
    success(f.command((&mission,"rust"),"agentic.json").output().unwrap());
    std::fs::write(f.workspace.join("notes.txt"),"source changed after publication").unwrap();
    let output=f.command((&mission,"rust"),"agentic.json").output().unwrap();
    assert!(!output.status.success()); assert_eq!(f.calls(),4);
    assert_eq!(f.database().query_row("SELECT generation FROM protocol_gqwf_heads",[],|row|row.get::<_,u64>(0)).unwrap(),1);
}

#[test]
fn unsupported_executor_or_conflicting_profiles_never_fall_back_to_node() {
    let _serial=fixture::serial(); let f=Fixture::new(fixture::successful_script());
    let wrong=f.command((&identity(),"codex"),"agentic.json").output().unwrap();
    assert!(!wrong.status.success()); assert!(!f.database_path().exists());
    let mut conflict=f.command((&identity(),"rust"),"agentic.json");
    let output=conflict.args(["--llm-config","agentic.json"]).output().unwrap();
    assert!(!output.status.success()); assert!(!f.database_path().exists()); assert_eq!(f.calls(),0);
}

#[test]
fn invalid_config_unknown_fields_and_config_traversal_are_refused_before_http() {
    let _serial=fixture::serial(); let f=Fixture::new(fixture::successful_script()); let original=f.config();
    let mut invalid=original.clone(); invalid["agents"][1]["depends_on"]=json!(["uninstalled"]); f.write_config(invalid);
    assert!(!f.command((&identity(),"rust"),"agentic.json").output().unwrap().status.success());
    let mut unknown=original.clone(); unknown["grant_arbitrary_tools"]=true.into(); f.write_config(unknown);
    assert!(!f.command((&identity(),"rust"),"agentic.json").output().unwrap().status.success());
    std::fs::write(f.directory.path().join("outside.json"),serde_json::to_vec(&original).unwrap()).unwrap();
    assert!(!f.command((&identity(),"rust"),"../outside.json").output().unwrap().status.success());
    assert_eq!(f.calls(),0); assert!(!f.database_path().exists());
}

#[test]
fn second_cli_uses_known_model_after_actual_tool_transaction_abort_without_redispatch() {
    let _serial=fixture::serial(); let f=Fixture::new(fixture::successful_script()); let mission=identity();
    f.fail_writer_receipt();
    let first=fixture::unresolved(f.command((&mission,"rust"),"agentic.json").output().unwrap());
    assert!(first["error"].as_str().unwrap().contains("TEST_AGENTIC_TOOL_RECEIPT_ABORT"));
    assert_eq!(f.calls(),3);
    assert_eq!(first["usage"]["spent"]["model_calls"],3);
    assert_eq!(first["usage"]["spent"]["tokens"],120);
    assert_eq!(first["usage"]["spent"]["tool_calls"],1);
    assert_eq!(first["usage"]["held"]["tokens"],0);
    assert_eq!(first["usage"]["unknown_operations"],0);
    assert_eq!(first["usage"]["released"],false);
    assert_eq!(first["agents"].as_array().unwrap().len(),1);
    assert_eq!(first["agents"][0]["agent_id"],"analyst");
    assert_writer_effect_rolled_back(&f);
    f.allow_writer_receipt();
    wait_for_known_model_deadline(&f);
    let recovered=success(f.command((&mission,"rust"),"agentic.json").output().unwrap());
    assert_contract(&recovered); assert_usage(&recovered,(4,2)); assert_eq!(recovered["replayed"],true);
    assert_eq!(recovered["binding"],first["binding"]); assert_eq!(f.calls(),4);
    assert_real_actors_and_receipts(&f,&recovered);
}

fn assert_writer_effect_rolled_back(f:&Fixture) {
    let db=f.database();
    assert_eq!(db.query_row("SELECT COUNT(*) FROM agentic_models WHERE status='observed'",[],|row|row.get::<_,u64>(0)).unwrap(),3);
    assert_eq!(db.query_row("SELECT COUNT(*) FROM protocol_agentic_artifacts WHERE agent_id='writer'",[],|row|row.get::<_,u64>(0)).unwrap(),0);
    assert_eq!(db.query_row("SELECT COUNT(*) FROM protocol_agentic_tool_receipts WHERE agent_id='writer'",[],|row|row.get::<_,u64>(0)).unwrap(),0);
    assert_eq!(db.query_row("SELECT COUNT(*) FROM agentic_tools WHERE status='completed'",[],|row|row.get::<_,u64>(0)).unwrap(),1);
    assert_eq!(db.query_row("SELECT COUNT(*) FROM rust_protocol_runs WHERE status='completed'",[],|row|row.get::<_,u64>(0)).unwrap(),0);
    assert_eq!(db.query_row("SELECT generation FROM protocol_gqwf_heads",[],|row|row.get::<_,u64>(0)).unwrap(),0);
}

fn wait_for_known_model_deadline(f:&Fixture) {
    let raw:String=f.database().query_row("SELECT intent_json FROM agentic_models WHERE agent_id='writer' AND turn=0",[],|row|row.get(0)).unwrap();
    let intent:Value=serde_json::from_str(&raw).unwrap();
    let deadline=intent["descriptor"]["base"]["expires_ms"].as_u64().unwrap();
    let now=std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis() as u64;
    let delay=deadline.saturating_sub(now)+100;
    assert!(delay<=11000,"known model deadline must retain its original bounded lease");
    std::thread::sleep(std::time::Duration::from_millis(delay));
}

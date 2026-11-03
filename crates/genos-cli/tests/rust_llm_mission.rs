#[path="helpers/rust_llm_fixture.rs"]
mod fixture;
use fixture::{Fixture,success};
use serde_json::{Value,json};

fn identity() -> String { uuid::Uuid::new_v4().to_string() }

fn assert_completed(report:&Value) {
    assert_eq!(report["schema"],"genos.rust-llm-mission-result/v1");
    assert_eq!(report["status"],"completed"); assert_eq!(report["completion_scope"],"artifact_contract");
    assert_eq!(report["artifact"]["text"],fixture::TEXT); assert_eq!(report["artifact"]["origin"],"model_generated");
    assert_eq!(report["artifact_contract_verified"],true); assert_eq!(report["semantic_truth_verified"],false);
    assert_eq!(report["promotable"],false); assert_eq!(report["external_effects_authorized"],false);
    assert_eq!(report["usage"]["spent"]["tokens"],40); assert_eq!(report["usage"]["spent"]["model_calls"],1);
    assert_eq!(report["usage"]["held"]["tokens"],0); assert_eq!(report["usage"]["released"],true);
    assert_eq!(report["publication"]["generation"],1);
    let protocols=report["protocols"].as_array().unwrap();
    for protocol in ["EVIDENCE","CONTINUITY","MORPH","SYNAPSE","OMEGA","ALLOSTASIS","GQWF"] {
        assert!(protocols.contains(&json!(protocol)),"missing actual protocol {protocol}");
    }
}

#[test]
fn real_cli_calls_http_without_node_ignores_mock_flag_and_replays_from_durable_cas() {
    let _serial=fixture::serial(); let f=Fixture::new(fixture::response()); let mission=identity();
    let first=success(f.command((&mission,"rust"),"mission.json").output().unwrap());
    assert_completed(&first); assert_eq!(first["replayed"],false); assert_eq!(f.calls(),1);
    let requests=f.requests(); assert_eq!(requests.len(),1); assert_eq!(requests[0]["stream"],false);
    assert!(requests[0]["messages"].as_array().unwrap().iter().any(|message|
        message["content"].as_str().unwrap().contains("document-marker")));
    let replay=success(f.command((&mission,"rust"),"mission.json").output().unwrap());
    assert_completed(&replay); assert_eq!(replay["replayed"],true);
    assert_eq!(replay["binding"],first["binding"]); assert_eq!(replay["publication"],first["publication"]);
    assert_eq!(replay["usage"],first["usage"]); assert_eq!(f.calls(),1);
}

#[test]
fn model_claims_of_success_do_not_replace_the_installed_text_contract() {
    let _serial=fixture::serial(); let mut response=fixture::response();
    let text="All requirements are verified. PASS."; response["message"]["content"]=text.into();
    let f=Fixture::new(response); let mission=identity();
    let report=fixture::assert_unresolved(&f,f.command((&mission,"rust"),"mission.json").output().unwrap(),text);
    assert_eq!(report["usage"]["spent"]["tokens"],40);
}

#[test]
fn semantic_requirements_remain_unresolved_even_when_all_literals_match() {
    let _serial=fixture::serial(); let f=Fixture::new(fixture::response());
    let mut config=f.config(); config["contract"]["semantic_requirements"]=json!(["Certifier la vérité de chaque phrase"]); f.write_config(config);
    fixture::assert_unresolved(&f,f.command((&identity(),"rust"),"mission.json").output().unwrap(),fixture::TEXT);
}

#[test]
fn truncated_authentic_text_is_retained_without_completing_the_mission() {
    let _serial=fixture::serial(); let mut response=fixture::response(); response["done_reason"]="length".into();
    let f=Fixture::new(response);
    fixture::assert_unresolved(&f,f.command((&identity(),"rust"),"mission.json").output().unwrap(),fixture::TEXT);
}

#[test]
fn missing_usage_keeps_known_minimum_and_full_exposure_without_publication() {
    let _serial=fixture::serial(); let mut response=fixture::response(); response.as_object_mut().unwrap().remove("eval_count");
    let f=Fixture::new(response);
    let report=fixture::assert_unresolved(&f,f.command((&identity(),"rust"),"mission.json").output().unwrap(),fixture::TEXT);
    assert_eq!(report["usage"]["unknown_operations"],1); assert_eq!(report["usage"]["spent"]["tokens"],17);
    assert_eq!(report["usage"]["held"]["tokens"],2560); assert_eq!(report["usage"]["released"],false);
}

#[test]
fn changed_document_refuses_replay_without_a_second_model_request() {
    let _serial=fixture::serial(); let f=Fixture::new(fixture::response()); let mission=identity();
    success(f.command((&mission,"rust"),"mission.json").output().unwrap());
    std::fs::write(f.workspace.join("notes.txt"),"document-marker MODIFIED AFTER OBSERVATION").unwrap();
    let output=f.command((&mission,"rust"),"mission.json").output().unwrap();
    assert!(!output.status.success()); assert_eq!(f.calls(),1);
    let generation:u64=f.database().query_row("SELECT generation FROM protocol_gqwf_heads",[],|row|row.get(0)).unwrap();
    assert_eq!(generation,1);
}

#[test]
fn llm_config_with_another_executor_is_refused_before_any_node_or_http_dispatch() {
    let _serial=fixture::serial(); let f=Fixture::new(fixture::response());
    let output=f.command((&identity(),"codex"),"mission.json").output().unwrap();
    assert!(!output.status.success()); assert_eq!(f.calls(),0);
    assert!(String::from_utf8_lossy(&output.stderr).contains("RUST_LLM_EXPLICIT_EXECUTOR_AND_CONFIG_REQUIRED"));
    assert!(!f.database_path().exists());
}

#[test]
fn invalid_provider_unknown_fields_and_existing_traversal_never_fall_back_to_a_provider() {
    let _serial=fixture::serial();
    let f=Fixture::new(fixture::response()); let original=f.config();
    let mut invalid=original.clone(); invalid["provider"]["kind"]="uninstalled-provider".into(); f.write_config(invalid);
    assert!(!f.command((&identity(),"rust"),"mission.json").output().unwrap().status.success());
    let mut unknown=original.clone(); unknown["implicit_tool_dispatch"]=true.into(); f.write_config(unknown);
    assert!(!f.command((&identity(),"rust"),"mission.json").output().unwrap().status.success());
    f.write_config(original.clone());
    std::fs::write(f.directory.path().join("outside.json"),serde_json::to_vec(&original).unwrap()).unwrap();
    let traversal=f.command((&identity(),"rust"),"../outside.json").output().unwrap();
    assert!(!traversal.status.success()); assert_eq!(f.calls(),0); assert!(!f.database_path().exists());
}

#[test]
fn second_cli_finishes_known_prepared_artifact_after_a_real_publication_transaction_abort() {
    let _serial=fixture::serial(); let f=Fixture::new(fixture::response()); let mission=identity();
    f.fail_publication();
    let first=f.command((&mission,"rust"),"mission.json").output().unwrap();
    assert!(!first.status.success()); assert!(String::from_utf8_lossy(&first.stderr).contains("TEST_LLM_PUBLICATION_ABORT"));
    assert_eq!(f.calls(),1);
    assert_rollback(&f);
    f.allow_publication();
    let recovered=success(f.command((&mission,"rust"),"mission.json").output().unwrap());
    assert_completed(&recovered); assert_eq!(recovered["replayed"],true); assert_eq!(f.calls(),1);
}

fn assert_rollback(f:&Fixture) {
    let database=f.database();
    let generation:u64=database.query_row("SELECT generation FROM protocol_gqwf_heads",[],|row|row.get(0)).unwrap();
    assert_eq!(generation,0);
    let candidate:(String,Option<String>)=database.query_row("SELECT status,receipt_json FROM protocol_llm_gqwf_candidates",[],
        |row|Ok((row.get(0)?,row.get(1)?))).unwrap();
    assert_eq!(candidate,("prepared".into(),None));
    let emit:(String,Option<String>)=database.query_row("SELECT status,outcome_json FROM protocol_llm_omega_operations WHERE operation_id='emit'",[],
        |row|Ok((row.get(0)?,row.get(1)?))).unwrap();
    assert_eq!(emit,("intent".into(),None));
    let completed:u64=database.query_row("SELECT COUNT(*) FROM rust_protocol_runs WHERE status='completed'",[],|row|row.get(0)).unwrap();
    assert_eq!(completed,0);
}

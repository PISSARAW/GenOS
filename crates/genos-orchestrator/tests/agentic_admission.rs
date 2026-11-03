#![cfg(feature="native-llm")]
use genos_orchestrator::mission_protocols::{Store,agentic_source,agentic_spec,llm_source,raw_hash};
use serde_json::{Value,json};
use tempfile::TempDir;

fn config() -> Value {
    json!({"schema":"genos.rust-agentic-config/v1","provider":{"kind":"ollama","address":"127.0.0.1:11434","model":"fixture","generation":1},
        "generation":{"max_output_tokens":128,"temperature_milli":0},"documents":["notes.txt"],
        "agents":[{"id":"reader","instruction":"Read the selected source","tools":["read_source"],"max_turns":3},
            {"id":"author","instruction":"Use the reader output","depends_on":["reader"],"tools":["write_artifact"],"artifact_names":["draft"],"max_turns":3}],
        "contract":{"min_bytes":1,"max_bytes":4096,"required":["Sources"],"forbidden":[],"semantic_requirements":[]},
        "limits":{"tokens":10000,"model_calls":6,"tool_calls":6,"wall_ms":60000},"max_input_tokens":512,"turn_timeout_ms":10000})
}

fn fixture(configuration:Value) -> TempDir {
    let directory=TempDir::new().unwrap();
    std::fs::write(directory.path().join("notes.txt"),"A successful transport is not proof.").unwrap();
    std::fs::write(directory.path().join("agentic.json"),serde_json::to_vec(&configuration).unwrap()).unwrap();
    directory
}

fn specification(directory:&TempDir) -> agentic_spec::AgenticSpec {
    agentic_source::read(directory.path(),"agentic.json").unwrap().specification(llm_source::MissionIdentity {
        mission_id:uuid::Uuid::new_v4().to_string(),workspace:directory.path().into(),mission:"Produce a note".into(),
        timeout_ms:120000,env_hash:raw_hash(b"installed executable") }).unwrap()
}

#[test]
fn admitted_sources_and_graph_are_bound_and_the_identity_cannot_be_reused_as_another_profile() {
    let directory=fixture(config()); let spec=specification(&directory);
    let mut store=Store::open(&directory.path().join("ledger.sqlite")).unwrap();
    let binding=store.admit_agentic(&spec).unwrap();
    assert_eq!(store.agentic_spec(&binding).unwrap(),spec);
    assert_eq!(spec.source.config_path,"agentic.json");
    assert_eq!(spec.source.documents[0].hash,raw_hash(spec.source.documents[0].text.as_bytes()));
    assert!(store.admit_agentic(&spec).is_err());
    assert!(store.llm_spec(&binding).is_err());
}

#[test]
fn forward_edges_duplicate_agents_and_unconsumed_agents_are_refused_before_admission() {
    let mut forward=config(); forward["agents"][0]["depends_on"]=json!(["author"]);
    assert!(serde_json::from_value::<agentic_spec::AgenticConfig>(forward).unwrap().validate().is_err());
    let mut duplicate=config(); duplicate["agents"][1]["id"]="reader".into();
    assert!(serde_json::from_value::<agentic_spec::AgenticConfig>(duplicate).unwrap().validate().is_err());
    let mut orphan=config();
    orphan["agents"].as_array_mut().unwrap().push(json!({"id":"final","instruction":"Finish","depends_on":["reader"],"max_turns":1}));
    assert!(serde_json::from_value::<agentic_spec::AgenticConfig>(orphan).unwrap().validate().is_err());
}

#[test]
fn private_paths_and_traversal_are_not_sources_even_when_the_files_exist() {
    let directory=fixture(config());
    std::fs::write(directory.path().join(".env"),"private marker").unwrap();
    let mut private=config(); private["documents"]=json!([".env"]);
    std::fs::write(directory.path().join("private.json"),serde_json::to_vec(&private).unwrap()).unwrap();
    assert!(agentic_source::read(directory.path(),"private.json").is_err());
    assert!(agentic_source::read(directory.path(),"./agentic.json").is_err());
    assert!(agentic_source::read(directory.path(),"../agentic.json").is_err());
    assert!(agentic_source::selected(".git./config").is_err());
    assert!(agentic_source::selected("folder /notes.txt").is_err());
}

#[test]
fn forged_snapshot_or_configuration_is_rejected_by_durable_admission() {
    let directory=fixture(config()); let spec=specification(&directory);
    let mut store=Store::open(&directory.path().join("ledger.sqlite")).unwrap();
    let mut text=spec.clone(); text.source.documents[0].text="forged source".into();
    assert!(store.admit_agentic(&text).is_err());
    let mut grants=spec.clone(); grants.config.agents[0].tools.push(agentic_spec::ToolKind::WriteArtifact);
    assert!(store.admit_agentic(&grants).is_err());
    assert!(store.binding(&spec.mission_id).is_err());
}

#[test]
fn provider_and_protected_quota_are_validated_before_any_runtime_effect() {
    let mut provider=config(); provider["provider"]["address"]="192.0.2.1:11434".into();
    assert!(serde_json::from_value::<agentic_spec::AgenticConfig>(provider).unwrap().validate().is_err());
    let mut quota=config(); quota["limits"]["model_calls"]=2.into();
    assert!(serde_json::from_value::<agentic_spec::AgenticConfig>(quota).unwrap().validate().is_err());
    let mut unknown=config(); unknown["implicit_shell_authority"]=true.into();
    assert!(serde_json::from_value::<agentic_spec::AgenticConfig>(unknown).is_err());
}

#[test]
fn successor_inherits_the_same_admitted_graph_and_source_bytes() {
    let directory=fixture(config()); let spec=specification(&directory);
    let mut store=Store::open(&directory.path().join("ledger.sqlite")).unwrap();
    let prior=store.admit_agentic(&spec).unwrap();
    let successor=store.prepare_successor(&prior).unwrap();
    assert_eq!(successor.request_hash,prior.request_hash);
    assert_eq!(store.agentic_spec(&successor).unwrap(),spec);
    assert!(store.current(&successor).is_err());
    assert!(store.current(&prior).is_ok());
}

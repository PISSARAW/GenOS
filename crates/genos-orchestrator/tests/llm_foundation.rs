#![cfg(feature="native-llm")]
use genos_orchestrator::mission_protocols::{self as protocols, Binding, Store, WorkerRole, digest, raw_hash};
use protocols::{llm_allostasis, llm_contract::TextContract, llm_omega, llm_roles, llm_source, llm_spec, llm_synapse};
use genos_api::native_inference::{Generation, ProviderConfig};
use serde_json::json;
use tempfile::TempDir;

fn configuration() -> llm_source::LlmConfig {
    llm_source::LlmConfig { schema:"genos.rust-llm-config/v1".into(),
        provider:ProviderConfig::Ollama { address:"127.0.0.1:11434".parse().unwrap(),model:"selected-model".into(),generation:1 },
        generation:Generation { max_output_tokens:256,temperature_milli:0 },messages:Vec::new(),documents:vec!["notes.txt".into()],
        contract:TextContract { min_bytes:1,max_bytes:4096,required:Vec::new(),forbidden:Vec::new(),semantic_requirements:Vec::new() },
        limits:llm_allostasis::Limits { tokens:8192,model_calls:2,wall_ms:20000 },max_input_tokens:1024 }
}

fn files(config: &llm_source::LlmConfig) -> TempDir {
    let directory=TempDir::new().unwrap();
    std::fs::write(directory.path().join("mission.json"),serde_json::to_vec(config).unwrap()).unwrap();
    std::fs::write(directory.path().join("notes.txt"),"Une source textuelle réellement sélectionnée.").unwrap();
    directory
}

fn specification(directory: &TempDir) -> llm_spec::LlmRunSpec {
    llm_source::read(directory.path(),"mission.json").unwrap().specification(identity(directory)).unwrap()
}

fn identity(directory: &TempDir) -> llm_source::MissionIdentity {
    llm_source::MissionIdentity { mission_id:uuid::Uuid::new_v4().to_string(),workspace:directory.path().into(),
        mission:"Rédiger une note sourcée avec ses limites".into(),timeout_ms:30000,
        env_hash:raw_hash(b"installed-native-runtime-test") }
}

#[test]
fn selected_real_documents_and_mission_form_the_admitted_effective_context() {
    let directory=files(&configuration());
    let source=llm_source::read(directory.path(),"mission.json").unwrap();
    assert_eq!(source.source_hash,raw_hash(&source.bytes));
    assert_eq!(source.data.documents[0].hash,raw_hash(source.data.documents[0].text.as_bytes()));
    let spec=source.specification(identity(&directory)).unwrap();
    assert!(spec.messages.iter().any(|message|message.content.contains("réellement sélectionnée")));
    assert_eq!(spec.messages.last().unwrap().content,spec.mission);
    let mut store=Store::open(&directory.path().join("runtime.sqlite")).unwrap();
    let binding=store.admit_llm(&spec).unwrap();
    assert_eq!(binding.request_hash,digest(&spec).unwrap());
    assert_eq!(binding.policy_hash,raw_hash(llm_spec::POLICY));
    assert_eq!(digest(&store.llm_spec(&binding).unwrap()).unwrap(),digest(&spec).unwrap());
    assert!(store.admit_llm(&spec).is_err());
}

#[test]
fn private_metadata_traversal_and_unknown_configuration_are_refused() {
    let mut config=configuration();
    config.documents=vec![".env".into()];
    let directory=files(&config);
    assert!(llm_source::read(directory.path(),"mission.json").is_err());
    assert!(llm_source::read(directory.path(),"../mission.json").is_err());
    let mut value=serde_json::to_value(configuration()).unwrap();
    value["api_key"]=json!("must-never-be-accepted-or-journaled");
    std::fs::write(directory.path().join("mission.json"),serde_json::to_vec(&value).unwrap()).unwrap();
    assert!(llm_source::read(directory.path(),"mission.json").is_err());
    assert!(!directory.path().join(".genos-native").exists());
}

#[test]
fn unsupported_route_and_amplified_budget_are_rejected_before_admission() {
    let mut config=configuration();
    config.provider=ProviderConfig::Ollama { address:"192.0.2.1:11434".parse().unwrap(),model:"selected-model".into(),generation:1 };
    let directory=files(&config);
    let source=llm_source::read(directory.path(),"mission.json").unwrap();
    assert!(source.specification(identity(&directory)).is_err());
    drop(source);
    config=configuration(); config.limits.tokens=100;
    std::fs::write(directory.path().join("mission.json"),serde_json::to_vec(&config).unwrap()).unwrap();
    assert!(llm_source::read(directory.path(),"mission.json").unwrap().specification(identity(&directory)).is_err());
    assert!(!directory.path().join(".genos-native").exists());
}

#[test]
fn llm_succession_preserves_the_exact_admission_and_fences_old_sql_effects() {
    let directory=files(&configuration());
    let spec=specification(&directory);
    let path=directory.path().join("runtime.sqlite");
    let mut store=Store::open(&path).unwrap();
    let old=store.admit_llm(&spec).unwrap();
    let checkpoint=store.checkpoint(&old,&json!({"provider_state_recoverable":false})).unwrap();
    let next=store.prepare_successor(&old).unwrap();
    assert!(store.current(&next).is_err());
    store.handoff(&old,&protocols::continuity::HandoffRequest { successor:next.clone(),checkpoint }).unwrap();
    drop(store);
    let mut reopened=Store::open(&path).unwrap();
    assert_eq!(digest(&reopened.llm_spec(&next).unwrap()).unwrap(),digest(&spec).unwrap());
    let stale=reopened.transaction(&old,|tx| { tx.execute_batch("CREATE TABLE forbidden_effect(value INTEGER)")
        .map_err(|error|error.to_string()) });
    assert!(stale.is_err());
    assert_eq!(reopened.binding(&spec.mission_id).unwrap().generation,2);
    reopened.current(&next).unwrap();
}

#[test]
fn morph_installs_actual_role_methods_and_rejects_a_changed_method() {
    let directory=files(&configuration());
    let spec=specification(&directory);
    let path=directory.path().join("runtime.sqlite");
    let mut store=Store::open(&path).unwrap();
    let binding=store.admit_llm(&spec).unwrap();
    let roster=llm_roles::install(&mut store,&binding).unwrap();
    assert_ne!(roster.member("producer").unwrap().actor_id,roster.member("verifier_a").unwrap().actor_id);
    let connection=rusqlite::Connection::open(path).unwrap();
    connection.execute("UPDATE protocol_llm_installed_methods SET method_json=json_set(method_json,'$.method_id','arbitrary_shell') WHERE role='producer'",[]).unwrap();
    assert!(llm_roles::install(&mut store,&binding).is_err());
}

#[test]
fn exposed_inference_survives_reopen_and_blocks_handoff_or_automatic_redispatch() {
    let directory=files(&configuration());
    let source=llm_source::read(directory.path(),"mission.json").unwrap();
    let spec=source.specification(identity(&directory)).unwrap();
    let path=directory.path().join("runtime.sqlite");
    let mut store=Store::open(&path).unwrap();
    let binding=store.admit_llm(&spec).unwrap();
    protocols::llm_gqwf::initialize(&mut store,&binding).unwrap();
    llm_roles::install(&mut store,&binding).unwrap();
    llm_allostasis::reserve(&mut store,&binding,&spec.limits).unwrap();
    llm_omega::record_source(&mut store,&binding,&source.bytes).unwrap();
    let request=pending_request(&mut store,&binding,&spec);
    let first=llm_omega::begin(&mut store,&binding,llm_omega::InferenceIntent { request:&request,max_wall_ms:10000 }).unwrap();
    assert!(matches!(first,llm_omega::DispatchAdmission::Fresh(_)));
    drop(first); drop(store);
    let mut store=Store::open(&path).unwrap();
    let second=llm_omega::begin(&mut store,&binding,llm_omega::InferenceIntent { request:&request,max_wall_ms:10000 }).unwrap();
    assert!(matches!(second,llm_omega::DispatchAdmission::Unknown));
    let checkpoint=store.checkpoint(&binding,&json!({"phase":"model_outcome_unknown"})).unwrap();
    let successor=store.prepare_successor(&binding).unwrap();
    assert!(store.handoff(&binding,&protocols::continuity::HandoffRequest { successor,checkpoint }).is_err());
    let resources=llm_allostasis::state(&mut store,&binding).unwrap();
    assert_eq!(resources.spent.model_calls,0);
    assert_eq!(resources.held.model_calls,1);
    assert!(resources.held.tokens>0);
    assert!(resources.unknown_operations>0);
}

fn pending_request(store:&mut Store, binding:&Binding, spec:&llm_spec::LlmRunSpec) -> genos_api::native_inference::InferenceRequest {
    let intent=llm_synapse::RequestIntent { operation_id:"infer".into(),provider:spec.provider.clone(),generation:spec.generation.clone(),
        messages:spec.messages.clone(),max_input_tokens:spec.max_input_tokens,expires_ms:protocols::now_ms()+5000 };
    let context=llm_synapse::apply(store,binding,&llm_synapse::ContextInput {
        payload:serde_json::to_value(intent).unwrap(),source_hash:spec.source_hash.clone(),contract_hash:digest(&spec.contract).unwrap(),
        world_hash:raw_hash(b"null"),world_generation:0,role:WorkerRole::Producer,base_generation:0 }).unwrap();
    llm_synapse::request(binding,&context).unwrap()
}

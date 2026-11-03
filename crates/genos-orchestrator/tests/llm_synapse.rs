#![cfg(feature="native-llm")]
use genos_orchestrator::mission_protocols::{Binding, Store, WorkerRole, digest, raw_hash};
use genos_orchestrator::mission_protocols::{llm_allostasis::Limits,llm_contract::TextContract,llm_spec::LlmRunSpec,llm_synapse};
use genos_api::native_inference::{Generation, Message, ProviderConfig, Role};
use rusqlite::params;
use serde_json::json;
use tempfile::TempDir;

fn fixture() -> (TempDir, Store, Binding, llm_synapse::ContextInput) {
    let directory = TempDir::new().unwrap();
    let mut store = Store::open(&directory.path().join("protocols.sqlite")).unwrap();
    let spec = LlmRunSpec {
        schema:"genos.rust-llm-mission/v1".into(),mission_id:uuid::Uuid::new_v4().to_string(),
        workspace:directory.path().into(),mission:"Rédiger une note avec ses limites".into(),
        config_path:"mission.json".into(),config_hash:raw_hash(b"configuration locale"),
        source_hash:raw_hash(b"source documentaire"),provider:ProviderConfig::Ollama {
            address:"127.0.0.1:9".parse().unwrap(),model:"explicit-model".into(),generation:1 },
        generation:Generation { max_output_tokens:256,temperature_milli:0 },
        messages:vec![Message { role:Role::User,content:"Rédiger une note avec ses limites".into() }],
        contract:TextContract { min_bytes:1,max_bytes:4096,required:vec!["Limites".into()],
            forbidden:Vec::new(),semantic_requirements:Vec::new() },
        limits:Limits { tokens:10000,model_calls:4,wall_ms:30000 },max_input_tokens:512,
        timeout_ms:60000,env_hash:raw_hash(b"native installed executable"),
    };
    let binding = store.admit_llm(&spec).unwrap();
    let intent = llm_synapse::RequestIntent { operation_id:"infer".into(),provider:spec.provider,
        generation:spec.generation,messages:spec.messages,max_input_tokens:spec.max_input_tokens,
        expires_ms:binding.expires_ms-1000 };
    let input = llm_synapse::ContextInput { payload:serde_json::to_value(intent).unwrap(),
        source_hash:spec.source_hash,contract_hash:digest(&spec.contract).unwrap(),
        world_hash:raw_hash(b"null"),world_generation:0,role:WorkerRole::Producer,base_generation:0 };
    (directory, store, binding, input)
}

#[test]
fn applied_context_is_the_request_input_without_a_hash_cycle() {
    let (_directory, mut store, binding, input) = fixture();
    let applied = llm_synapse::apply(&mut store, &binding, &input).unwrap();
    let read = llm_synapse::read(&store, &binding, WorkerRole::Producer).unwrap();
    let request = llm_synapse::request(&binding, &read).unwrap();
    assert_eq!(request.input_hash, digest(&input.payload).unwrap());
    assert_eq!(request.context_hash, applied.context_hash);
    assert_eq!(request.actor_id, format!("{}:producer",binding.run_id));
    assert_eq!(request.messages[0].content, "Rédiger une note avec ses limites");
    assert!(request.credential.is_none());
}

#[test]
fn stale_base_preserves_the_previous_document_and_requests_canonical_data() {
    let (directory, mut store, binding, mut input) = fixture();
    let previous = llm_synapse::apply(&mut store, &binding, &input).unwrap();
    input.payload["messages"][0]["content"] = "Autre mission".into();
    assert!(llm_synapse::apply(&mut store, &binding, &input).unwrap_err().contains("BASE_STALE"));
    assert_eq!(llm_synapse::read(&store, &binding, WorkerRole::Producer).unwrap().context_hash, previous.context_hash);
    let connection = rusqlite::Connection::open(directory.path().join("protocols.sqlite")).unwrap();
    let count:u64 = connection.query_row("SELECT count(*) FROM rust_protocol_events
        WHERE run_id=?1 AND phase='REQUEST_MISSING'",[&binding.run_id],|row|row.get(0)).unwrap();
    assert_eq!(count,1);
}

#[test]
fn audience_or_schema_tampering_fails_closed() {
    let (directory, mut store, binding, input) = fixture();
    let applied = llm_synapse::apply(&mut store, &binding, &input).unwrap();
    let connection = rusqlite::Connection::open(directory.path().join("protocols.sqlite")).unwrap();
    for field in ["schema","audience"] {
        let mut value = serde_json::to_value(&applied).unwrap();
        value[field] = "uninstalled".into();
        connection.execute("UPDATE rust_llm_synapse SET context_json=?1 WHERE run_id=?2",
            params![serde_json::to_string(&value).unwrap(),binding.run_id]).unwrap();
        assert!(llm_synapse::read(&store,&binding,WorkerRole::Producer).is_err());
    }
}

#[test]
fn canonical_context_cannot_extend_native_authority() {
    let (_directory, mut store, binding, input) = fixture();
    llm_synapse::apply(&mut store,&binding,&input).unwrap();
    let mut forged = binding.clone();
    forged.policy_hash = raw_hash(b"arbitrary network and file access");
    assert!(llm_synapse::read(&store,&forged,WorkerRole::Producer).is_err());
    assert!(llm_synapse::apply(&mut store,&forged,&input).is_err());
}

#[test]
fn changed_cas_base_changes_the_commitment_even_when_messages_are_identical() {
    let (_directory, mut store, binding, mut input) = fixture();
    let previous = llm_synapse::apply(&mut store,&binding,&input).unwrap();
    input.base_generation=1;
    input.world_hash=raw_hash(b"different exact world");
    input.world_generation=1;
    let next = llm_synapse::apply(&mut store,&binding,&input).unwrap();
    assert_eq!(previous.input_hash,next.input_hash);
    assert_ne!(previous.context_hash,next.context_hash);
}

#[test]
fn verifier_candidate_is_bound_to_its_context_and_exact_contract() {
    let (_directory, mut store, binding, mut input) = fixture();
    input.role=WorkerRole::VerifierA;
    let contract=TextContract { min_bytes:1,max_bytes:4096,required:vec!["Limites".into()],
        forbidden:Vec::new(),semantic_requirements:Vec::new() };
    input.payload=json!({"request":input.payload,"candidate":"Limites : texte déclaré","contract":contract});
    let previous = llm_synapse::apply(&mut store,&binding,&input).unwrap();
    input.base_generation=1;
    input.payload["candidate"]="autre texte".into();
    let next=llm_synapse::apply(&mut store,&binding,&input).unwrap();
    assert_ne!(previous.context_hash,next.context_hash);
    assert!(llm_synapse::request(&binding,&next).is_err());
}

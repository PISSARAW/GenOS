use genos_orchestrator::mission_protocols::{self as protocols, Binding, Store, WorkerRole, digest, raw_hash};
use protocols::{llm_allostasis, llm_contract::TextContract, llm_omega, llm_roles, llm_source, llm_spec::LlmRunSpec, llm_synapse};
use genos_api::native_inference::{Generation, ModelObservation, ProviderConfig};
use serde_json::json;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::{Arc, atomic::{AtomicUsize, Ordering}};
use tempfile::TempDir;

pub struct Fixture {
    pub source: llm_source::SourceBundle,
    pub store: Store,
    pub binding: Binding,
    pub spec: LlmRunSpec,
    pub observation: ModelObservation,
    pub requests: Arc<AtomicUsize>,
    pub directory: TempDir,
}

pub fn contract() -> TextContract {
    TextContract { min_bytes:8,max_bytes:4096,required:vec!["Sources".into(),"Limites".into()],
        forbidden:vec!["secret divulgué".into()],semantic_requirements:Vec::new() }
}

pub fn create(contract: TextContract, text: &str) -> Fixture { create_with_finish(contract, text, "stop") }

pub fn create_with_finish(contract: TextContract, text: &str, finish: &str) -> Fixture {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let directory = TempDir::new().unwrap();
    write_sources(&directory, (&listener, contract));
    let source = llm_source::read(directory.path(), "mission.json").unwrap();
    let spec = source.specification(llm_source::MissionIdentity {
        mission_id:uuid::Uuid::new_v4().to_string(),workspace:directory.path().into(),
        mission:"Rédiger une note documentaire en distinguant les limites".into(),timeout_ms:60000,
        env_hash:raw_hash(b"installed-rust-test-harness"),
    }).unwrap();
    let mut store = Store::open(&directory.path().join("protocols.sqlite")).unwrap();
    let binding = store.admit_llm(&spec).unwrap();
    llm_roles::install(&mut store,&binding).unwrap();
    llm_allostasis::reserve(&mut store,&binding,&spec.limits).unwrap();
    llm_omega::record_source(&mut store,&binding,&source.bytes).unwrap();
    let base=protocols::llm_gqwf::initialize(&mut store,&binding).unwrap();
    assert_eq!(base.root_hash,raw_hash(b"null"));
    assert_eq!(base.generation,0);
    let intent = intent(&binding,&spec);
    let applied = llm_synapse::apply(&mut store,&binding,&context(&spec,WorkerRole::Producer,
        serde_json::to_value(&intent).unwrap())).unwrap();
    let request = llm_synapse::request(&binding,&applied).unwrap();
    let permit = begin(&mut store,&binding,&request);
    let response = response(text, finish);
    let requests=Arc::new(AtomicUsize::new(0));
    let counter=requests.clone();
    let server = std::thread::spawn(move || serve(listener,&response,&counter));
    let observation = llm_omega::dispatch(&mut store,&binding,llm_omega::Dispatch { permit,request:&request }).unwrap();
    server.join().unwrap();
    llm_omega::observe(&mut store,&binding,&observation).unwrap();
    install_reviewers(&mut store,&binding,(&spec,&intent,&observation));
    Fixture { directory,store,binding,spec,observation,source,requests }
}

fn write_sources(directory: &TempDir, input: (&TcpListener, TextContract)) {
    let (listener, contract) = input;
    std::fs::write(directory.path().join("notes.txt"), "Document fourni : le projet conserve ses incertitudes.").unwrap();
    let config = llm_source::LlmConfig {
        schema:"genos.rust-llm-config/v1".into(),provider:ProviderConfig::Ollama {
            address:listener.local_addr().unwrap(),model:"fixture-text-model".into(),generation:1 },
        generation:Generation { max_output_tokens:512,temperature_milli:0 },messages:Vec::new(),
        documents:vec!["notes.txt".into()],contract,
        limits:llm_allostasis::Limits { tokens:20000,model_calls:4,wall_ms:30000 },max_input_tokens:2048,
    };
    std::fs::write(directory.path().join("mission.json"),serde_json::to_vec(&config).unwrap()).unwrap();
}

pub fn context(spec: &LlmRunSpec, role: WorkerRole, payload: serde_json::Value) -> llm_synapse::ContextInput {
    llm_synapse::ContextInput { payload,source_hash:spec.source_hash.clone(),contract_hash:digest(&spec.contract).unwrap(),
        world_hash:raw_hash(b"null"),world_generation:0,role,base_generation:0 }
}

fn intent(binding: &Binding, spec: &LlmRunSpec) -> llm_synapse::RequestIntent {
    llm_synapse::RequestIntent { operation_id:"infer".into(),provider:spec.provider.clone(),generation:spec.generation.clone(),
        messages:spec.messages.clone(),max_input_tokens:spec.max_input_tokens,
        expires_ms:protocols::now_ms().saturating_add(15000).min(binding.expires_ms) }
}

fn begin(store: &mut Store, binding: &Binding, request: &genos_api::native_inference::InferenceRequest) -> llm_omega::DispatchPermit {
    match llm_omega::begin(store,binding,llm_omega::InferenceIntent { request,max_wall_ms:20000 }).unwrap() {
        llm_omega::DispatchAdmission::Fresh(permit) => permit,
        _ => panic!("fresh fixture cannot reuse an inference"),
    }
}

fn install_reviewers(store: &mut Store, binding: &Binding, input: (&LlmRunSpec,&llm_synapse::RequestIntent,&ModelObservation)) {
    let (spec,intent,observation) = input;
    for role in [WorkerRole::VerifierA,WorkerRole::VerifierB] {
        let payload = llm_synapse::verifier_payload(intent,observation.text(),&spec.contract);
        llm_synapse::apply(store,binding,&context(spec,role,payload)).unwrap();
    }
}

fn response(text: &str, finish: &str) -> Vec<u8> {
    serde_json::to_vec(&json!({"model":"fixture-text-model","message":{"role":"assistant","content":text},
        "done":true,"done_reason":finish,"prompt_eval_count":17,"eval_count":23})).unwrap()
}

fn serve(listener: TcpListener, body: &[u8], counter: &AtomicUsize) {
    let (mut stream,_) = listener.accept().unwrap();
    stream.set_read_timeout(Some(std::time::Duration::from_secs(10))).unwrap();
    read_request(&mut stream);
    counter.fetch_add(1,Ordering::SeqCst);
    let headers = format!("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",body.len());
    stream.write_all(headers.as_bytes()).unwrap();
    stream.write_all(body).unwrap();
}

fn read_request(stream: &mut TcpStream) {
    let mut bytes = Vec::new();
    loop {
        let mut buffer = [0;4096];
        let size = stream.read(&mut buffer).unwrap();
        assert!(size > 0);
        bytes.extend_from_slice(&buffer[..size]);
        assert!(bytes.len() <= 262144);
        if full_request(&bytes) { return; }
    }
}

fn full_request(bytes: &[u8]) -> bool {
    let Some(end) = bytes.windows(4).position(|value| value == b"\r\n\r\n") else { return false; };
    let header = std::str::from_utf8(&bytes[..end]).unwrap();
    let length = header.lines().find_map(|line| {
        let (name,value) = line.split_once(':')?;
        name.eq_ignore_ascii_case("content-length").then(||value.trim().parse::<usize>().unwrap())
    }).unwrap();
    bytes.len() >= end+4+length
}

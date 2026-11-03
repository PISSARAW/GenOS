use genos_orchestrator::mission_protocols::{self as protocols,Binding,Store,WorkerRole,digest,raw_hash};
use protocols::{llm_allostasis,llm_contract::TextContract,llm_gqwf,llm_omega,llm_roles,llm_source,llm_spec::LlmRunSpec,llm_synapse};
use genos_api::native_inference::{Generation,InferenceRequest,ModelObservation,ProviderConfig};
use serde_json::{Value,json};
use std::io::{Read,Write};
use std::net::{TcpListener,TcpStream};
use tempfile::TempDir;

pub const TEXT: &str = "Sources : document fourni. Limites : assertions non certifiées.";

pub struct Pending {
    pub directory: TempDir, pub store: Store, pub binding: Binding, pub source: llm_source::SourceBundle,
    pub spec: LlmRunSpec, pub request: InferenceRequest, pub permit: Option<llm_omega::DispatchPermit>,
    pub listener: Option<TcpListener>, pub base: llm_gqwf::Head,
}

pub fn prepare() -> Pending {
    let directory = TempDir::new().unwrap();
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    write_sources(&directory,&listener);
    let source = llm_source::read(directory.path(),"mission.json").unwrap();
    let spec = source.specification(llm_source::MissionIdentity { mission_id:uuid::Uuid::new_v4().to_string(),
        workspace:directory.path().into(),mission:"Produire une note avec sources et limites".into(),
        timeout_ms:60000,env_hash:environment() }).unwrap();
    let mut store = Store::open(&directory.path().join("protocols.sqlite")).unwrap();
    let binding = store.admit_llm(&spec).unwrap();
    llm_roles::install(&mut store,&binding).unwrap();
    let base = llm_gqwf::initialize(&mut store,&binding).unwrap();
    llm_allostasis::reserve(&mut store,&binding,&spec.limits).unwrap();
    llm_omega::record_source(&mut store,&binding,&source.bytes).unwrap();
    let intent = llm_synapse::RequestIntent { operation_id:"infer".into(),provider:spec.provider.clone(),
        generation:spec.generation.clone(),messages:spec.messages.clone(),max_input_tokens:spec.max_input_tokens,
        expires_ms:(protocols::now_ms()+15000).min(binding.expires_ms) };
    let applied = llm_synapse::apply(&mut store,&binding,&context(&spec,WorkerRole::Producer,json!(intent))).unwrap();
    let request = llm_synapse::request(&binding,&applied).unwrap();
    let permit = match llm_omega::begin(&mut store,&binding,llm_omega::InferenceIntent { request:&request,max_wall_ms:20000 }).unwrap() {
        llm_omega::DispatchAdmission::Fresh(permit) => permit, _ => panic!("fixture needs one fresh native dispatch"),
    };
    Pending { directory,store,binding,source,spec,request,permit:Some(permit),listener:Some(listener),base }
}

fn environment() -> String {
    static HASH: std::sync::OnceLock<String> = std::sync::OnceLock::new();
    HASH.get_or_init(|| raw_hash(&std::fs::read(std::env::current_exe().unwrap()).unwrap())).clone()
}

fn write_sources(directory: &TempDir, listener: &TcpListener) {
    std::fs::write(directory.path().join("notes.txt"),"Source réelle de la fixture de transport local.").unwrap();
    let config = llm_source::LlmConfig { schema:"genos.rust-llm-config/v1".into(),
        provider:ProviderConfig::Ollama { address:listener.local_addr().unwrap(),model:"text-fixture".into(),generation:1 },
        generation:Generation { max_output_tokens:512,temperature_milli:0 },messages:Vec::new(),documents:vec!["notes.txt".into()],
        contract:TextContract { min_bytes:8,max_bytes:4096,required:vec!["Sources".into(),"Limites".into()],
            forbidden:Vec::new(),semantic_requirements:Vec::new() },
        limits:llm_allostasis::Limits { tokens:20000,model_calls:4,wall_ms:30000 },max_input_tokens:2048 };
    std::fs::write(directory.path().join("mission.json"),serde_json::to_vec(&config).unwrap()).unwrap();
}

pub fn response() -> Value {
    json!({"model":"text-fixture","message":{"role":"assistant","content":TEXT},"done":true,
        "done_reason":"stop","prompt_eval_count":17,"eval_count":23})
}

pub fn context(spec: &LlmRunSpec, role: WorkerRole, payload: Value) -> llm_synapse::ContextInput {
    llm_synapse::ContextInput { payload,source_hash:spec.source_hash.clone(),contract_hash:digest(&spec.contract).unwrap(),
        world_hash:raw_hash(b"null"),world_generation:0,role,base_generation:0 }
}

impl Pending {
    pub fn lose_response(&mut self) -> genos_api::native_inference::InferenceFailure {
        let listener = self.listener.take().unwrap();
        let thread = std::thread::spawn(move || {
            let (mut stream,_) = listener.accept().unwrap();
            stream.set_nonblocking(false).unwrap();
            stream.set_read_timeout(Some(std::time::Duration::from_secs(10))).unwrap();
            read_request(&mut stream);
        });
        let error = llm_omega::dispatch(&mut self.store,&self.binding,llm_omega::Dispatch {
            permit:self.permit.take().unwrap(),request:&self.request }).unwrap_err();
        thread.join().unwrap();
        match error { llm_omega::DispatchError::Transport(failure) => failure,
            _ => panic!("accepted HTTP request must have an ambiguous transport outcome") }
    }

    pub fn dispatch(&mut self, response: Value) -> Result<ModelObservation,llm_omega::DispatchError> {
        let listener = self.listener.take().unwrap();
        let thread = std::thread::spawn(move ||serve(listener,response));
        let outcome = llm_omega::dispatch(&mut self.store,&self.binding,llm_omega::Dispatch {
            permit:self.permit.take().unwrap(),request:&self.request });
        thread.join().unwrap();
        outcome
    }

    pub fn complete(&mut self, response: Value) -> ModelObservation {
        let observation = self.dispatch(response).unwrap();
        llm_omega::observe(&mut self.store,&self.binding,&observation).unwrap();
        let producer = llm_synapse::read(&self.store,&self.binding,WorkerRole::Producer).unwrap();
        let intent: llm_synapse::RequestIntent = serde_json::from_value(producer.payload).unwrap();
        for role in [WorkerRole::VerifierA,WorkerRole::VerifierB] {
            let payload = llm_synapse::verifier_payload(&intent,observation.text(),&self.spec.contract);
            llm_synapse::apply(&mut self.store,&self.binding,&context(&self.spec,role,payload)).unwrap();
        }
        observation
    }
}

fn serve(listener: TcpListener, response: Value) {
    let (mut stream,_) = listener.accept().unwrap();
    stream.set_nonblocking(false).unwrap();
    stream.set_read_timeout(Some(std::time::Duration::from_secs(10))).unwrap();
    read_request(&mut stream);
    let body = serde_json::to_vec(&response).unwrap();
    let header = format!("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",body.len());
    stream.write_all(header.as_bytes()).unwrap(); stream.write_all(&body).unwrap();
}

fn read_request(stream: &mut TcpStream) {
    let mut bytes = Vec::new();
    loop {
        let mut buffer = [0;4096]; let count = stream.read(&mut buffer).unwrap();
        assert!(count>0); bytes.extend_from_slice(&buffer[..count]); assert!(bytes.len()<=262144);
        if complete_request(&bytes) { return; }
    }
}

fn complete_request(bytes: &[u8]) -> bool {
    let Some(end)=bytes.windows(4).position(|value|value==b"\r\n\r\n") else { return false; };
    let header = std::str::from_utf8(&bytes[..end]).unwrap();
    let size = header.lines().find_map(|line| {
        let (name,value)=line.split_once(':')?;
        name.eq_ignore_ascii_case("content-length").then(||value.trim().parse::<usize>().unwrap())
    }).unwrap();
    bytes.len()>=end+4+size
}

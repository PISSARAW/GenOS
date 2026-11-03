use genos_orchestrator::mission_protocols::{self as protocols,Binding,Store,raw_hash};
use protocols::{agentic_ledger as ledger,agentic_spec::AgenticSpec,agentic_source,agentic_context,agentic_exchange,llm_source};
use genos_api::native_inference::ToolInferenceRequest;
use serde_json::{Value,json};
use std::io::{Read,Write};
use std::net::{TcpListener,TcpStream};
use std::sync::{Arc,atomic::{AtomicUsize,Ordering}};
use tempfile::TempDir;

pub struct Pending {
    pub source:agentic_source::SourceBundle,
    pub store:Store,
    pub binding:Binding,
    pub spec:AgenticSpec,
    pub key:ledger::StepKey,
    pub request:ToolInferenceRequest,
    pub permit:Option<ledger::ModelPermit>,
    pub listener:Option<TcpListener>,
    pub requests:Arc<AtomicUsize>,
    pub directory:TempDir,
}

pub fn prepare() -> Pending {
    let mut value=unprepared();value.prepare_permit();value
}

pub fn unprepared() -> Pending {
    with_timing((120000,20000))
}

pub fn with_timing(timing:(u64,u64)) -> Pending {
    let listener=TcpListener::bind("127.0.0.1:0").unwrap();
    listener.set_nonblocking(false).unwrap();
    let directory=TempDir::new().unwrap();
    write_sources(&directory,&listener,timing);
    let source=agentic_source::read(directory.path(),"agentic.json").unwrap();
    let spec=source.specification(llm_source::MissionIdentity { mission_id:uuid::Uuid::new_v4().to_string(),
        workspace:directory.path().into(),mission:"Produce a documented note with explicit limits".into(),
        timeout_ms:180000,env_hash:environment() }).unwrap();
    let mut store=Store::open(&directory.path().join("ledger.sqlite")).unwrap();
    let binding=store.admit_agentic(&spec).unwrap();
    ledger::initialize(&mut store,&binding).unwrap();
    agentic_exchange::initialize(&mut store,&binding).unwrap();
    agentic_exchange::receive(&mut store,&binding,"reader").unwrap();
    let key=ledger::StepKey { agent_id:"reader".into(),turn:0 };
    let request=agentic_context::prepare(&mut store,&binding,&key).unwrap();
    Pending { source,store,binding,spec,key,request,permit:None,listener:Some(listener),
        requests:Arc::new(AtomicUsize::new(0)),directory }
}

fn environment() -> String {
    static HASH:std::sync::OnceLock<String>=std::sync::OnceLock::new();
    HASH.get_or_init(||raw_hash(&std::fs::read(std::env::current_exe().unwrap()).unwrap())).clone()
}

fn write_sources(directory:&TempDir, listener:&TcpListener, timing:(u64,u64)) {
    std::fs::write(directory.path().join("notes.txt"),"A successful transport is not proof of semantic truth.").unwrap();
    let config=json!({"schema":"genos.rust-agentic-config/v1",
        "provider":{"kind":"ollama","address":listener.local_addr().unwrap(),"model":"fixture-agentic","generation":1},
        "generation":{"max_output_tokens":256,"temperature_milli":0},"documents":["notes.txt"],
        "agents":[{"id":"reader","instruction":"Read the selected source and preserve uncertainty",
            "tools":["read_source","list_sources"],"max_turns":3},
            {"id":"author","instruction":"Consume the reader output and write a note","depends_on":["reader"],
                "tools":["read_artifact","write_artifact"],"artifact_names":["draft"],"max_turns":3}],
        "contract":{"min_bytes":1,"max_bytes":16384,"required":["Sources","Limites"],"forbidden":[],"semantic_requirements":[]},
        "limits":{"tokens":50000,"model_calls":10,"tool_calls":10,"wall_ms":timing.0},
        "max_input_tokens":2048,"turn_timeout_ms":timing.1});
    std::fs::write(directory.path().join("agentic.json"),serde_json::to_vec(&config).unwrap()).unwrap();
}

impl Pending {
    pub fn prepare_permit(&mut self) {
        self.permit=Some(match ledger::prepare_model(&mut self.store,&self.binding,&ledger::ModelIntent {
            key:self.key.clone(),request:&self.request,max_wall_ms:self.spec.config.turn_timeout_ms }).unwrap() {
            ledger::ModelAdmission::Fresh(value)=>value,_=>panic!("fresh native model permit required"),
        });
    }

    pub fn prepare_step(&mut self, agent_id:&str, turn:u32) {
        agentic_exchange::receive(&mut self.store,&self.binding,agent_id).unwrap();
        self.key=ledger::StepKey { agent_id:agent_id.into(),turn };
        self.request=agentic_context::prepare(&mut self.store,&self.binding,&self.key).unwrap();
        self.prepare_permit();
    }

    pub fn complete(&mut self, response:Value) -> ledger::ModelRecord {
        self.dispatch_response(response,(false,0)).unwrap()
    }

    pub fn complete_after(&mut self, response:Value, delay_ms:u64) -> ledger::ModelRecord {
        self.dispatch_response(response,(false,delay_ms))
            .unwrap_or_else(|failure|panic!("native delayed HTTP failed for {:?}: {failure}",self.key))
    }

    pub fn incomplete(&mut self, response:Value) -> Result<ledger::ModelRecord,ledger::DispatchError> {
        self.dispatch_response(response,(true,0))
    }

    fn dispatch_response(&mut self, response:Value, options:(bool,u64)) -> Result<ledger::ModelRecord,ledger::DispatchError> {
        let listener=self.listener.take().unwrap();
        listener.set_nonblocking(false).unwrap();
        let bytes=serde_json::to_vec(&response).unwrap();
        let counter=self.requests.clone();
        let server=std::thread::spawn(move || {
            let served=serve(&listener,(&bytes,options.0,options.1),&counter);
            (listener,served)
        });
        let outcome=ledger::dispatch_model(&mut self.store,&self.binding,ledger::ModelDispatch {
            permit:self.permit.take().unwrap(),request:&self.request });
        let (listener,served)=server.join().unwrap();self.listener=Some(listener);
        if outcome.is_ok() { served.unwrap(); }
        outcome
    }

    pub fn finish_agent(&mut self, record:&ledger::ModelRecord) -> ledger::CompletedAgent {
        ledger::complete_agent(&mut self.store,&self.binding,&ledger::AgentCompletion {
            agent_id:record.key.agent_id.clone(),last_turn:record.key.turn,text:record.text.clone(),
            observation_hash:record.observation_hash.clone() }).unwrap()
    }
}

pub fn response(text:&str) -> Value {
    json!({"model":"fixture-agentic","message":{"role":"assistant","content":text},
        "done":true,"done_reason":"stop","prompt_eval_count":17,"eval_count":23})
}

pub fn tool(name:&str, arguments:Value, id:&str) -> Value {
    let mut value=response("");
    value["message"]["tool_calls"]=json!([{"id":id,"type":"function","function":{"name":name,"arguments":arguments}}]);
    value
}

fn serve(listener:&TcpListener, input:(&[u8],bool,u64), counter:&AtomicUsize) -> Result<(),String> {
    let mut stream=accept(listener)?;
    stream.set_nonblocking(false).map_err(error)?;
    stream.set_read_timeout(Some(std::time::Duration::from_secs(5))).map_err(error)?;
    read_request(&mut stream)?;
    counter.fetch_add(1,Ordering::SeqCst);
    std::thread::sleep(std::time::Duration::from_millis(input.2));
    let length=input.0.len()+if input.1 { 16 } else { 0 };
    let header=format!("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {length}\r\nConnection: close\r\n\r\n");
    stream.write_all(header.as_bytes()).map_err(error)?;
    stream.write_all(input.0).map_err(error)
}

fn accept(listener:&TcpListener) -> Result<TcpStream,String> {
    listener.set_nonblocking(true).map_err(error)?;
    let deadline=std::time::Instant::now()+std::time::Duration::from_secs(5);
    loop {
        match listener.accept() {
            Ok((stream,_))=>return Ok(stream),
            Err(error) if error.kind()==std::io::ErrorKind::WouldBlock=>{},
            Err(value)=>return Err(error(value)),
        }
        if std::time::Instant::now()>=deadline { return Err("fixture expected HTTP dispatch".into()); }
        std::thread::sleep(std::time::Duration::from_millis(2));
    }
}

fn read_request(stream:&mut TcpStream) -> Result<(),String> {
    let mut bytes=Vec::new();
    loop {
        let mut buffer=[0;4096];
        let size=stream.read(&mut buffer).map_err(error)?;
        if size==0 { return Err("fixture request ended early".into()); }
        bytes.extend_from_slice(&buffer[..size]);
        if bytes.len()>262144 { return Err("fixture request too large".into()); }
        if full_request(&bytes)? { return Ok(()); }
    }
}

fn full_request(bytes:&[u8]) -> Result<bool,String> {
    let Some(end)=bytes.windows(4).position(|value|value==b"\r\n\r\n") else { return Ok(false); };
    let header=std::str::from_utf8(&bytes[..end]).map_err(error)?;
    let length=header.lines().find_map(|line| {
        let (name,value)=line.split_once(':')?;
        name.eq_ignore_ascii_case("content-length").then(||value.trim().parse::<usize>().unwrap())
    }).ok_or("fixture content length missing")?;
    Ok(bytes.len()>=end+4+length)
}

fn error(value:impl std::fmt::Display) -> String { value.to_string() }

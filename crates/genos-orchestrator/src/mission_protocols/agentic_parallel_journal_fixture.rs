use super::{Binding,Store,StepKey,WaveHandle};
use super::super::{agentic_context,agentic_ledger as ledger,agentic_exchange,agentic_source,llm_source,raw_hash};
use genos_api::native_inference::ToolInferenceRequest;
use serde_json::{Value,json};
use std::io::{Read,Write};
use std::net::{TcpListener,TcpStream};
use std::sync::{Arc,atomic::{AtomicUsize,Ordering}};

#[derive(Debug)]
pub(super) struct Job { pub key:StepKey,pub request:ToolInferenceRequest,pub permit:ledger::ModelPermit }
pub(super) struct Fixture {
    pub directory:tempfile::TempDir,pub store:Store,pub binding:Binding,
    listener:TcpListener,pub requests:Arc<AtomicUsize>,
}

pub(super) fn key(agent:&str)->StepKey { StepKey { agent_id:agent.into(),turn:0 } }

impl Fixture {
    pub fn new()->Self {
        let listener=TcpListener::bind("127.0.0.1:0").unwrap();
        let directory=tempfile::TempDir::new().unwrap();
        write_sources(directory.path(),&listener);
        let source=agentic_source::read(directory.path(),"agentic.json").unwrap();
        let spec=source.specification(llm_source::MissionIdentity { mission_id:uuid::Uuid::new_v4().to_string(),
            workspace:directory.path().into(),mission:"Use admitted native tools and preserve uncertainty".into(),
            timeout_ms:180000,env_hash:environment() }).unwrap();
        let mut store=Store::open(&directory.path().join("ledger.sqlite")).unwrap();
        let binding=store.admit_agentic(&spec).unwrap();
        ledger::initialize(&mut store,&binding).unwrap();agentic_exchange::initialize(&mut store,&binding).unwrap();
        Self { directory,store,binding,listener,requests:Arc::new(AtomicUsize::new(0)) }
    }

    pub fn prepare(&mut self,keys:&[StepKey])->Result<(WaveHandle,Vec<Job>),String> {
        for key in keys { agentic_exchange::receive(&mut self.store,&self.binding,&key.agent_id)?; }
        self.store.transaction(&self.binding,|tx| {
            super::require_idle_or_recover_in(tx,&self.binding)?;
            let jobs=prepare_in(tx,&self.binding,keys)?;
            let handle=super::begin_in(tx,&self.binding,keys)?;
            Ok((handle,jobs))
        })
    }

    pub fn dispatch(&mut self,job:Job,input:(Value,bool))->Result<ledger::ModelRecord,ledger::DispatchError> {
        let listener=self.listener.try_clone().unwrap();let counter=self.requests.clone();
        let server=std::thread::spawn(move||serve(&listener,input,&counter));
        let outcome=ledger::dispatch_model(&mut self.store,&self.binding,ledger::ModelDispatch { permit:job.permit,request:&job.request });
        let served=server.join().unwrap();if outcome.is_ok() { assert!(served); }outcome
    }

    pub fn complete(&mut self,record:&ledger::ModelRecord) {
        ledger::complete_agent(&mut self.store,&self.binding,&ledger::AgentCompletion { agent_id:record.key.agent_id.clone(),
            last_turn:record.key.turn,text:record.text.clone(),observation_hash:record.observation_hash.clone() }).unwrap();
    }
}

pub(super) fn prepare_in(tx:&rusqlite::Transaction<'_>,binding:&Binding,keys:&[StepKey])->Result<Vec<Job>,String> {
    let mut jobs=Vec::new();
    for key in keys {
        let request=agentic_context::prepare_bounded_in(tx,binding,&agentic_context::ContextRequest { key,max_wall_ms:10000 })?;
        let input=ledger::ModelIntent { key:key.clone(),request:&request,max_wall_ms:10000 };
        let admission=ledger::prepare_model_in(tx,binding,&input)?;
        let ledger::ModelAdmission::Fresh(permit)=admission else { return Err("fixture requires fresh intent".into()); };
        jobs.push(Job { key:key.clone(),request,permit });
    }
    Ok(jobs)
}

fn write_sources(directory:&std::path::Path,listener:&TcpListener) {
    let config=json!({"schema":"genos.rust-agentic-config/v1","max_parallel_agents":2,
        "provider":{"kind":"ollama","address":listener.local_addr().unwrap(),"model":"parallel-journal","generation":1},
        "generation":{"max_output_tokens":128,"temperature_milli":0},"documents":["notes.txt"],
        "agents":[{"id":"alpha","instruction":"Read sources honestly","tools":["read_source"],"max_turns":3},
            {"id":"beta","instruction":"Preserve uncertainty","tools":["list_sources"],"max_turns":3},
            {"id":"gamma","instruction":"Keep an independent logical perspective","tools":["list_sources"],"max_turns":3},
            {"id":"writer","instruction":"Consume all predecessors","depends_on":["alpha","beta","gamma"],"tools":["list_sources"],"max_turns":2}],
        "contract":{"min_bytes":1,"max_bytes":4096,"required":["Sources","Limites"],"forbidden":[],"semantic_requirements":[]},
        "limits":{"tokens":50000,"model_calls":12,"tool_calls":12,"wall_ms":120000},
        "max_input_tokens":512,"turn_timeout_ms":10000});
    std::fs::write(directory.join("notes.txt"),"Actual snapshot bytes for the native read tool.").unwrap();
    std::fs::write(directory.join("agentic.json"),serde_json::to_vec(&config).unwrap()).unwrap();
}

fn environment()->String {
    static HASH:std::sync::OnceLock<String>=std::sync::OnceLock::new();
    HASH.get_or_init(||raw_hash(&std::fs::read(std::env::current_exe().unwrap()).unwrap())).clone()
}

pub(super) fn response()->Value {
    json!({"model":"parallel-journal","message":{"role":"assistant","content":"Sources: native. Limites: contract only."},
        "done":true,"done_reason":"stop","prompt_eval_count":17,"eval_count":23})
}

pub(super) fn tool()->Value {
    let mut value=response();
    value["message"]["content"]="".into();
    value["message"]["tool_calls"]=json!([{"id":"read","type":"function","function":{"name":"read_source","arguments":{"path":"notes.txt"}}}]);
    value
}

fn serve(listener:&TcpListener,input:(Value,bool),counter:&AtomicUsize)->bool {
    let Some(mut stream)=accept(listener) else { return false; };
    stream.set_nonblocking(false).unwrap();stream.set_read_timeout(Some(std::time::Duration::from_secs(5))).unwrap();
    read_request(&mut stream);
    counter.fetch_add(1,Ordering::SeqCst);
    let bytes=serde_json::to_vec(&input.0).unwrap();let length=bytes.len()+if input.1 { 32 } else { 0 };
    let header=format!("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {length}\r\nConnection: close\r\n\r\n");
    stream.write_all(header.as_bytes()).unwrap();stream.write_all(&bytes).unwrap();
    true
}

fn accept(listener:&TcpListener)->Option<TcpStream> {
    listener.set_nonblocking(true).unwrap();
    let deadline=std::time::Instant::now()+std::time::Duration::from_secs(5);
    while std::time::Instant::now()<deadline {
        match listener.accept() {
            Ok((stream,_))=>return Some(stream),
            Err(error) if error.kind()==std::io::ErrorKind::WouldBlock=>{},
            Err(error)=>panic!("native fixture accept failed: {error}"),
        }
        std::thread::sleep(std::time::Duration::from_millis(2));
    }
    None
}

fn read_request(stream:&mut TcpStream) {
    let mut bytes=Vec::new();
    loop {
        let mut buffer=[0;4096];let size=stream.read(&mut buffer).unwrap();assert!(size>0);
        bytes.extend_from_slice(&buffer[..size]);assert!(bytes.len()<1_048_576);
        if complete_request(&bytes) { return; }
    }
}

fn complete_request(bytes:&[u8])->bool {
    let Some(end)=bytes.windows(4).position(|value|value==b"\r\n\r\n") else { return false; };
    let header=std::str::from_utf8(&bytes[..end]).unwrap();
    let length=header.lines().find_map(|line| {
        let (name,value)=line.split_once(':')?;
        name.eq_ignore_ascii_case("content-length").then(||value.trim().parse::<usize>().unwrap())
    }).unwrap();
    bytes.len()>=end+4+length
}

use genos_orchestrator::mission_protocols::{agentic_engine::NativeAgenticRequest,agentic_spec::AgenticSpec,
    agentic_source,llm_source,process,source};
use serde_json::{Value,json};
use std::collections::BTreeMap;
use std::io::{Read,Write};
use std::net::{TcpListener,TcpStream};
use std::path::PathBuf;
use std::sync::{Arc,Mutex,Condvar,atomic::{AtomicBool,Ordering}};

pub const FINAL:&str="Sources : worker-a-result et worker-b-result. Limites : contrat structurel seulement.";

#[derive(Clone,Copy,PartialEq,Eq)]
pub enum Mode { Subset, Adaptive, UnknownA, RegistrationAbort }

pub struct Fixture {
    pub directory:tempfile::TempDir,pub spec:AgenticSpec,pub database:PathBuf,
    executable:PathBuf,provider:Provider,
}

impl Fixture {
    pub fn new(mode:Mode) -> Self {
        let directory=tempfile::TempDir::new().unwrap();
        let provider=Provider::start(mode);
        std::fs::write(directory.path().join("notes.txt"),"Admitted source: transport alone is not proof.").unwrap();
        std::fs::write(directory.path().join("agentic.json"),serde_json::to_vec(&configuration(&provider)).unwrap()).unwrap();
        let executable=std::env::current_exe().unwrap();
        let bundle=agentic_source::read(directory.path(),"agentic.json").unwrap();
        let spec=bundle.specification(llm_source::MissionIdentity { mission_id:uuid::Uuid::new_v4().to_string(),
            workspace:directory.path().into(),mission:"Combine both branches with sources and limits".into(),
            timeout_ms:180000,env_hash:process::executable_hash(&executable).unwrap() }).unwrap();
        let database=source::journal_path(directory.path()).unwrap();
        Self { directory,spec,database,executable,provider }
    }
    pub fn request(&self) -> NativeAgenticRequest {
        NativeAgenticRequest { spec:self.spec.clone(),executable:self.executable.clone(),database:self.database.clone() }
    }
    pub fn calls(&self) -> Vec<Value> { self.provider.state.requests.lock().unwrap().clone() }
    pub fn child_arrivals_before_first_response(&self) -> usize { self.provider.state.gate.0.lock().unwrap().before_first }
    pub fn right_replied(&self) -> bool { self.provider.state.right_replied.load(Ordering::SeqCst) }
    pub fn arm_registration_abort(&self) { *self.provider.state.abort_registration.lock().unwrap()=Some(self.database.clone()); }
    pub fn allow_registration(&self) {
        let db=rusqlite::Connection::open(&self.database).unwrap();
        db.execute_batch("DROP TRIGGER abort_dynamic_registration").unwrap();
    }
    pub fn database(&self) -> rusqlite::Connection {
        rusqlite::Connection::open_with_flags(&self.database,rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY).unwrap()
    }
}

fn configuration(provider:&Provider) -> Value {
    json!({"schema":"genos.rust-agentic-config/v1","provider":{"kind":"ollama","address":provider.address,
        "model":"dynamic-http-fixture","generation":1},"generation":{"max_output_tokens":256,"temperature_milli":0},
        "max_parallel_agents":2,"agents":[
            {"id":"a","instruction":"Execute the assigned task using the selected source","tools":["read_source"],"max_turns":3},
            {"id":"b","instruction":"Execute the assigned task using the selected source","tools":["read_source"],"max_turns":3},
            {"id":"c","instruction":"Execute the assigned task using the selected source","tools":["read_source"],"max_turns":3},
            {"id":"coordinator","instruction":"Delegate tasks and combine the returned results","depends_on":[],
                "tools":["delegate_task","write_artifact"],"artifact_names":["draft"],"max_turns":6}],
        "orchestration":{"coordinator":"coordinator","max_delegations":3},
        "documents":["notes.txt"],"contract":{"min_bytes":1,"max_bytes":4096,"required":["Sources","Limites"],
            "forbidden":[],"semantic_requirements":[]},
        "limits":{"tokens":100000,"model_calls":20,"tool_calls":20,"wall_ms":170000},
        "max_input_tokens":2048,"turn_timeout_ms":20000})
}

#[derive(Default)]
struct Gate { arrivals:usize,responses:usize,before_first:usize }
struct State {
    mode:Mode,stop:AtomicBool,requests:Mutex<Vec<Value>>,turns:Mutex<BTreeMap<String,usize>>,
    gate:(Mutex<Gate>,Condvar),right_replied:AtomicBool,
    abort_registration:Mutex<Option<PathBuf>>,
}
struct Provider { address:String,state:Arc<State>,thread:Option<std::thread::JoinHandle<Result<(),String>>> }

impl Provider {
    fn start(mode:Mode) -> Self {
        let listener=TcpListener::bind("127.0.0.1:0").unwrap();listener.set_nonblocking(true).unwrap();
        let address=listener.local_addr().unwrap().to_string();
        let state=Arc::new(State { mode,stop:AtomicBool::new(false),requests:Mutex::new(Vec::new()),turns:Mutex::new(BTreeMap::new()),
            gate:(Mutex::new(Gate::default()),Condvar::new()),right_replied:AtomicBool::new(false),abort_registration:Mutex::new(None) });
        let shared=state.clone();let thread=std::thread::spawn(move ||server(listener,&shared));
        Self { address,state,thread:Some(thread) }
    }
}

impl Drop for Provider {
    fn drop(&mut self) {
        self.state.stop.store(true,Ordering::SeqCst);
        if let Some(thread)=self.thread.take() {
            let result=thread.join();
            if !std::thread::panicking() { assert!(matches!(result,Ok(Ok(()))),"HTTP fixture failed: {result:?}"); }
        }
    }
}

fn server(listener:TcpListener,state:&Arc<State>) -> Result<(),String> {
    let mut handlers=Vec::new();
    while !state.stop.load(Ordering::SeqCst) {
        match listener.accept() {
            Ok((stream,_))=> { let state=state.clone();handlers.push(std::thread::spawn(move ||serve(stream,&state))); }
            Err(error) if error.kind()==std::io::ErrorKind::WouldBlock=>std::thread::sleep(std::time::Duration::from_millis(2)),
            Err(error)=>return Err(error.to_string()),
        }
    }
    for handler in handlers { handler.join().map_err(|_|"HTTP fixture handler panicked")??; }
    Ok(())
}

fn serve(mut stream:TcpStream,state:&State) -> Result<(),String> {
    stream.set_nonblocking(false).map_err(error)?;
    stream.set_read_timeout(Some(std::time::Duration::from_secs(5))).map_err(error)?;
    stream.set_write_timeout(Some(std::time::Duration::from_secs(5))).map_err(error)?;
    let request=read_request(&mut stream)?;
    let agent=agent_id(&request)?;
    state.requests.lock().unwrap().push(request);
    let turn={ let mut turns=state.turns.lock().unwrap();let turn=turns.entry(agent.clone()).or_default();let current=*turn;*turn+=1;current };
    wait_for_peer(state,(&agent,turn))?;
    respond(&mut stream,state,(&agent,turn))
}

fn respond(stream:&mut TcpStream,state:&State,step:(&str,usize)) -> Result<(),String> {
    let (agent,turn)=step;
    registration_fault(state,(agent,turn))?;
    if state.mode==Mode::UnknownA && agent=="b" && turn==0 { std::thread::sleep(std::time::Duration::from_millis(200)); }
    let body=serde_json::to_vec(&response(state.mode,agent,turn)).map_err(error)?;
    let incomplete=state.mode==Mode::UnknownA && agent=="a" && turn==0;
    write_response(stream,&body,incomplete)?;
    if agent=="b" { state.right_replied.store(true,Ordering::SeqCst); }
    Ok(())
}

fn wait_for_peer(state:&State,step:(&str,usize)) -> Result<(),String> {
    if step.1!=0 || !matches!(step.0,"a"|"b") { return Ok(()); }
    let mut gate=state.gate.0.lock().unwrap();
    gate.arrivals+=1;state.gate.1.notify_all();
    let result=state.gate.1.wait_timeout_while(gate,std::time::Duration::from_secs(15),|gate|gate.arrivals<2).unwrap();
    gate=result.0;
    if gate.arrivals<2 { return Err("two real child HTTP arrivals required before either child response".into()); }
    if gate.responses==0 { gate.before_first=gate.arrivals; }
    gate.responses+=1;
    Ok(())
}

fn agent_id(request:&Value) -> Result<String,String> {
    request["messages"].as_array().ok_or("messages missing")?.iter().find_map(|message| {
        let value:Value=serde_json::from_str(message["content"].as_str()?).ok()?;
        (value["schema"]=="genos.rust-agentic-inputs/v1").then(||value["own_agent_id"].as_str().map(str::to_owned)).flatten()
    }).ok_or_else(||"actual agent model input missing".into())
}

fn response(mode:Mode,agent:&str,turn:usize) -> Value {
    if agent=="coordinator" { return coordinator_response(mode,turn); }
    if turn==0 { return tool_response(vec![call(&format!("read-{agent}"),"read_source",json!({"path":"notes.txt"}))]); }
    completion(&format!("Sources : worker-{agent}-result. Limites : no semantic proof."))
}

fn coordinator_response(mode:Mode,turn:usize) -> Value {
    if turn==0 {
        return tool_response(vec![call("delegate-a","delegate_task",json!({"agent_id":"a","task":"task-a: analyse the selected source"})),
            call("delegate-b","delegate_task",json!({"agent_id":"b","task":"task-b: identify the stated limits"}))]);
    }
    if mode==Mode::Adaptive && turn==1 {
        return tool_response(vec![call("delegate-c","delegate_task",json!({"agent_id":"c","task":"task-c: compare both earlier findings"}))]);
    }
    let write_turn=if mode==Mode::Adaptive { 2 } else { 1 };
    if turn==write_turn { return tool_response(vec![call("write-draft","write_artifact",json!({"name":"draft","text":FINAL}))]); }
    completion(FINAL)
}

fn completion(text:&str) -> Value {
    json!({"model":"dynamic-http-fixture","message":{"role":"assistant","content":text},"done":true,
        "done_reason":"stop","prompt_eval_count":17,"eval_count":23})
}

fn tool_response(calls:Vec<Value>) -> Value {
    let mut value=completion("");value["message"]["tool_calls"]=json!(calls);value
}

fn call(id:&str,name:&str,arguments:Value) -> Value {
    json!({"id":id,"function":{"name":name,"arguments":arguments}})
}

fn registration_fault(state:&State,step:(&str,usize)) -> Result<(),String> {
    if step!=("coordinator",0) { return Ok(()); }
    let Some(path)=state.abort_registration.lock().unwrap().take() else { return Ok(()); };
    let db=rusqlite::Connection::open(path).map_err(error)?;
    db.busy_timeout(std::time::Duration::from_secs(5)).map_err(error)?;
    db.execute_batch("CREATE TRIGGER abort_dynamic_registration BEFORE INSERT ON protocol_agentic_tool_receipts
        WHEN NEW.agent_id='coordinator' AND NEW.call_index=1
        BEGIN SELECT RAISE(ABORT,'TEST_DYNAMIC_REGISTRATION_ABORT'); END;").map_err(error)
}

fn write_response(stream:&mut TcpStream,body:&[u8],incomplete:bool) -> Result<(),String> {
    let length=body.len()+if incomplete { 16 } else { 0 };
    let header=format!("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {length}\r\nConnection: close\r\n\r\n");
    stream.write_all(header.as_bytes()).map_err(error)?;stream.write_all(body).map_err(error)
}

fn read_request(stream:&mut TcpStream) -> Result<Value,String> {
    let mut bytes=Vec::new();
    loop {
        let mut buffer=[0;4096];let count=stream.read(&mut buffer).map_err(error)?;
        if count==0 || bytes.len()+count>262144 { return Err("fixture incomplete or oversized request".into()); }
        bytes.extend_from_slice(&buffer[..count]);
        if let Some(body)=request_body(&bytes)? { return serde_json::from_slice(body).map_err(error); }
    }
}

fn request_body(bytes:&[u8]) -> Result<Option<&[u8]>,String> {
    let Some(end)=bytes.windows(4).position(|value|value==b"\r\n\r\n") else { return Ok(None); };
    let header=std::str::from_utf8(&bytes[..end]).map_err(error)?;
    if !header.starts_with("POST /api/chat HTTP/1.1\r\n") { return Err("fixture unexpected provider route".into()); }
    let length=header.lines().find_map(|line| {
        let (name,value)=line.split_once(':')?;
        name.eq_ignore_ascii_case("content-length").then(||value.trim().parse::<usize>().map_err(error))
    }).ok_or("fixture missing content length")??;
    if bytes.len()<end+4+length { return Ok(None); }
    Ok(Some(&bytes[end+4..end+4+length]))
}

fn error(error:impl std::fmt::Display) -> String { error.to_string() }

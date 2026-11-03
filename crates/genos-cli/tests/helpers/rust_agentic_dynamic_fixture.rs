use serde_json::{Value,json};
use std::io::{Read,Write};
use std::net::{TcpListener,TcpStream};
use std::path::{Path,PathBuf};
use std::process::{Command,Output};
use std::sync::{Arc,Mutex,OnceLock,atomic::{AtomicBool,AtomicUsize,Ordering}};
use std::time::{Duration,Instant};
use tempfile::TempDir;

pub const TEXT:&str="Sources : left-marker et right-marker. Limites : aucune vérité générale attestée.";
pub fn serial()->std::sync::MutexGuard<'static,()> {
    static LOCK:OnceLock<Mutex<()>>=OnceLock::new();
    LOCK.get_or_init(||Mutex::new(())).lock().unwrap_or_else(|error|error.into_inner())
}

pub struct Fixture { pub directory:TempDir,pub workspace:PathBuf,executable:PathBuf,provider:Provider }
struct Provider { address:std::net::SocketAddr,state:Arc<State>,thread:Option<std::thread::JoinHandle<()>> }
struct State {
    stop:AtomicBool,calls:AtomicUsize,active:AtomicUsize,peak:AtomicUsize,finished:AtomicUsize,artifact_returns:AtomicBool,early_write:AtomicBool,
    requests:Mutex<Vec<Value>>,parallel_barrier:bool,missing_usage:bool,
    abort_writer:Mutex<Option<PathBuf>>,
}

impl Fixture {
    pub fn new(mode:(bool,bool)) -> Self {
        let directory=TempDir::new().unwrap();let workspace=directory.path().join("workspace");
        std::fs::create_dir(&workspace).unwrap();
        std::fs::write(workspace.join("notes.txt"),"source-marker : un transport réussi ne prouve pas la vérité.").unwrap();
        let executable=private_executable(directory.path());
        let provider=Provider::start(mode);
        let value=Self { directory,workspace,executable,provider };
        value.write_config(value.configuration());value
    }
    fn configuration(&self)->Value {
        json!({"schema":"genos.rust-agentic-config/v1","provider":{"kind":"ollama",
            "address":self.provider.address.to_string(),"model":"dynamic-http-fixture","generation":1},
            "generation":{"max_output_tokens":512,"temperature_milli":0},"max_parallel_agents":2,
            "orchestration":{"coordinator":"writer","max_delegations":3},
            "agents":[agent("left",vec![]),agent("right",vec![]),agent("idle",vec![]),agent("writer",vec![])],
            "documents":["notes.txt"],"contract":{"min_bytes":8,"max_bytes":4096,
                "required":["Sources","Limites"],"forbidden":[],"semantic_requirements":[]},
            "limits":{"tokens":100000,"model_calls":12,"tool_calls":12,"wall_ms":60000},
            "max_input_tokens":2048,"turn_timeout_ms":10000})
    }
    pub fn config(&self)->Value { serde_json::from_slice(&std::fs::read(self.workspace.join("agentic.json")).unwrap()).unwrap() }
    pub fn write_config(&self,value:Value) { std::fs::write(self.workspace.join("agentic.json"),serde_json::to_vec(&value).unwrap()).unwrap(); }
    pub fn database_path(&self)->PathBuf { self.workspace.join(".genos-native/mission-protocols.sqlite") }
    pub fn database(&self)->rusqlite::Connection {
        rusqlite::Connection::open_with_flags(self.database_path(),rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY).unwrap()
    }
    pub fn calls(&self)->usize { self.provider.state.calls.load(Ordering::SeqCst) }
    pub fn peak(&self)->usize { self.provider.state.peak.load(Ordering::SeqCst) }
    pub fn finished(&self)->usize { self.provider.state.finished.load(Ordering::SeqCst) }
    pub fn requests(&self)->Vec<Value> { self.provider.state.requests.lock().unwrap().clone() }
    pub fn enable_early_write(&self) { self.provider.state.early_write.store(true,Ordering::SeqCst); }
    pub fn enable_artifact_returns(&self) {
        let mut config=self.config();
        config["agents"][0]["tools"]=json!(["read_source","write_artifact"]);
        config["agents"][0]["artifact_names"]=json!(["child_note"]);
        config["agents"][3]["tools"]=json!(["delegate_task","read_artifact","write_artifact"]);
        config["agents"][3]["max_turns"]=4.into();self.write_config(config);
        self.provider.state.artifact_returns.store(true,Ordering::SeqCst);
    }
    pub fn fail_writer_receipt(&self) { *self.provider.state.abort_writer.lock().unwrap()=Some(self.database_path()); }
    pub fn allow_writer_receipt(&self) {
        let db=rusqlite::Connection::open(self.database_path()).unwrap();
        db.execute_batch("DROP TRIGGER fail_dynamic_delegation_receipt").unwrap();
    }
    pub fn command(&self,mission:&str)->Command {
        let mut command=Command::new(&self.executable);
        command.args(["run","Compose les deux analyses avec Sources et Limites.","--executor","rust","--workspace-root"])
            .arg(&self.workspace).args(["--mission-id",mission,"--timeout-ms","120000","--agentic-config","agentic.json"])
            .current_dir(&self.workspace).env("PATH",&self.workspace).env("GENOS_MOCK_LLM","1");
        command
    }
}

fn agent(id:&str,dependencies:Vec<&str>)->Value {
    let writer=id=="writer";
    json!({"id":id,"instruction":format!("Agent de fixture {id}."),"depends_on":dependencies,
        "tools":if writer { vec!["delegate_task","write_artifact"] } else { vec!["read_source"] },
        "artifact_names":if writer { vec!["draft"] } else { vec![] },"max_turns":3})
}

fn private_executable(directory:&Path)->PathBuf {
    let source=Path::new(env!("CARGO_BIN_EXE_genos"));
    let hash=genos_orchestrator::mission_protocols::process::executable_hash(source).unwrap();
    let destination=directory.join("genos-dynamic-test.exe");std::fs::copy(source,&destination).unwrap();
    assert_eq!(genos_orchestrator::mission_protocols::process::executable_hash(&destination).unwrap(),hash);
    destination
}

pub fn report(output:Output)->Value {
    serde_json::from_slice(&output.stdout).unwrap_or_else(|error|panic!("JSON {error}: {} / {}",
        String::from_utf8_lossy(&output.stdout),String::from_utf8_lossy(&output.stderr)))
}
pub fn success(output:Output)->Value {
    assert!(output.status.success(),"{}",String::from_utf8_lossy(&output.stderr));let value=report(output);
    assert_eq!(value["status"],"completed");value
}
pub fn unresolved(output:Output)->Value {
    assert!(!output.status.success());let value=report(output);
    assert_eq!(value["status"],"unresolved");assert!(value["publication"].is_null());
    for field in ["artifact_contract_verified","semantic_truth_verified","promotable","external_effects_authorized"] {
        assert_eq!(value[field],false);
    }
    value
}

impl Provider {
    fn start(mode:(bool,bool))->Self {
        let listener=TcpListener::bind("127.0.0.1:0").unwrap();listener.set_nonblocking(true).unwrap();
        let address=listener.local_addr().unwrap();
        let state=Arc::new(State { stop:AtomicBool::new(false),calls:AtomicUsize::new(0),active:AtomicUsize::new(0),
            peak:AtomicUsize::new(0),finished:AtomicUsize::new(0),requests:Mutex::new(vec![]),artifact_returns:AtomicBool::new(false),early_write:AtomicBool::new(false),
            parallel_barrier:mode.0,missing_usage:mode.1,abort_writer:Mutex::new(None) });
        let shared=state.clone();let thread=std::thread::spawn(move ||serve_all(listener,&shared));
        Self { address,state,thread:Some(thread) }
    }
}
impl Drop for Provider {
    fn drop(&mut self) {
        self.state.stop.store(true,Ordering::SeqCst);
        if let Some(thread)=self.thread.take() {
            let result=thread.join();
            if !std::thread::panicking() { assert!(result.is_ok(),"fixture server failed: {result:?}"); }
        }
    }
}
fn serve_all(listener:TcpListener,state:&Arc<State>) {
    let mut workers=Vec::new();
    while !state.stop.load(Ordering::SeqCst) {
        match listener.accept() {
            Ok((stream,_))=> { let state=state.clone();workers.push(std::thread::spawn(move ||serve(stream,&state))); },
            Err(error) if error.kind()==std::io::ErrorKind::WouldBlock=>std::thread::sleep(Duration::from_millis(2)),
            Err(error)=>panic!("fixture accept {error}"),
        }
    }
    for worker in workers { worker.join().unwrap(); }
}

fn serve(mut stream:TcpStream,state:&State) {
    stream.set_nonblocking(false).unwrap();
    stream.set_read_timeout(Some(Duration::from_secs(10))).unwrap();
    stream.set_write_timeout(Some(Duration::from_secs(10))).unwrap();
    let request=read_request(&mut stream);let agent=agent_id(&request);
    let turn=request["messages"].as_array().unwrap().iter().filter(|message|message["role"]=="tool").count();
    state.requests.lock().unwrap().push(request);
    let index=state.calls.fetch_add(1,Ordering::SeqCst);
    let active=state.active.fetch_add(1,Ordering::SeqCst)+1;state.peak.fetch_max(active,Ordering::SeqCst);
    wait_for_pair(state,index);
    if agent=="writer" && turn==0 { inject_abort(state); }
    let mut body=selected_response(state,(&agent,turn));
    if state.missing_usage && agent=="left" { body.as_object_mut().unwrap().remove("prompt_eval_count"); }
    let body=serde_json::to_vec(&body).unwrap();
    let header=format!("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",body.len());
    let _=stream.write_all(header.as_bytes()).and_then(|_|stream.write_all(&body));
    state.active.fetch_sub(1,Ordering::SeqCst);state.finished.fetch_add(1,Ordering::SeqCst);
}
fn wait_for_pair(state:&State,index:usize) {
    if !state.parallel_barrier || !(1..=2).contains(&index) { return; }
    let start=Instant::now();
    while state.calls.load(Ordering::SeqCst)<3 && start.elapsed()<Duration::from_secs(7) {
        std::thread::sleep(Duration::from_millis(2));
    }
    std::thread::sleep(Duration::from_millis(40));
}
fn inject_abort(state:&State) {
    let Some(path)=state.abort_writer.lock().unwrap().take() else { return; };
    let db=rusqlite::Connection::open(path).unwrap();db.busy_timeout(Duration::from_secs(5)).unwrap();
    db.execute_batch("CREATE TRIGGER fail_dynamic_delegation_receipt BEFORE INSERT ON protocol_agentic_tool_receipts
        WHEN NEW.agent_id='writer' BEGIN SELECT RAISE(ABORT,'TEST_DYNAMIC_DELEGATION_ABORT'); END;").unwrap();
}
fn response(agent:&str,turn:usize)->Value {
    let text=if agent=="writer" { TEXT.to_string() } else { format!("{agent}-marker : source analysée.") };
    let mut value=json!({"model":"dynamic-http-fixture","message":{"role":"assistant","content":text},
        "done":true,"done_reason":"stop","prompt_eval_count":17,"eval_count":23});
    let calls=tool_calls(agent,turn);
    if !calls.is_empty() {
        value["message"]["content"]="".into();value["message"]["tool_calls"]=calls.into();
    }
    value
}
fn selected_response(state:&State,step:(&str,usize))->Value {
    if state.early_write.load(Ordering::SeqCst) { return early_write_response(step.0,step.1); }
    if state.artifact_returns.load(Ordering::SeqCst) { return artifact_response(step.0,step.1); }
    response(step.0,step.1)
}
fn early_write_response(agent:&str,turn:usize)->Value {
    if agent!="writer" { return response(agent,turn); }
    let mut value=response(agent,usize::MAX);
    let calls=match turn {
        0=> {
            let mut calls=tool_calls("writer",0);
            calls.insert(0,json!({"function":{"name":"write_artifact","arguments":{"name":"draft","text":"premature-draft"}}}));
            calls
        },
        3=>tool_calls("writer",2),
        _=>vec![],
    };
    if !calls.is_empty() {
        value["message"]["content"]="".into();value["message"]["tool_calls"]=calls.into();
    }
    value
}
fn tool_calls(agent:&str,turn:usize)->Vec<Value> {
    if agent=="writer" && turn==0 {
        return ["left","right"].into_iter().map(|worker|json!({"function":{"name":"delegate_task",
            "arguments":{"agent_id":worker,"task":format!("Read notes.txt and return {worker}-marker")}}})).collect();
    }
    if agent=="writer" && turn==2 {
        return vec![json!({"function":{"name":"write_artifact","arguments":{"name":"draft","text":TEXT}}})];
    }
    if agent!="writer" && turn==0 {
        return vec![json!({"function":{"name":"read_source","arguments":{"path":"notes.txt"}}})];
    }
    vec![]
}
fn artifact_response(agent:&str,turn:usize)->Value {
    let mut value=response(agent,usize::MAX);
    let calls=if agent=="writer" { coordinator_artifact_calls(turn) } else { child_artifact_calls(agent,turn) };
    if !calls.is_empty() {
        value["message"]["content"]="".into();value["message"]["tool_calls"]=calls.into();
    }
    value
}
fn coordinator_artifact_calls(turn:usize)->Vec<Value> {
    let read=json!({"function":{"name":"read_artifact","arguments":{"agent_id":"left","name":"child_note"}}});
    match turn {
        0=> { let mut calls=tool_calls("writer",0);calls.push(read);calls },
        3=>vec![read],
        4=>tool_calls("writer",2),
        _=>vec![],
    }
}
fn child_artifact_calls(agent:&str,turn:usize)->Vec<Value> {
    let mut calls=tool_calls(agent,turn);
    if agent=="left" && turn==0 {
        calls.push(json!({"function":{"name":"write_artifact","arguments":{"name":"child_note","text":"left-private-note"}}}));
    }
    calls
}
pub fn agent_id(request:&Value)->String {
    let system=request["messages"][0]["content"].as_str().unwrap();
    ["left","right","idle","writer"].into_iter().find(|id|system.starts_with(&format!("Agent logique {id}."))).unwrap().into()
}
fn read_request(stream:&mut TcpStream)->Value {
    let mut bytes=Vec::new();
    loop {
        let mut buffer=[0;4096];let count=stream.read(&mut buffer).unwrap();assert!(count>0);
        bytes.extend_from_slice(&buffer[..count]);assert!(bytes.len()<262144);
        if let Some(value)=request_body(&bytes) { return serde_json::from_slice(value).unwrap(); }
    }
}
fn request_body(bytes:&[u8])->Option<&[u8]> {
    let end=bytes.windows(4).position(|value|value==b"\r\n\r\n")?;
    let header=std::str::from_utf8(&bytes[..end]).unwrap();assert!(header.starts_with("POST /api/chat HTTP/1.1\r\n"));
    let length=header.lines().find_map(|line| {
        let (key,value)=line.split_once(':')?;
        key.eq_ignore_ascii_case("content-length").then(||value.trim().parse::<usize>().unwrap())
    }).unwrap();
    (bytes.len()>=end+4+length).then(||&bytes[end+4..end+4+length])
}

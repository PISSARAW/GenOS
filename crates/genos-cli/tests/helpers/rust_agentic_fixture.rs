use serde_json::{Value,json};
use std::io::{Read,Write};
use std::net::{TcpListener,TcpStream};
use std::path::{Path,PathBuf};
use std::process::{Command,Output};
use std::sync::{Arc,Mutex,OnceLock,atomic::{AtomicBool,AtomicUsize,Ordering}};
use tempfile::TempDir;

pub const SOURCE: &str="source-marker : un transport réussi ne démontre aucune vérité générale.";
pub const ANALYSIS: &str="analyst-output-marker : la source distingue transport et preuve.";
pub const TEXT: &str="Sources : analyst-output-marker et source-marker. Limites : aucune vérité générale attestée.";
pub const SECRET: &str="private-marker-must-never-enter-provider-dialogue";

pub fn serial() -> std::sync::MutexGuard<'static,()> {
    static LOCK:OnceLock<Mutex<()>>=OnceLock::new();
    LOCK.get_or_init(||Mutex::new(())).lock().unwrap_or_else(|error|error.into_inner())
}

struct State {
    responses:Vec<Value>,stop:AtomicBool,calls:AtomicUsize,requests:Mutex<Vec<Value>>,
    abort_writer_receipt:Mutex<Option<PathBuf>>,
}
struct Provider { address:std::net::SocketAddr,state:Arc<State>,thread:Option<std::thread::JoinHandle<Result<(),String>>> }

pub struct Fixture { pub directory:TempDir,pub workspace:PathBuf,executable:PathBuf,provider:Provider }

pub fn completion(text:&str) -> Value {
    json!({"model":"agentic-http-fixture","message":{"role":"assistant","content":text},"done":true,
        "done_reason":"stop","prompt_eval_count":17,"eval_count":23})
}

pub fn tool(name:&str,arguments:Value) -> Value {
    let mut response=completion("");
    response["message"]["tool_calls"]=json!([{"function":{"name":name,"arguments":arguments}}]);
    response
}

pub fn successful_script() -> Vec<Value> {
    vec![tool("read_source",json!({"path":"notes.txt"})),completion(ANALYSIS),
        tool("write_artifact",json!({"name":"draft","text":TEXT})),completion(TEXT)]
}

impl Fixture {
    pub fn new(responses:Vec<Value>) -> Self {
        let directory=TempDir::new().unwrap();
        let workspace=directory.path().join("workspace"); std::fs::create_dir(&workspace).unwrap();
        let executable=private_executable(directory.path());
        let provider=Provider::start(responses);
        let fixture=Self { directory,workspace,executable,provider };
        std::fs::write(fixture.workspace.join("notes.txt"),SOURCE).unwrap();
        std::fs::write(fixture.workspace.join(".env"),SECRET).unwrap();
        std::fs::write(fixture.directory.path().join("outside.txt"),SECRET).unwrap();
        fixture.write_config(fixture.configuration());
        fixture
    }

    fn configuration(&self) -> Value {
        json!({"schema":"genos.rust-agentic-config/v1","provider":{"kind":"ollama",
            "address":self.provider.address.to_string(),"model":"agentic-http-fixture","generation":1},
            "generation":{"max_output_tokens":512,"temperature_milli":0},
            "agents":[{"id":"analyst","instruction":"Analyse la source sélectionnée.","depends_on":[],
                "tools":["read_source"],"artifact_names":[],"max_turns":3},
                {"id":"writer","instruction":"Rédige selon l'analyse et conserve les limites.","depends_on":["analyst"],
                    "tools":["write_artifact"],"artifact_names":["draft"],"max_turns":3}],
            "documents":["notes.txt"],"contract":{"min_bytes":8,"max_bytes":4096,
                "required":["Sources","Limites"],"forbidden":[],"semantic_requirements":[]},
            "limits":{"tokens":100000,"model_calls":8,"tool_calls":8,"wall_ms":60000},
            "max_input_tokens":2048,"turn_timeout_ms":10000})
    }

    pub fn config(&self) -> Value { serde_json::from_slice(&std::fs::read(self.workspace.join("agentic.json")).unwrap()).unwrap() }
    pub fn write_config(&self,config:Value) { std::fs::write(self.workspace.join("agentic.json"),serde_json::to_vec(&config).unwrap()).unwrap(); }
    pub fn calls(&self) -> usize { self.provider.state.calls.load(Ordering::SeqCst) }
    pub fn requests(&self) -> Vec<Value> { self.provider.state.requests.lock().unwrap().clone() }
    pub fn database_path(&self) -> PathBuf { self.workspace.join(".genos-native/mission-protocols.sqlite") }
    pub fn database(&self) -> rusqlite::Connection {
        rusqlite::Connection::open_with_flags(self.database_path(),rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY).unwrap()
    }

    pub fn fail_writer_receipt(&self) { *self.provider.state.abort_writer_receipt.lock().unwrap()=Some(self.database_path()); }
    pub fn allow_writer_receipt(&self) {
        let db=rusqlite::Connection::open_with_flags(self.database_path(),rusqlite::OpenFlags::SQLITE_OPEN_READ_WRITE).unwrap();
        db.execute_batch("DROP TRIGGER fail_agentic_writer_receipt").unwrap();
    }

    pub fn command(&self,identity:(&str,&str),config:&str) -> Command {
        let mut command=Command::new(&self.executable);
        command.args(["run","Produis une note avec sources et limites.","--executor",identity.1,"--workspace-root"])
            .arg(&self.workspace).args(["--mission-id",identity.0,"--timeout-ms","120000","--agentic-config",config])
            .current_dir(&self.workspace).env("PATH",&self.workspace).env("GENOS_MOCK_LLM","1");
        command
    }
}

fn private_executable(directory:&Path) -> PathBuf {
    let source=Path::new(env!("CARGO_BIN_EXE_genos"));
    let expected=genos_orchestrator::mission_protocols::process::executable_hash(source).unwrap();
    let destination=directory.join("genos-agentic-test.exe");
    std::fs::copy(source,&destination).unwrap();
    assert_eq!(genos_orchestrator::mission_protocols::process::executable_hash(&destination).unwrap(),expected);
    destination
}

pub fn success(output:Output) -> Value {
    assert!(output.status.success(),"CLI failed: {}",String::from_utf8_lossy(&output.stderr));
    parse(output)
}

pub fn unresolved(output:Output) -> Value {
    assert!(!output.status.success(),"unresolved mission returned success");
    let report=parse(output);
    assert_eq!(report["status"],"unresolved"); assert!(report["publication"].is_null());
    assert_eq!(report["artifact_contract_verified"],false); assert_eq!(report["semantic_truth_verified"],false);
    assert_eq!(report["promotable"],false); assert_eq!(report["external_effects_authorized"],false);
    report
}

fn parse(output:Output) -> Value {
    serde_json::from_slice(&output.stdout).unwrap_or_else(|error|panic!("invalid CLI JSON {error}: stdout={} stderr={}",
        String::from_utf8_lossy(&output.stdout),String::from_utf8_lossy(&output.stderr)))
}

pub fn tool_result(request:&Value) -> Value {
    let messages=request["messages"].as_array().unwrap();
    let result=messages.iter().rev().find(|message|message["role"]=="tool").expect("actual tool result missing");
    serde_json::from_str(result["content"].as_str().unwrap()).expect("tool result must be typed JSON")
}

impl Provider {
    fn start(responses:Vec<Value>) -> Self {
        let listener=TcpListener::bind("127.0.0.1:0").unwrap(); listener.set_nonblocking(true).unwrap();
        let address=listener.local_addr().unwrap();
        let state=Arc::new(State { responses,stop:AtomicBool::new(false),calls:AtomicUsize::new(0),requests:Mutex::new(Vec::new()),
            abort_writer_receipt:Mutex::new(None) });
        let shared=state.clone(); let thread=std::thread::spawn(move ||server(listener,&shared));
        Self { address,state,thread:Some(thread) }
    }
}

impl Drop for Provider {
    fn drop(&mut self) {
        self.state.stop.store(true,Ordering::SeqCst);
        if let Some(thread)=self.thread.take() {
            let result=thread.join();
            if !std::thread::panicking() { assert!(matches!(result,Ok(Ok(()))),"fixture thread failed: {result:?}"); }
        }
    }
}

fn server(listener:TcpListener,state:&State) -> Result<(),String> {
    while !state.stop.load(Ordering::SeqCst) {
        match listener.accept() {
            Ok((stream,_))=>serve(stream,state)?,
            Err(error) if error.kind()==std::io::ErrorKind::WouldBlock=>std::thread::sleep(std::time::Duration::from_millis(2)),
            Err(error)=>return Err(error.to_string()),
        }
    }
    Ok(())
}

fn serve(mut stream:TcpStream,state:&State) -> Result<(),String> {
    stream.set_nonblocking(false).map_err(error)?;
    stream.set_read_timeout(Some(std::time::Duration::from_secs(10))).map_err(error)?;
    stream.set_write_timeout(Some(std::time::Duration::from_secs(10))).map_err(error)?;
    let request=read_request(&mut stream)?;
    state.requests.lock().unwrap().push(request);
    let index=state.calls.fetch_add(1,Ordering::SeqCst);
    install_fault(state,index)?;
    let response=state.responses.get(index).cloned().unwrap_or_else(||json!({"error":"unexpected extra inference"}));
    let body=serde_json::to_vec(&response).map_err(error)?;
    let header=format!("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",body.len());
    stream.write_all(header.as_bytes()).map_err(error)?; stream.write_all(&body).map_err(error)
}

fn install_fault(state:&State,index:usize) -> Result<(),String> {
    if index!=2 { return Ok(()); }
    let Some(path)=state.abort_writer_receipt.lock().unwrap().take() else { return Ok(()); };
    let db=rusqlite::Connection::open_with_flags(path,rusqlite::OpenFlags::SQLITE_OPEN_READ_WRITE).map_err(error)?;
    db.busy_timeout(std::time::Duration::from_secs(5)).map_err(error)?;
    db.execute_batch("CREATE TRIGGER fail_agentic_writer_receipt BEFORE INSERT ON protocol_agentic_tool_receipts
        WHEN NEW.agent_id='writer' BEGIN SELECT RAISE(ABORT,'TEST_AGENTIC_TOOL_RECEIPT_ABORT'); END;").map_err(error)
}

fn read_request(stream:&mut TcpStream) -> Result<Value,String> {
    let mut bytes=Vec::new();
    loop {
        let mut buffer=[0;4096]; let count=stream.read(&mut buffer).map_err(error)?;
        if count==0 || bytes.len()+count>262144 { return Err("fixture incomplete or oversized request".into()); }
        bytes.extend_from_slice(&buffer[..count]);
        if let Some(body)=request_body(&bytes)? { return serde_json::from_slice(body).map_err(error); }
    }
}

fn request_body(bytes:&[u8]) -> Result<Option<&[u8]>,String> {
    let Some(end)=bytes.windows(4).position(|value|value==b"\r\n\r\n") else { return Ok(None); };
    let header=std::str::from_utf8(&bytes[..end]).map_err(error)?;
    if !header.starts_with("POST /api/chat HTTP/1.1\r\n") { return Err("fixture unexpected provider route".into()); }
    let size=content_length(header)?;
    if bytes.len()<end+4+size { return Ok(None); }
    Ok(Some(&bytes[end+4..end+4+size]))
}

fn content_length(header:&str) -> Result<usize,String> {
    header.lines().find_map(|line| {
        let (name,value)=line.split_once(':')?;
        name.eq_ignore_ascii_case("content-length").then(||value.trim().parse::<usize>().map_err(error))
    }).ok_or("fixture missing content length")?
}

fn error(error:impl std::fmt::Display) -> String { error.to_string() }

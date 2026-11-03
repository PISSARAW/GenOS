use serde_json::{Value,json};
use std::io::{Read,Write};
use std::net::{TcpListener,TcpStream};
use std::path::PathBuf;
use std::process::{Command,Output};
use std::sync::{Arc,Mutex,OnceLock,atomic::{AtomicBool,AtomicUsize,Ordering}};
use tempfile::TempDir;

pub const TEXT: &str = "Sources : document-marker fourni. Limites : ce texte ne certifie pas la vérité générale.";
pub const MISSION: &str = "Rédiger une note documentaire avec sources et limites";

pub fn serial() -> std::sync::MutexGuard<'static,()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(||Mutex::new(())).lock().unwrap_or_else(|error|error.into_inner())
}

struct ServerState { response:Value,stop:AtomicBool,calls:AtomicUsize,requests:Mutex<Vec<Value>> }
struct Provider { address:std::net::SocketAddr,state:Arc<ServerState>,thread:Option<std::thread::JoinHandle<Result<(),String>>> }

pub struct Fixture { pub directory:TempDir,pub workspace:PathBuf,provider:Provider }

pub fn response() -> Value {
    json!({"model":"fixture-cli-text","message":{"role":"assistant","content":TEXT},"done":true,
        "done_reason":"stop","prompt_eval_count":17,"eval_count":23})
}

impl Fixture {
    pub fn new(response:Value) -> Self {
        let directory=TempDir::new().unwrap(); let workspace=directory.path().join("workspace");
        std::fs::create_dir(&workspace).unwrap();
        let provider=Provider::start(response);
        let fixture=Self { directory,workspace,provider };
        std::fs::write(fixture.workspace.join("notes.txt"),"document-marker : conserver les incertitudes et les sources.").unwrap();
        fixture.write_config(json!({"schema":"genos.rust-llm-config/v1","provider":{"kind":"ollama",
            "address":fixture.provider.address.to_string(),"model":"fixture-cli-text","generation":1},
            "generation":{"max_output_tokens":512,"temperature_milli":0},"messages":[],"documents":["notes.txt"],
            "contract":{"min_bytes":8,"max_bytes":4096,"required":["Sources","Limites"],"forbidden":[],"semantic_requirements":[]},
            "limits":{"tokens":20000,"model_calls":4,"wall_ms":30000},"max_input_tokens":2048}));
        fixture
    }

    pub fn config(&self) -> Value { serde_json::from_slice(&std::fs::read(self.workspace.join("mission.json")).unwrap()).unwrap() }
    pub fn write_config(&self,config:Value) { std::fs::write(self.workspace.join("mission.json"),serde_json::to_vec(&config).unwrap()).unwrap(); }
    pub fn calls(&self) -> usize { self.provider.state.calls.load(Ordering::SeqCst) }
    pub fn requests(&self) -> Vec<Value> { self.provider.state.requests.lock().unwrap().clone() }
    pub fn database_path(&self) -> PathBuf { self.workspace.join(".genos-native/mission-protocols.sqlite") }
    pub fn database(&self) -> rusqlite::Connection {
        rusqlite::Connection::open_with_flags(self.database_path(),rusqlite::OpenFlags::SQLITE_OPEN_READ_WRITE).unwrap()
    }

    pub fn fail_publication(&self) {
        let path=genos_orchestrator::mission_protocols::source::journal_path(&self.workspace).unwrap();
        drop(genos_orchestrator::mission_protocols::Store::open(&path).unwrap());
        self.database().execute_batch("CREATE TRIGGER fail_llm_completion BEFORE UPDATE OF status ON rust_protocol_runs
            WHEN NEW.status='completed' BEGIN SELECT RAISE(ABORT,'TEST_LLM_PUBLICATION_ABORT'); END;").unwrap();
    }

    pub fn allow_publication(&self) { self.database().execute_batch("DROP TRIGGER fail_llm_completion").unwrap(); }

    pub fn command(&self,identity:(&str,&str),config:&str) -> Command {
        let mut command=Command::new(env!("CARGO_BIN_EXE_genos"));
        command.args(["run",MISSION,"--executor",identity.1,"--workspace-root"]).arg(&self.workspace)
            .args(["--mission-id",identity.0,"--timeout-ms","60000","--llm-config",config])
            .current_dir(&self.workspace).env("PATH",&self.workspace).env("GENOS_MOCK_LLM","1");
        command
    }
}

pub fn success(output:Output) -> Value {
    assert!(output.status.success(),"CLI failed: {}",String::from_utf8_lossy(&output.stderr));
    serde_json::from_slice(&output.stdout).unwrap()
}

pub fn assert_unresolved(fixture:&Fixture,output:Output,text:&str) -> Value {
    assert!(!output.status.success());
    let report:Value=serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(report["status"],"unresolved"); assert_eq!(report["artifact"]["text"],text);
    assert_eq!(report["artifact_contract_verified"],false); assert!(report["publication"].is_null());
    assert_eq!(report["semantic_truth_verified"],false); assert_eq!(report["promotable"],false);
    assert_eq!(report["usage"]["spent"]["model_calls"],1);
    let completed:u64=fixture.database().query_row("SELECT COUNT(*) FROM rust_protocol_runs WHERE status='completed'",[],|row|row.get(0)).unwrap();
    assert_eq!(completed,0);
    let generation:u64=fixture.database().query_row("SELECT generation FROM protocol_gqwf_heads",[],|row|row.get(0)).unwrap();
    assert_eq!(generation,0); assert_eq!(fixture.calls(),1);
    report
}

impl Provider {
    fn start(response:Value) -> Self {
        let listener=TcpListener::bind("127.0.0.1:0").unwrap(); listener.set_nonblocking(true).unwrap();
        let address=listener.local_addr().unwrap();
        let state=Arc::new(ServerState { response,stop:AtomicBool::new(false),calls:AtomicUsize::new(0),requests:Mutex::new(Vec::new()) });
        let shared=state.clone(); let thread=std::thread::spawn(move ||server(listener,&shared));
        Self { address,state,thread:Some(thread) }
    }
}

impl Drop for Provider {
    fn drop(&mut self) {
        self.state.stop.store(true,Ordering::SeqCst);
        if let Some(thread)=self.thread.take() {
            let outcome=thread.join();
            if !std::thread::panicking() { assert!(matches!(outcome,Ok(Ok(()))),"HTTP fixture thread failed: {outcome:?}"); }
        }
    }
}

fn server(listener:TcpListener,state:&ServerState) -> Result<(),String> {
    while !state.stop.load(Ordering::SeqCst) {
        match listener.accept() {
            Ok((stream,_))=>serve(stream,state)?,
            Err(error) if error.kind()==std::io::ErrorKind::WouldBlock=>std::thread::sleep(std::time::Duration::from_millis(2)),
            Err(error)=>return Err(error.to_string()),
        }
    }
    Ok(())
}

fn serve(mut stream:TcpStream,state:&ServerState) -> Result<(),String> {
    stream.set_nonblocking(false).map_err(error)?;
    stream.set_read_timeout(Some(std::time::Duration::from_secs(10))).map_err(error)?;
    let request=read_request(&mut stream)?;
    state.requests.lock().unwrap().push(request); state.calls.fetch_add(1,Ordering::SeqCst);
    let body=serde_json::to_vec(&state.response).map_err(error)?;
    let header=format!("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",body.len());
    stream.write_all(header.as_bytes()).map_err(error)?; stream.write_all(&body).map_err(error)
}

fn read_request(stream:&mut TcpStream) -> Result<Value,String> {
    let mut bytes=Vec::new();
    loop {
        let mut buffer=[0;4096]; let count=stream.read(&mut buffer).map_err(error)?;
        if count==0 || bytes.len()+count>262144 { return Err("HTTP fixture incomplete or oversized request".into()); }
        bytes.extend_from_slice(&buffer[..count]);
        if let Some(body)=request_body(&bytes)? { return serde_json::from_slice(body).map_err(error); }
    }
}

fn request_body(bytes:&[u8]) -> Result<Option<&[u8]>,String> {
    let Some(end)=bytes.windows(4).position(|value|value==b"\r\n\r\n") else { return Ok(None); };
    let header=std::str::from_utf8(&bytes[..end]).map_err(error)?;
    if !header.starts_with("POST /api/chat HTTP/1.1\r\n") { return Err("unexpected native inference route".into()); }
    let length=content_length(header)?;
    if bytes.len()<end+4+length { return Ok(None); }
    Ok(Some(&bytes[end+4..end+4+length]))
}

fn content_length(header:&str) -> Result<usize,String> {
    header.lines().find_map(|line| {
        let (name,value)=line.split_once(':')?;
        name.eq_ignore_ascii_case("content-length").then(||value.trim().parse::<usize>().map_err(error))
    }).ok_or("HTTP fixture missing content length")?
}

fn error(error:impl std::fmt::Display) -> String { error.to_string() }

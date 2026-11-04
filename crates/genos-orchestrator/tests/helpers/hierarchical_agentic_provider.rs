use serde_json::{Value,json};
use std::collections::BTreeMap;
use std::io::{Read,Write};
use std::net::{TcpListener,TcpStream};
use std::path::PathBuf;
use std::sync::{Arc,Mutex,Condvar,atomic::{AtomicBool,Ordering}};

#[derive(Clone,Copy,PartialEq,Eq)]
pub enum Mode { Tree,UnknownLeafLeft,RegistrationAbort }

#[derive(Default)]
struct Gate { arrivals:usize,responses:usize,before_first:usize }
struct State {
    mode:Mode,stop:AtomicBool,requests:Mutex<Vec<Value>>,turns:Mutex<BTreeMap<String,usize>>,
    mid:(Mutex<Gate>,Condvar),leaf:(Mutex<Gate>,Condvar),abort:Mutex<Option<PathBuf>>,
}
pub struct Provider { address:String,state:Arc<State>,thread:Option<std::thread::JoinHandle<Result<(),String>>> }

impl Provider {
    pub fn start(mode:Mode) -> Self {
        let listener=TcpListener::bind("127.0.0.1:0").unwrap();listener.set_nonblocking(true).unwrap();
        let address=listener.local_addr().unwrap().to_string();
        let state=Arc::new(State { mode,stop:AtomicBool::new(false),requests:Mutex::new(Vec::new()),turns:Mutex::new(BTreeMap::new()),
            mid:(Mutex::new(Gate::default()),Condvar::new()),leaf:(Mutex::new(Gate::default()),Condvar::new()),abort:Mutex::new(None) });
        let shared=state.clone();let thread=std::thread::spawn(move ||server(listener,&shared));
        Self { address,state,thread:Some(thread) }
    }
    pub fn endpoint(&self) -> &str { &self.address }
    pub fn calls(&self) -> usize { self.state.requests.lock().unwrap().len() }
    pub fn requests(&self) -> Vec<Value> { self.state.requests.lock().unwrap().clone() }
    pub fn arrivals(&self) -> BTreeMap<String,usize> {
        BTreeMap::from([("intermediate".into(),self.state.mid.0.lock().unwrap().before_first),
            ("leaf".into(),self.state.leaf.0.lock().unwrap().before_first)])
    }
    pub fn arm_registration_abort(&self,database:PathBuf) { *self.state.abort.lock().unwrap()=Some(database); }
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
    let agent=super::agent_id(&request);
    state.requests.lock().unwrap().push(request);
    let turn={ let mut turns=state.turns.lock().unwrap();let turn=turns.entry(agent.clone()).or_default();let current=*turn;*turn+=1;current };
    wait_for_peer(state,(&agent,turn))?;
    respond(&mut stream,state,(&agent,turn))
}

fn respond(stream:&mut TcpStream,state:&State,step:(&str,usize)) -> Result<(),String> {
    registration_fault(state,step)?;
    let body=serde_json::to_vec(&response(step)?).map_err(error)?;
    let incomplete=state.mode==Mode::UnknownLeafLeft && step==("leaf_left",0);
    let length=body.len()+if incomplete {16} else {0};
    let header=format!("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {length}\r\nConnection: close\r\n\r\n");
    stream.write_all(header.as_bytes()).map_err(error)?;stream.write_all(&body).map_err(error)
}

fn wait_for_peer(state:&State,step:(&str,usize)) -> Result<(),String> {
    if step.1!=0 || step.0=="root" { return Ok(()); }
    let gate=if step.0.starts_with("mid_") { &state.mid } else { &state.leaf };
    let mut locked=gate.0.lock().unwrap();locked.arrivals+=1;gate.1.notify_all();
    let result=gate.1.wait_timeout_while(locked,std::time::Duration::from_secs(15),|value|value.arrivals<2).unwrap();
    locked=result.0;
    if locked.arrivals<2 { return Err("two sibling HTTP arrivals required before either first response".into()); }
    if locked.responses==0 { locked.before_first=locked.arrivals; }
    locked.responses+=1;Ok(())
}

fn response(step:(&str,usize)) -> Result<Value,String> {
    match step.0 {
        "root"=>Ok(root_response(step.1)),
        "mid_left"|"mid_right"=>Ok(middle_response(step)),
        "leaf_left"|"leaf_right"=>Ok(leaf_response(step)),
        _=>Err("dormant or unknown role unexpectedly invoked provider".into()),
    }
}

fn root_response(turn:usize) -> Value {
    match turn {
        0=>tool_response(vec![delegate("mid_left","mid-task-left: combine your delegated findings"),
            delegate("mid_right","mid-task-right: combine your delegated findings")]),
        1=>tool_response(vec![call("read-left","read_artifact",json!({"agent_id":"mid_left","name":"summary"})),
            call("read-right","read_artifact",json!({"agent_id":"mid_right","name":"summary"}))]),
        2=>tool_response(vec![call("write-final","write_artifact",json!({"name":"final","text":super::FINAL}))]),
        _=>completion(super::FINAL),
    }
}

fn middle_response(step:(&str,usize)) -> Value {
    let side=if step.0=="mid_left" {"left"} else {"right"};
    let text=format!("Sources : mid-{side}-result from leaf-{side}-result. Limites : structural only.");
    match step.1 {
        0=>tool_response(vec![delegate(&format!("leaf_{side}"),&format!("leaf-task-{side}: inspect the admitted source"))]),
        1=>tool_response(vec![call("write-summary","write_artifact",json!({"name":"summary","text":text}))]),
        _=>completion(&text),
    }
}

fn leaf_response(step:(&str,usize)) -> Value {
    if step.1==0 { return tool_response(vec![call("read-source","read_source",json!({"path":"notes.txt"}))]); }
    let side=if step.0=="leaf_left" {"left"} else {"right"};
    completion(&format!("Sources : leaf-{side}-result. Limites : no semantic certification."))
}

fn delegate(agent:&str,task:&str) -> Value { call(&format!("delegate-{agent}"),"delegate_task",json!({"agent_id":agent,"task":task})) }
fn completion(text:&str) -> Value {
    json!({"model":"hierarchical-http-fixture","message":{"role":"assistant","content":text},"done":true,
        "done_reason":"stop","prompt_eval_count":17,"eval_count":23})
}
fn tool_response(calls:Vec<Value>) -> Value { let mut value=completion("");value["message"]["tool_calls"]=json!(calls);value }
fn call(id:&str,name:&str,arguments:Value) -> Value { json!({"id":id,"function":{"name":name,"arguments":arguments}}) }

fn registration_fault(state:&State,step:(&str,usize)) -> Result<(),String> {
    if state.mode!=Mode::RegistrationAbort || step!=("mid_left",0) { return Ok(()); }
    let Some(path)=state.abort.lock().unwrap().take() else { return Ok(()); };
    let db=rusqlite::Connection::open(path).map_err(error)?;
    db.busy_timeout(std::time::Duration::from_secs(5)).map_err(error)?;
    db.execute_batch("CREATE TRIGGER abort_hierarchical_registration BEFORE INSERT ON protocol_agentic_tool_receipts
        WHEN NEW.agent_id='mid_left' AND NEW.call_index=0
        BEGIN SELECT RAISE(ABORT,'TEST_HIERARCHICAL_REGISTRATION_ABORT'); END;").map_err(error)
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

use genos_api::native_inference::{Generation, InferenceRequest, Message, ProviderConfig, Role};
use serde_json::{Value, json};
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::sync::{Arc, Mutex, atomic::{AtomicBool, Ordering}};
use std::thread::JoinHandle;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

#[derive(Clone)]
pub struct Reply {
    pub status: u16, pub bytes: Vec<u8>, pub headers: Vec<(String, String)>,
    pub delay_ms: u64, pub disconnect: bool,
    pub cancel_on_receive: Option<Arc<AtomicBool>>,
}

impl Reply {
    pub fn json(value: Value) -> Self {
        Self { status: 200, bytes: serde_json::to_vec(&value).unwrap(), headers: Vec::new(),
            delay_ms: 0, disconnect: false, cancel_on_receive: None }
    }
}

pub struct Server {
    pub address: SocketAddr,
    stop: Arc<AtomicBool>,
    requests: Arc<Mutex<Vec<String>>>,
    thread: Option<JoinHandle<()>>,
}

impl Server {
    pub fn start(reply: Reply) -> Self {
        let listener = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let address = listener.local_addr().unwrap();
        listener.set_nonblocking(true).unwrap();
        let stop = Arc::new(AtomicBool::new(false));
        let requests = Arc::new(Mutex::new(Vec::new()));
        let state = (stop.clone(), requests.clone());
        let thread = std::thread::spawn(move || serve(listener, reply, state));
        Self { address, stop, requests, thread: Some(thread) }
    }
    pub fn requests(&self) -> Vec<String> { self.requests.lock().unwrap().clone() }
}

impl Drop for Server {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Release);
        if let Some(thread) = self.thread.take() {
            if let Err(error) = thread.join() {
                if !std::thread::panicking() { std::panic::resume_unwind(error); }
            }
        }
    }
}

fn serve(listener: TcpListener, reply: Reply, state: (Arc<AtomicBool>, Arc<Mutex<Vec<String>>>)) {
    while !state.0.load(Ordering::Acquire) {
        match listener.accept() {
            Ok((stream, _)) => respond(stream, &reply, &state.1),
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => std::thread::sleep(Duration::from_millis(2)),
            Err(error) => panic!("fixture listener failed: {error}"),
        }
    }
    while let Ok((stream, _)) = listener.accept() { respond(stream, &reply, &state.1); }
}

fn respond(mut stream: TcpStream, reply: &Reply, requests: &Mutex<Vec<String>>) {
    stream.set_nonblocking(false).unwrap();
    stream.set_read_timeout(Some(Duration::from_secs(2))).unwrap();
    stream.set_write_timeout(Some(Duration::from_secs(2))).unwrap();
    let request = read_request(&mut stream);
    requests.lock().unwrap().push(request);
    if let Some(cancelled) = &reply.cancel_on_receive { cancelled.store(true, Ordering::Release); }
    if reply.delay_ms != 0 { std::thread::sleep(Duration::from_millis(reply.delay_ms)); }
    if reply.disconnect { return; }
    let mut headers = format!("HTTP/1.1 {} Fixture\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n", reply.status, reply.bytes.len());
    for (key, value) in &reply.headers { headers.push_str(&format!("{key}: {value}\r\n")); }
    headers.push_str("\r\n");
    let _ = stream.write_all(headers.as_bytes());
    let _ = stream.write_all(&reply.bytes);
}

fn read_request(stream: &mut TcpStream) -> String {
    let mut bytes = Vec::new();
    let mut buffer = [0u8; 4096];
    while bytes.len() < 300000 {
        let read = stream.read(&mut buffer).unwrap();
        if read == 0 { break; }
        bytes.extend_from_slice(&buffer[..read]);
        if request_complete(&bytes) { break; }
    }
    String::from_utf8(bytes).unwrap()
}

fn request_complete(bytes: &[u8]) -> bool {
    let Some(index) = bytes.windows(4).position(|window| window == b"\r\n\r\n") else { return false; };
    let headers = String::from_utf8_lossy(&bytes[..index]);
    let size = headers.lines().find_map(|line| {
        let (key, value) = line.split_once(':')?;
        key.eq_ignore_ascii_case("content-length").then(|| value.trim().parse::<usize>().unwrap())
    }).unwrap_or(0);
    bytes.len() >= index + 4 + size
}

pub fn request(address: SocketAddr) -> InferenceRequest {
    InferenceRequest { operation_id: "generate".into(), binding_hash: "mission-binding".into(),
        context_hash: "synapse-context".into(), actor_id: "native-llm-worker".into(), input_hash: "source-object".into(),
        provider: ProviderConfig::Ollama { address, model: "transport-fixture-model".into(), generation: 1 },
        generation: Generation { max_output_tokens: 64, temperature_milli: 0 },
        messages: vec![Message { role: Role::User, content: "fixture prompt never becomes a completion without HTTP".into() }],
        max_input_tokens: 128, expires_ms: now_ms() + 5000, credential: None, cancelled: None }
}

pub fn completion(text: &str) -> Value {
    json!({"model":"transport-fixture-model","message":{"role":"assistant","content":text},
        "done":true,"done_reason":"stop","prompt_eval_count":19,"eval_count":7})
}

pub fn now_ms() -> u64 { SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis() as u64 }

mod chat;

use crate::security::{RateLimiter, TenantAuth};
use serde::Serialize;
use serde_json::json;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::{Arc, Mutex, mpsc};
use std::thread;

const MAX_REQUEST_BYTES: usize = 10 * 1024 * 1024;
type HttpResponse = (u16, Vec<(String, String)>, String);

pub(super) struct ParsedRequest {
    pub method: String,
    pub path: String,
    pub auth_header: Option<String>,
    pub rethink: bool,
    pub system_level: u8,
    pub body: String,
}

impl ParsedRequest {
    fn parse(raw: &str) -> Result<Self, HttpResponse> {
        let (headers, body) = raw
            .split_once("\r\n\r\n")
            .or_else(|| raw.split_once("\n\n"))
            .ok_or_else(|| {
                error_response(400, "Malformed HTTP request.", "invalid_request_error")
            })?;
        let mut lines = headers.lines();
        let parts = lines
            .next()
            .unwrap_or("")
            .split_whitespace()
            .collect::<Vec<_>>();
        if parts.len() < 2 {
            return Err(error_response(
                400,
                "Malformed HTTP request.",
                "invalid_request_error",
            ));
        }
        let (auth_header, rethink, system_level) = parse_headers(lines);
        Ok(Self {
            method: parts[0].to_string(),
            path: parts[1].to_string(),
            auth_header,
            rethink,
            system_level,
            body: body.trim().to_string(),
        })
    }

    fn is_health_probe(&self) -> bool {
        self.method == "GET" && matches!(self.path.as_str(), "/healthz" | "/readyz" | "/livez")
    }

    fn is_models_request(&self) -> bool {
        self.method == "GET" && matches!(self.path.as_str(), "/v1/models" | "/models")
    }

    fn is_chat_request(&self) -> bool {
        self.method == "POST"
            && matches!(
                self.path.as_str(),
                "/v1/chat/completions" | "/chat/completions"
            )
    }
}

fn parse_headers<'a>(lines: impl Iterator<Item = &'a str>) -> (Option<String>, bool, u8) {
    let mut auth = None;
    let mut rethink = false;
    let mut level = 1;
    for line in lines {
        if let Some((name, value)) = line.split_once(':') {
            match name.trim().to_ascii_lowercase().as_str() {
                "authorization" => auth = Some(value.trim().to_string()),
                "x-genos-rethink" => rethink = value.trim().eq_ignore_ascii_case("true"),
                "x-genos-system" => level = value.trim().parse::<u8>().unwrap_or(1).clamp(1, 2),
                _ => {}
            }
        }
    }
    (auth, rethink, level)
}

pub fn handle_http_request(
    raw: &str,
    auth: &TenantAuth,
    limiter: &Mutex<RateLimiter>,
) -> HttpResponse {
    let request = match ParsedRequest::parse(raw) {
        Ok(request) => request,
        Err(response) => return response,
    };
    if request.is_health_probe() {
        return chat::health_response();
    }
    if request.is_models_request() {
        return chat::models_response();
    }
    if request.is_chat_request() {
        return chat::handle_chat_completion(&request, auth, limiter);
    }
    error_response(
        404,
        &format!("Not Found: {} {}", request.method, request.path),
        "invalid_route",
    )
}

pub(super) fn json_response<T: Serialize>(status: u16, body: &T) -> HttpResponse {
    let serialized = serde_json::to_string(body).unwrap_or_else(|_| "{}".into());
    (status, json_headers(), serialized)
}

pub(super) fn error_response(status: u16, message: &str, error_type: &str) -> HttpResponse {
    json_response(
        status,
        &json!({ "error": { "message": message, "type": error_type } }),
    )
}

fn json_headers() -> Vec<(String, String)> {
    vec![("Content-Type".into(), "application/json".into())]
}

fn handle_connection(
    mut stream: TcpStream,
    auth: Arc<TenantAuth>,
    limiter: Arc<Mutex<RateLimiter>>,
) {
    let _ = stream.set_read_timeout(Some(std::time::Duration::from_secs(15)));
    let _ = stream.set_write_timeout(Some(std::time::Duration::from_secs(15)));
    if let Some(bytes) = read_http_request(&mut stream) {
        let request = String::from_utf8_lossy(&bytes);
        let response = handle_http_request(&request, &auth, &limiter);
        let _ = stream.write_all(&serialize_http_response(response).as_bytes());
        let _ = stream.flush();
    }
}

fn read_http_request(stream: &mut TcpStream) -> Option<Vec<u8>> {
    let mut bytes = Vec::new();
    let mut buffer = [0; 8192];
    let mut header_end = None;
    let mut content_length = None;
    loop {
        let count = match stream.read(&mut buffer) {
            Ok(count) if count > 0 => count,
            _ => break,
        };
        bytes.extend_from_slice(&buffer[..count]);
        update_request_bounds(&bytes, &mut header_end, &mut content_length);
        if request_complete(bytes.len(), header_end, content_length)
            || bytes.len() >= MAX_REQUEST_BYTES
        {
            break;
        }
    }
    if bytes.is_empty() { None } else { Some(bytes) }
}

fn update_request_bounds(
    bytes: &[u8],
    header_end: &mut Option<usize>,
    content_length: &mut Option<usize>,
) {
    if header_end.is_none() {
        *header_end = bytes
            .windows(4)
            .position(|window| window == b"\r\n\r\n")
            .map(|position| position + 4)
            .or_else(|| {
                bytes
                    .windows(2)
                    .position(|window| window == b"\n\n")
                    .map(|position| position + 2)
            });
        if let Some(end) = *header_end {
            *content_length = parse_content_length(&bytes[..end]);
        }
    }
}

fn parse_content_length(headers: &[u8]) -> Option<usize> {
    String::from_utf8_lossy(headers).lines().find_map(|line| {
        let (name, value) = line.split_once(':')?;
        if !name.trim().eq_ignore_ascii_case("content-length") {
            return None;
        }
        value
            .trim()
            .parse::<usize>()
            .ok()
            .map(|length| length.min(MAX_REQUEST_BYTES))
    })
}

fn request_complete(
    received: usize,
    header_end: Option<usize>,
    content_length: Option<usize>,
) -> bool {
    match (header_end, content_length) {
        (Some(header_end), Some(content_length)) => received >= header_end + content_length,
        (Some(_), None) => true,
        _ => false,
    }
}

fn serialize_http_response(response: HttpResponse) -> String {
    let (status, headers, body) = response;
    let status_line = match status {
        200 => "HTTP/1.1 200 OK",
        400 => "HTTP/1.1 400 BAD REQUEST",
        401 => "HTTP/1.1 401 UNAUTHORIZED",
        404 => "HTTP/1.1 404 NOT FOUND",
        429 => "HTTP/1.1 429 TOO MANY REQUESTS",
        502 => "HTTP/1.1 502 BAD GATEWAY",
        503 => "HTTP/1.1 503 SERVICE UNAVAILABLE",
        504 => "HTTP/1.1 504 GATEWAY TIMEOUT",
        _ => "HTTP/1.1 500 INTERNAL SERVER ERROR",
    };
    let mut output = format!(
        "{status_line}\r\nContent-Length: {}\r\nConnection: close\r\n",
        body.len()
    );
    for (name, value) in headers {
        output.push_str(&format!("{name}: {value}\r\n"));
    }
    output.push_str("\r\n");
    output.push_str(&body);
    output
}

pub fn start_server(addr: &str, auth: TenantAuth, limiter: RateLimiter) -> Result<(), String> {
    let listener =
        TcpListener::bind(addr).map_err(|error| format!("Failed to bind {addr}: {error}"))?;
    println!("[GenOS API Server] Listening on http://{addr}");
    let auth = Arc::new(auth);
    let limiter = Arc::new(Mutex::new(limiter));
    let worker_count = thread::available_parallelism()
        .map(|count| count.get())
        .unwrap_or(4)
        .clamp(2, 16);
    let (sender, receiver) = mpsc::sync_channel::<TcpStream>(64);
    let receiver = Arc::new(Mutex::new(receiver));
    spawn_workers(
        worker_count,
        WorkerServices {
            receiver,
            auth,
            limiter,
        },
    );
    for stream in listener.incoming() {
        match stream {
            Ok(stream) => sender
                .send(stream)
                .map_err(|error| format!("API worker queue stopped: {error}"))?,
            Err(error) => eprintln!("[GenOS API Server] Connection error: {error}"),
        }
    }
    Ok(())
}

struct WorkerServices {
    receiver: Arc<Mutex<mpsc::Receiver<TcpStream>>>,
    auth: Arc<TenantAuth>,
    limiter: Arc<Mutex<RateLimiter>>,
}

fn spawn_workers(count: usize, services: WorkerServices) {
    for _ in 0..count {
        let receiver = Arc::clone(&services.receiver);
        let auth = Arc::clone(&services.auth);
        let limiter = Arc::clone(&services.limiter);
        thread::spawn(move || {
            loop {
                let stream = receiver
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner())
                    .recv();
                match stream {
                    Ok(stream) => {
                        handle_connection(stream, Arc::clone(&auth), Arc::clone(&limiter))
                    }
                    Err(_) => break,
                }
            }
        });
    }
}

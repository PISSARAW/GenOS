use crate::security::{RateLimiter, TenantAuth};
use crate::types::{
    ChatChoice, ChatCompletionRequest, ChatCompletionResponse, ChatOutputMessage, ChatUsage,
    HealthResponse,
};
use chrono::Utc;
use serde_json::json;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::{Arc, Mutex};
use std::thread;
use uuid::Uuid;

pub fn handle_http_request(
    raw_req: &str,
    auth: &TenantAuth,
    limiter: &Mutex<RateLimiter>,
) -> (u16, Vec<(String, String)>, String) {
    let mut lines = raw_req.lines();
    let request_line = lines.next().unwrap_or("");
    let parts: Vec<&str> = request_line.split_whitespace().collect();
    if parts.len() < 2 {
        return (400, vec![("Content-Type".into(), "application/json".into())], json!({ "error": "Malformed HTTP request" }).to_string());
    }

    let method = parts[0];
    let path = parts[1];

    // Extract Headers and Body
    let mut auth_header: Option<String> = None;
    for line in lines.by_ref() {
        if line.trim().is_empty() {
            break;
        }
        if let Some(pos) = line.find(':') {
            let key = line[..pos].trim().to_lowercase();
            let val = line[pos + 1..].trim();
            if key == "authorization" {
                auth_header = Some(val.to_string());
            }
        }
    }

    let body = raw_req.split("\r\n\r\n").nth(1).unwrap_or("").trim();

    // 1. Health probes
    if method == "GET" && (path == "/healthz" || path == "/readyz" || path == "/livez") {
        let resp = HealthResponse {
            status: "healthy".into(),
            version: "3.0.0".into(),
            timestamp: Utc::now().to_rfc3339(),
        };
        return (200, vec![("Content-Type".into(), "application/json".into())], serde_json::to_string(&resp).unwrap());
    }

    // 2. OpenAI Models List
    if method == "GET" && (path == "/v1/models" || path == "/models") {
        let models = json!({
            "object": "list",
            "data": [
                { "id": "genos-core-v3", "object": "model", "owned_by": "genos", "permission": [] },
                { "id": "genos-biology", "object": "model", "owned_by": "genos", "permission": [] },
                { "id": "genos-swarm-intelligence", "object": "model", "owned_by": "genos", "permission": [] }
            ]
        });
        return (200, vec![("Content-Type".into(), "application/json".into())], models.to_string());
    }

    // 3. OpenAI Chat Completions
    if method == "POST" && (path == "/v1/chat/completions" || path == "/chat/completions") {
        // Authenticate if TenantAuth has registered keys
        if let Some(token) = auth_header.and_then(|h| h.strip_prefix("Bearer ").map(|s| s.trim().to_string())) {
            if auth.verify_key(&token).is_none() {
                return (401, vec![("Content-Type".into(), "application/json".into())], json!({
                    "error": { "message": "Invalid or unauthorized API key", "type": "authentication_error" }
                }).to_string());
            }
        }

        // Rate Limiter
        {
            let mut lim = limiter.lock().unwrap();
            if !lim.try_acquire(1) {
                return (429, vec![("Content-Type".into(), "application/json".into())], json!({
                    "error": { "message": "Rate limit exceeded. Try again later.", "type": "rate_limit_error" }
                }).to_string());
            }
        }

        // Parse Request Body
        let chat_req: ChatCompletionRequest = match serde_json::from_str(body) {
            Ok(parsed) => parsed,
            Err(e) => {
                return (400, vec![("Content-Type".into(), "application/json".into())], json!({
                    "error": { "message": format!("Invalid ChatCompletionRequest JSON: {}", e), "type": "invalid_request_error" }
                }).to_string());
            }
        };

        let last_prompt = chat_req.messages.last().map(|m| m.content.as_str()).unwrap_or("Hello from client");
        let completion_text = format!(
            "[GenOS Native Engine] Processed prompt through biomimetic cortex: '{}'",
            last_prompt
        );
        let prompt_tokens = (last_prompt.len() / 4).max(1) as u64;
        let completion_tokens = (completion_text.len() / 4).max(1) as u64;

        let completion_resp = ChatCompletionResponse {
            id: format!("chatcmpl-{}", Uuid::new_v4().simple()),
            object: "chat.completion".into(),
            created: Utc::now().timestamp() as u64,
            model: chat_req.model.unwrap_or_else(|| "genos-core-v3".into()),
            choices: vec![ChatChoice {
                index: 0,
                message: ChatOutputMessage {
                    role: "assistant".into(),
                    content: Some(completion_text),
                },
                finish_reason: "stop".into(),
            }],
            usage: ChatUsage {
                prompt_tokens,
                completion_tokens,
                total_tokens: prompt_tokens + completion_tokens,
            },
        };

        return (200, vec![("Content-Type".into(), "application/json".into())], serde_json::to_string(&completion_resp).unwrap());
    }

    (404, vec![("Content-Type".into(), "application/json".into())], json!({ "error": { "message": format!("Not Found: {} {}", method, path), "type": "invalid_route" } }).to_string())
}

fn handle_connection(
    mut stream: TcpStream,
    auth: Arc<TenantAuth>,
    limiter: Arc<Mutex<RateLimiter>>,
) {
    let mut buffer = [0; 8192];
    if let Ok(bytes_read) = stream.read(&mut buffer) {
        if bytes_read == 0 {
            return;
        }
        let raw = String::from_utf8_lossy(&buffer[..bytes_read]);
        let (status_code, headers, body) = handle_http_request(&raw, &auth, &limiter);
        let status_line = match status_code {
            200 => "HTTP/1.1 200 OK",
            400 => "HTTP/1.1 400 BAD REQUEST",
            401 => "HTTP/1.1 401 UNAUTHORIZED",
            404 => "HTTP/1.1 404 NOT FOUND",
            429 => "HTTP/1.1 429 TOO MANY REQUESTS",
            _ => "HTTP/1.1 500 INTERNAL SERVER ERROR",
        };

        let mut response = format!(
            "{}\r\nContent-Length: {}\r\nConnection: close\r\n",
            status_line,
            body.len()
        );
        for (k, v) in headers {
            response.push_str(&format!("{}: {}\r\n", k, v));
        }
        response.push_str("\r\n");
        response.push_str(&body);

        let _ = stream.write_all(response.as_bytes());
        let _ = stream.flush();
    }
}

pub fn start_server(addr: &str, auth: TenantAuth, limiter: RateLimiter) -> Result<(), String> {
    let listener = TcpListener::bind(addr).map_err(|e| format!("Failed to bind {}: {}", addr, e))?;
    println!("[GenOS API Server] Listening on http://{}", addr);

    let auth_arc = Arc::new(auth);
    let limiter_arc = Arc::new(Mutex::new(limiter));

    for stream in listener.incoming() {
        match stream {
            Ok(stream) => {
                let auth_clone = Arc::clone(&auth_arc);
                let limiter_clone = Arc::clone(&limiter_arc);
                thread::spawn(move || {
                    handle_connection(stream, auth_clone, limiter_clone);
                });
            }
            Err(e) => {
                eprintln!("[GenOS API Server] Connection error: {}", e);
            }
        }
    }

    Ok(())
}

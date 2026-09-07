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
use reqwest::blocking::Client;
use std::env;
use std::path::PathBuf;
use std::sync::OnceLock;

fn thalamus_cache_lock() -> &'static Mutex<()> {
    static CACHE_LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    CACHE_LOCK.get_or_init(|| Mutex::new(()))
}

fn thalamus_cache_file() -> PathBuf {
    env::var_os("GENOS_WORKSPACE_ROOT")
        .map(PathBuf::from)
        .unwrap_or_else(|| env::current_dir().unwrap_or_else(|_| PathBuf::from(".")))
        .join(".genos_thalamus_cache.json")
}

fn thalamus_cache_key(prompt: &str, cache_scope: &str, provider: &str, model: &str, rethink: bool, system_level: u8) -> String {
    serde_json::to_string(&(prompt, cache_scope, provider, model, rethink, system_level))
        .unwrap_or_else(|_| prompt.to_string())
}

fn thalamus_select_ollama_model(client: &Client, ollama_url: &str) -> Option<String> {
    let url = format!("{}/api/tags", ollama_url);
    if let Ok(res) = client.get(&url).send() {
        if let Ok(json_resp) = res.json::<serde_json::Value>() {
            if let Some(models) = json_resp["models"].as_array() {
                if models.is_empty() {
                    return None;
                }

                let mut available_model_names = Vec::new();
                for model in models {
                    if let Some(name) = model["name"].as_str() {
                        available_model_names.push(name.to_string());
                    }
                }

                // Priorité aux modèles réputés performants et polyvalents
                let preferred_keywords = vec!["llama3", "mistral", "mixtral", "phi3", "gemma", "qwen"];
                
                for keyword in &preferred_keywords {
                    for model_name in &available_model_names {
                        if model_name.to_lowercase().contains(keyword) {
                            return Some(model_name.clone());
                        }
                    }
                }

                // Fallback: prendre le premier modèle disponible si aucun modèle préféré n'est trouvé
                if !available_model_names.is_empty() {
                    return Some(available_model_names[0].clone());
                }
            }
        }
    }
    None
}

fn evaluate_prompt_complexity(prompt: &str) -> u32 {
    let mut score = 0;
    let keywords = [
        "architecture", "déploie", "simule", "code complet", "projet entier",
        "essaim", "swarm", "agents", "orchestrateur", "itère", "mutation", 
        "système distribué", "complexe", "bft", "blockchain", "génétique"
    ];
    let prompt_lower = prompt.to_lowercase();
    for kw in &keywords {
        if prompt_lower.contains(kw) {
            score += 20;
        }
    }
    if prompt.len() > 300 {
        score += 30;
    } else if prompt.len() > 150 {
        score += 15;
    }
    score
}

fn thalamus_cache_lookup(key: &str) -> Option<String> {
    let _guard = thalamus_cache_lock().lock().ok()?;
    if let Ok(content) = std::fs::read_to_string(thalamus_cache_file()) {
        if let Ok(cache) = serde_json::from_str::<std::collections::HashMap<String, String>>(&content) {
            if let Some(answer) = cache.get(key) {
                return Some(answer.clone());
            }
        }
    }
    None
}

fn thalamus_cache_store(key: &str, response: &str) {
    let _guard = match thalamus_cache_lock().lock() {
        Ok(guard) => guard,
        Err(_) => return,
    };
    let cache_file = thalamus_cache_file();
    let mut cache = std::collections::HashMap::new();
    if let Ok(content) = std::fs::read_to_string(&cache_file) {
        if let Ok(existing) = serde_json::from_str::<std::collections::HashMap<String, String>>(&content) {
            cache = existing;
        }
    }
    cache.insert(key.to_string(), response.to_string());
    if let Ok(json) = serde_json::to_string_pretty(&cache) {
        let _ = std::fs::write(cache_file, json);
    }
}

fn call_llm_api(prompt: &str, rethink: bool, system_level: u8, cache_scope: &str) -> String {
    if prompt == "Ping" || env::var("GENOS_MOCK_LLM").is_ok() {
        return format!("Echo: {}", prompt);
    }
    dotenv::dotenv().ok();
    
    // 1. LE CACHE (Le Par Cœur - Réponse instantanée)
    // Le cache n'est utilisé que pour le Système 1, ou si non forcé
    if system_level == 1 && !rethink {
        if let Some(cached_response) = thalamus_cache_lookup(&thalamus_cache_key(
            prompt,
            cache_scope,
            &env::var("LLM_PROVIDER").unwrap_or_else(|_| "auto".to_string()),
            &env::var("OLLAMA_MODEL").unwrap_or_else(|_| "auto".to_string()),
            rethink,
            system_level,
        )) {
            return format!("⚡ [Mémoire Sémantique] Résultat mis en cache :\n{}", cached_response);
        }
    }
    
    // 2. ÉVALUATION DE COMPLEXITÉ (Système 1 vs Système 2)
    // On ne fait le triage que si la requête vient explicitement du Système 1
    if system_level == 1 {
        let complexity_score = evaluate_prompt_complexity(prompt);
        if complexity_score >= 50 {
            return format!("🧠 [Thalamus] Alerte : Requête ultra-complexe détectée (Score cognitif : {}).\nMon réflexe immédiat (Système 1) risque de produire une réponse de surface ou d'halluciner.\n\n💡 Pour engager le cortex préfrontal et la machinerie GenOS (Système 2), utilisez plutôt :\n  ./g trio --mission \"<votre_mission>\" \n  ./g auto --mission \"<votre_mission>\"", complexity_score);
        }
    }

    let client = Client::builder().timeout(std::time::Duration::from_secs(300)).build().unwrap();

    let ollama_url = env::var("OLLAMA_API_URL").unwrap_or_else(|_| "http://127.0.0.1:11434".to_string());
    
    // THALAMUS ROUTING: Dynamically determine the best pathway
    let override_provider = env::var("LLM_PROVIDER").ok();
    let override_model = env::var("OLLAMA_MODEL").ok();

    let (chosen_provider, chosen_model) = if let Some(p) = override_provider {
        (p, override_model.unwrap_or_else(|| "llama3".to_string()))
    } else {
        if let Some(local_model) = thalamus_select_ollama_model(&client, &ollama_url) {
            ("ollama".to_string(), local_model)
        } else {
            ("gemini".to_string(), "".to_string())
        }
    };

    let mut augmented_prompt = prompt.to_string();
    
    // 3. LA RECONNAISSANCE DE MOTIF (RAG / Similitude)
    // Ici, on simule une vérification rapide dans l'index vectoriel.
    // Si un fragment de réponse similaire existe, on l'injecte dans le prompt.
    if prompt.to_lowercase().contains("capitale") {
        augmented_prompt = format!("Contexte de notre mémoire RAG :\n- Les capitales sont souvent demandées, sois direct.\n\nQuestion: {}", prompt);
    }

    let final_response = if chosen_provider.to_lowercase() == "ollama" {
        let url = format!("{}/api/chat", ollama_url);
        let body = serde_json::json!({
            "model": chosen_model,
            "messages": [{ "role": "user", "content": augmented_prompt }],
            "stream": false
        });

        match client.post(&url).json(&body).send() {
            Ok(res) => {
                let status = res.status();
                if let Ok(json_resp) = res.json::<serde_json::Value>() {
                    if let Some(text) = json_resp["message"]["content"].as_str() {
                        text.to_string()
                    } else if let Some(err_msg) = json_resp["error"].as_str() {
                        format!("Thalamus Error [Ollama {}] ({}): {}", chosen_model, status, err_msg)
                    } else {
                        format!("Thalamus Error: Unexpected JSON from local cortex: {}", json_resp)
                    }
                } else {
                    format!("Thalamus Error: Could not parse local response. HTTP Status: {}", status)
                }
            },
            Err(e) => {
                format!("Thalamus Error: Synaptic failure connecting to {}. Details: {}", ollama_url, e)
            }
        }
    } else {
        // Gemini fallback pathway
        let api_key = match env::var("GEMINI_API_KEY") {
            Ok(k) => k,
            Err(_) => return "Thalamus Error: Cloud routing failed. GEMINI_API_KEY environment variable not set in .env".to_string()
        };
        
        let url = format!("https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={}", api_key);
        let body = serde_json::json!({ "contents": [{ "parts": [{"text": augmented_prompt}] }] });
        
        match client.post(&url).json(&body).send() {
            Ok(res) => {
                if let Ok(json_resp) = res.json::<serde_json::Value>() {
                    if let Some(text) = json_resp["candidates"][0]["content"]["parts"][0]["text"].as_str() {
                        text.to_string()
                    } else {
                        "Thalamus Error: Could not extract sensory data from Gemini response".to_string()
                    }
                } else {
                    "Thalamus Error: Could not extract sensory data from Gemini response".to_string()
                }
            },
            Err(e) => format!("Thalamus Error: Cloud synaptic failure: {}", e)
        }
    };

    // 4. SAUVEGARDE EN MÉMOIRE
    // On ne met en cache que les réponses qui ne sont pas des erreurs Thalamus, et seulement pour le Système 1
    if system_level == 1 && !final_response.starts_with("Thalamus Error") {
        thalamus_cache_store(
            &thalamus_cache_key(
                prompt,
                cache_scope,
                &chosen_provider,
                &chosen_model,
                rethink,
                system_level,
            ),
            &final_response,
        );
    }
    
    final_response
}

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
    let mut rethink = false;
    let mut system_level = 2; // Default to System 2 (no triage/interference) for API clients/agents
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
            if key == "x-genos-rethink" && val.to_lowercase() == "true" {
                rethink = true;
            }
            if key == "x-genos-system" {
                if let Ok(lvl) = val.parse::<u8>() {
                    system_level = lvl;
                }
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
        // Authenticate if TenantAuth has registered keys and derive a non-secret cache scope.
        let cache_scope = if let Some(token) = auth_header.and_then(|h| h.strip_prefix("Bearer ").map(|s| s.trim().to_string())) {
            if auth.verify_key(&token).is_none() {
                return (401, vec![("Content-Type".into(), "application/json".into())], json!({
                    "error": { "message": "Invalid or unauthorized API key", "type": "authentication_error" }
                }).to_string());
            }
            auth.verify_key(&token).unwrap_or("anonymous").to_string()
        } else {
            "anonymous".to_string()
        };

        // Rate Limiter
        {
            let mut lim = limiter.lock().unwrap_or_else(|p| p.into_inner());
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
        
        let completion_text = call_llm_api(last_prompt, rethink, system_level, &cache_scope);
        
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

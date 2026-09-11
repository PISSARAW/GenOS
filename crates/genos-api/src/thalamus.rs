use reqwest::blocking::Client;
use std::env;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

fn thalamus_cache_lock() -> &'static Mutex<()> {
    static CACHE_LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    CACHE_LOCK.get_or_init(|| Mutex::new(()))
}

fn thalamus_cache_file() -> PathBuf {
    if let Some(path) = env::var_os("GENOS_THALAMUS_CACHE") {
        return PathBuf::from(path);
    }
    env::var_os("GENOS_WORKSPACE_ROOT")
        .map(PathBuf::from)
        .unwrap_or_else(|| env::current_dir().unwrap_or_else(|_| PathBuf::from(".")))
        .join(".genos_thalamus_cache.json")
}

pub struct ThalamusCacheKey<'a> {
    pub prompt: &'a str,
    pub cache_scope: &'a str,
    pub provider: &'a str,
    pub model: &'a str,
    pub rethink: bool,
    pub system_level: u8,
}

pub fn thalamus_cache_key(k: &ThalamusCacheKey) -> String {
    serde_json::to_string(&(k.prompt, k.cache_scope, k.provider, k.model, k.rethink, k.system_level))
        .unwrap_or_else(|_| k.prompt.to_string())
}

fn find_preferred_model(names: &[String]) -> Option<String> {
    let custom_pref = env::var("GENOS_PREFERRED_MODELS").ok();
    let preferred_list: Vec<String> = custom_pref
        .as_deref()
        .map(|s| s.split(',').map(|w| w.trim().to_lowercase()).filter(|w| !w.is_empty()).collect())
        .unwrap_or_else(|| vec!["llama3".into(), "mistral".into(), "mixtral".into(), "phi3".into(), "gemma".into(), "qwen".into()]);

    for keyword in &preferred_list {
        for name in names {
            if name.to_lowercase().contains(keyword) {
                return Some(name.clone());
            }
        }
    }
    names.first().cloned()
}

pub fn thalamus_select_ollama_model(client: &Client, ollama_url: &str) -> Option<String> {
    let url = format!("{}/api/tags", ollama_url);
    let res = client.get(&url).send().ok()?;
    let json_resp: serde_json::Value = res.json().ok()?;
    let models = json_resp["models"].as_array()?;
    let names: Vec<String> = models.iter().filter_map(|m| m["name"].as_str().map(String::from)).collect();
    find_preferred_model(&names)
}

pub fn evaluate_prompt_complexity(prompt: &str) -> u32 {
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

pub fn thalamus_cache_lookup(key: &str) -> Option<String> {
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

pub fn thalamus_cache_store(key: &str, response: &str) {
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

pub fn call_llm_api(prompt: &str, rethink: bool, system_level: u8, cache_scope: &str) -> String {
    if prompt == "Ping" || env::var("GENOS_MOCK_LLM").is_ok() {
        return format!("Echo: {}", prompt);
    }
    dotenv::dotenv().ok();
    
    // 1. Cache lookup
    if system_level == 1 && !rethink {
        let provider_env = env::var("LLM_PROVIDER").unwrap_or_else(|_| "auto".to_string());
        let model_env = env::var("OLLAMA_MODEL").unwrap_or_else(|_| "auto".to_string());
        let cache_key = thalamus_cache_key(&ThalamusCacheKey {
            prompt,
            cache_scope,
            provider: &provider_env,
            model: &model_env,
            rethink,
            system_level,
        });
        if let Some(cached_response) = thalamus_cache_lookup(&cache_key) {
            return format!("⚡ [Mémoire Sémantique] Résultat mis en cache :\n{}", cached_response);
        }
    }
    
    // 2. Complexity check
    if system_level == 1 {
        let complexity_score = evaluate_prompt_complexity(prompt);
        let threshold = env::var("GENOS_COMPLEXITY_THRESHOLD")
            .ok()
            .and_then(|v| v.parse::<u32>().ok())
            .unwrap_or(50);
        if complexity_score >= threshold {
            return format!("🧠 [Thalamus] Alerte : Requête ultra-complexe détectée (Score cognitif : {}).\nMon réflexe immédiat (Système 1) risque de produire une réponse de surface ou d'halluciner.\n\n💡 Pour engager le cortex préfrontal et la machinerie GenOS (Système 2), utilisez plutôt :\n  ./g trio --mission \"<votre_mission>\" \n  ./g auto --mission \"<votre_mission>\"", complexity_score);
        }
    }

    let client = Client::builder().timeout(std::time::Duration::from_secs(300)).build().unwrap();
    let ollama_url = env::var("GENOS_OLLAMA_URL")
        .or_else(|_| env::var("OLLAMA_API_URL"))
        .unwrap_or_else(|_| "http://127.0.0.1:11434".to_string());
    let override_provider = env::var("LLM_PROVIDER").ok();
    let override_model = env::var("OLLAMA_MODEL").ok();

    let (chosen_provider, chosen_model) = if let Some(p) = override_provider {
        let def_ollama = env::var("GENOS_DEFAULT_OLLAMA_MODEL").unwrap_or_else(|_| "llama3".to_string());
        (p, override_model.unwrap_or(def_ollama))
    } else if let Some(local_model) = thalamus_select_ollama_model(&client, &ollama_url) {
        ("ollama".to_string(), local_model)
    } else if env::var("OPENAI_API_KEY").is_ok() {
        let def_openai = env::var("OPENAI_MODEL").or_else(|_| env::var("GENOS_OPENAI_MODEL")).unwrap_or_else(|_| "gpt-4o-mini".to_string());
        ("openai".to_string(), def_openai)
    } else if env::var("ANTHROPIC_API_KEY").is_ok() {
        let def_anthropic = env::var("ANTHROPIC_MODEL").or_else(|_| env::var("GENOS_ANTHROPIC_MODEL")).unwrap_or_else(|_| "claude-3-5-sonnet-20241022".to_string());
        ("anthropic".to_string(), def_anthropic)
    } else {
        let def_gemini = env::var("GEMINI_MODEL").or_else(|_| env::var("GENOS_GEMINI_MODEL")).unwrap_or_else(|_| "gemini-1.5-flash".to_string());
        ("gemini".to_string(), def_gemini)
    };

    let mut augmented_prompt = prompt.to_string();
    let demo_heuristics = env::var("GENOS_DEMO_HEURISTICS").map(|v| v == "1" || v == "true").unwrap_or(false);
    if demo_heuristics && prompt.to_lowercase().contains("capitale") {
        augmented_prompt = format!("Contexte de notre mémoire RAG :\n- Les capitales sont souvent demandées, sois direct.\n\nQuestion: {}", prompt);
    }

    let prov_lower = chosen_provider.to_lowercase();
    let final_response = if prov_lower == "ollama" {
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
            Err(e) => format!("Thalamus Error: Synaptic failure connecting to {}. Details: {}", ollama_url, e)
        }
    } else if prov_lower == "openai" {
        let api_key = match env::var("OPENAI_API_KEY").or_else(|_| env::var("GENOS_MODEL_API_KEY")) {
            Ok(k) => k,
            Err(_) => return "Thalamus Error: OPENAI_API_KEY environment variable not set in .env".to_string()
        };
        let body = serde_json::json!({
            "model": chosen_model,
            "messages": [{ "role": "user", "content": augmented_prompt }]
        });
        match client.post("https://api.openai.com/v1/chat/completions")
            .header("Authorization", format!("Bearer {}", api_key))
            .json(&body)
            .send() {
            Ok(res) => {
                if let Ok(json_resp) = res.json::<serde_json::Value>() {
                    json_resp["choices"][0]["message"]["content"].as_str().map(|s| s.to_string())
                        .unwrap_or_else(|| "Thalamus Error: Could not extract content from OpenAI response".to_string())
                } else {
                    "Thalamus Error: Failed to parse OpenAI JSON".to_string()
                }
            },
            Err(e) => format!("Thalamus Error: OpenAI connection failure: {}", e)
        }
    } else if prov_lower == "anthropic" {
        let api_key = match env::var("ANTHROPIC_API_KEY") {
            Ok(k) => k,
            Err(_) => return "Thalamus Error: ANTHROPIC_API_KEY environment variable not set in .env".to_string()
        };
        let body = serde_json::json!({
            "model": chosen_model,
            "max_tokens": 2048,
            "messages": [{ "role": "user", "content": augmented_prompt }]
        });
        match client.post("https://api.anthropic.com/v1/messages")
            .header("x-api-key", api_key)
            .header("anthropic-version", "2023-06-01")
            .json(&body)
            .send() {
            Ok(res) => {
                if let Ok(json_resp) = res.json::<serde_json::Value>() {
                    json_resp["content"][0]["text"].as_str().map(|s| s.to_string())
                        .unwrap_or_else(|| "Thalamus Error: Could not extract content from Anthropic response".to_string())
                } else {
                    "Thalamus Error: Failed to parse Anthropic JSON".to_string()
                }
            },
            Err(e) => format!("Thalamus Error: Anthropic connection failure: {}", e)
        }
    } else {
        // Gemini pathway
        let api_key = match env::var("GEMINI_API_KEY") {
            Ok(k) => k,
            Err(_) => return "Thalamus Error: Cloud routing failed. GEMINI_API_KEY environment variable not set in .env".to_string()
        };
        let gemini_model = if chosen_model.is_empty() { "gemini-1.5-flash" } else { &chosen_model };
        let url = format!("https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent", gemini_model);
        let body = serde_json::json!({ "contents": [{ "parts": [{"text": augmented_prompt}] }] });
        
        match client.post(&url)
            .header("x-goog-api-key", api_key)
            .json(&body)
            .send() {
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

    if system_level == 1 && !final_response.starts_with("Thalamus Error") {
        let cache_key = thalamus_cache_key(&ThalamusCacheKey {
            prompt,
            cache_scope,
            provider: &chosen_provider,
            model: &chosen_model,
            rethink,
            system_level,
        });
        thalamus_cache_store(&cache_key, &final_response);
    }
    
    final_response
}

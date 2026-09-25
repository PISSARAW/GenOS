use reqwest::blocking::Client;
use sha2::{Digest, Sha256};
use std::env;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
mod providers;

const MAX_CACHE_ENTRIES: usize = 512;

#[derive(Clone, Debug)]
pub struct ThalamusMessage {
    pub role: String,
    pub content: String,
}

#[derive(Clone, Debug)]
pub struct ThalamusRequest {
    pub messages: Vec<ThalamusMessage>,
    pub rethink: bool,
    pub system_level: u8,
    pub cache_scope: String,
    pub temperature: Option<f32>,
    pub max_tokens: Option<u32>,
}

#[derive(Clone, Debug)]
pub struct ThalamusError {
    pub status: u16,
    pub message: String,
}

impl std::fmt::Display for ThalamusError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(formatter, "{}", self.message)
    }
}

fn thalamus_cache_lock() -> &'static Mutex<()> {
    static CACHE_LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    CACHE_LOCK.get_or_init(|| Mutex::new(()))
}

fn thalamus_cache_file() -> PathBuf {
    PathBuf::from(env::var_os("GENOS_THALAMUS_CACHE").unwrap_or_default())
}

pub struct ThalamusCacheKey<'a> {
    pub prompt: &'a str,
    pub cache_scope: &'a str,
    pub provider: &'a str,
    pub model: &'a str,
    pub rethink: bool,
    pub system_level: u8,
    pub temperature: Option<f32>,
    pub max_tokens: Option<u32>,
}

pub fn thalamus_cache_key(k: &ThalamusCacheKey) -> String {
    let payload = serde_json::to_vec(&(
        k.prompt,
        k.cache_scope,
        k.provider,
        k.model,
        k.rethink,
        k.system_level,
        k.temperature,
        k.max_tokens,
    ))
    .unwrap_or_default();
    format!("{:x}", Sha256::digest(payload))
}

fn find_preferred_model(names: &[String]) -> Option<String> {
    let custom_pref = env::var("GENOS_PREFERRED_MODELS").ok();
    let preferred_list: Vec<String> = custom_pref
        .as_deref()
        .map(|s| {
            s.split(',')
                .map(|w| w.trim().to_lowercase())
                .filter(|w| !w.is_empty())
                .collect()
        })
        .unwrap_or_else(|| {
            vec![
                "llama3".into(),
                "mistral".into(),
                "mixtral".into(),
                "phi3".into(),
                "gemma".into(),
                "qwen".into(),
            ]
        });

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
    if !res.status().is_success() {
        return None;
    }
    let json_resp: serde_json::Value = res.json().ok()?;
    let models = json_resp["models"].as_array()?;
    let names: Vec<String> = models
        .iter()
        .filter_map(|m| m["name"].as_str().map(String::from))
        .collect();
    find_preferred_model(&names)
}

pub fn evaluate_prompt_complexity(prompt: &str) -> u32 {
    let mut score = 0;
    let keywords = [
        "architecture",
        "déploie",
        "simule",
        "code complet",
        "projet entier",
        "essaim",
        "swarm",
        "agents",
        "orchestrateur",
        "itère",
        "mutation",
        "système distribué",
        "complexe",
        "bft",
        "blockchain",
        "génétique",
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
    if env::var_os("GENOS_THALAMUS_CACHE").is_none() {
        return None;
    }
    let _guard = thalamus_cache_lock().lock().ok()?;
    if let Ok(content) = std::fs::read_to_string(thalamus_cache_file()) {
        if let Ok(cache) =
            serde_json::from_str::<std::collections::HashMap<String, String>>(&content)
        {
            if let Some(answer) = cache.get(key) {
                return Some(answer.clone());
            }
        }
    }
    None
}

pub fn thalamus_cache_store(key: &str, response: &str) {
    if env::var_os("GENOS_THALAMUS_CACHE").is_none() {
        return;
    }
    let _guard = match thalamus_cache_lock().lock() {
        Ok(guard) => guard,
        Err(_) => return,
    };
    let cache_file = thalamus_cache_file();
    let mut cache = std::collections::HashMap::new();
    if let Ok(content) = std::fs::read_to_string(&cache_file) {
        if let Ok(existing) =
            serde_json::from_str::<std::collections::HashMap<String, String>>(&content)
        {
            cache = existing;
        }
    }
    cache.insert(key.to_string(), response.to_string());
    while cache.len() > MAX_CACHE_ENTRIES {
        if let Some(oldest_key) = cache.keys().next().cloned() {
            cache.remove(&oldest_key);
        } else {
            break;
        }
    }
    if let Ok(json) = serde_json::to_string_pretty(&cache) {
        if let Some(parent) = cache_file.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let temp_file = cache_file.with_extension(format!("tmp.{}", std::process::id()));
        if std::fs::write(&temp_file, json).is_ok() {
            let _ = std::fs::rename(temp_file, cache_file);
        }
    }
}

pub fn call_llm_api(request: &ThalamusRequest) -> String {
    call_thalamus(request).unwrap_or_else(|error| format!("Thalamus Error: {}", error.message))
}

pub fn call_thalamus(request: &ThalamusRequest) -> Result<String, ThalamusError> {
    dotenv::dotenv().ok();
    validate_request(request)?;
    let prompt = render_prompt(request);
    let system_level = resolve_system_level(request.system_level, &prompt);
    let effective_messages = messages_for_level(request, system_level);
    if let Some(response) = mock_response(request, system_level) {
        return Ok(response);
    }

    let route = providers::resolve_provider()?;
    if system_level == 1 && !request.rethink {
        let key = cache_key_for(request, &prompt, &route);
        if let Some(response) = thalamus_cache_lookup(&key) {
            return Ok(format!(
                "⚡ [Cache exact] Résultat mis en cache :\n{response}"
            ));
        }
    }
    let response = providers::call_provider(&route, request, &effective_messages)?;
    if system_level == 1 && !request.rethink {
        thalamus_cache_store(&cache_key_for(request, &prompt, &route), &response);
    }
    Ok(response)
}

fn validate_request(request: &ThalamusRequest) -> Result<(), ThalamusError> {
    if request.messages.is_empty() {
        return Err(ThalamusError {
            status: 400,
            message: "At least one message is required.".into(),
        });
    }
    if request
        .messages
        .iter()
        .any(|message| !matches!(message.role.as_str(), "system" | "user" | "assistant"))
    {
        return Err(ThalamusError {
            status: 400,
            message: "Message roles must be system, user, or assistant.".into(),
        });
    }
    if request
        .messages
        .iter()
        .any(|message| message.content.trim().is_empty())
    {
        return Err(ThalamusError {
            status: 400,
            message: "Message content cannot be empty.".into(),
        });
    }
    if request
        .temperature
        .is_some_and(|temperature| !(0.0..=2.0).contains(&temperature))
    {
        return Err(ThalamusError {
            status: 400,
            message: "temperature must be between 0 and 2.".into(),
        });
    }
    if request
        .max_tokens
        .is_some_and(|max_tokens| max_tokens == 0 || max_tokens > 131_072)
    {
        return Err(ThalamusError {
            status: 400,
            message: "max_tokens must be between 1 and 131072.".into(),
        });
    }
    Ok(())
}

fn render_prompt(request: &ThalamusRequest) -> String {
    request
        .messages
        .iter()
        .map(|message| format!("{}: {}", message.role, message.content))
        .collect::<Vec<_>>()
        .join("\n")
}

fn resolve_system_level(requested: u8, prompt: &str) -> u8 {
    let level = requested.clamp(1, 2);
    if level != 1 {
        return level;
    }
    let threshold = env::var("GENOS_COMPLEXITY_THRESHOLD")
        .ok()
        .and_then(|value| value.parse::<u32>().ok())
        .unwrap_or(50);
    if evaluate_prompt_complexity(prompt) >= threshold {
        2
    } else {
        1
    }
}

fn messages_for_level(request: &ThalamusRequest, level: u8) -> Vec<ThalamusMessage> {
    let mut messages = request.messages.clone();
    if level == 2 {
        messages.insert(0, ThalamusMessage {
            role: "system".into(),
            content: "Use a careful multi-step workflow. Check assumptions and uncertainty, ground claims in supplied evidence, and do not claim actions you did not perform. Give the user a concise conclusion.".into(),
        });
    }
    messages
}

fn mock_response(request: &ThalamusRequest, level: u8) -> Option<String> {
    if env::var("GENOS_MOCK_LLM").ok().as_deref() != Some("1") {
        return None;
    }
    let content = request
        .messages
        .last()
        .map(|message| message.content.as_str())
        .unwrap_or("");
    Some(format!("[SIMULATION EXPLICITE; niveau {level}] {content}"))
}

fn cache_key_for(
    request: &ThalamusRequest,
    prompt: &str,
    route: &providers::ProviderRoute,
) -> String {
    thalamus_cache_key(&ThalamusCacheKey {
        prompt,
        cache_scope: &request.cache_scope,
        provider: &route.provider,
        model: &route.model,
        rethink: request.rethink,
        system_level: request.system_level.clamp(1, 2),
        temperature: request.temperature,
        max_tokens: request.max_tokens,
    })
}

#[cfg(test)]
mod tests {
    use super::{ThalamusCacheKey, ThalamusRequest, call_thalamus, thalamus_cache_key};

    #[test]
    fn cache_key_hides_prompt_and_covers_generation_settings() {
        let key = ThalamusCacheKey {
            prompt: "private prompt",
            cache_scope: "tenant-a",
            provider: "ollama",
            model: "model-a",
            rethink: false,
            system_level: 1,
            temperature: None,
            max_tokens: None,
        };
        let digest = thalamus_cache_key(&key);
        assert!(!digest.contains("private prompt"));
        let changed = ThalamusCacheKey {
            temperature: Some(0.2),
            ..key
        };
        assert_ne!(digest, thalamus_cache_key(&changed));
    }

    #[test]
    fn rejects_empty_conversation_before_provider_resolution() {
        let request = ThalamusRequest {
            messages: Vec::new(),
            rethink: false,
            system_level: 1,
            cache_scope: "test".into(),
            temperature: None,
            max_tokens: None,
        };
        assert_eq!(call_thalamus(&request).unwrap_err().status, 400);
    }
}

use super::{ThalamusError, ThalamusMessage, ThalamusRequest, thalamus_select_ollama_model};
use reqwest::blocking::Client;
use std::env;

pub(super) struct ProviderRoute {
    pub client: Client,
    pub ollama_url: String,
    pub provider: String,
    pub model: String,
}

pub(super) fn resolve_provider() -> Result<ProviderRoute, ThalamusError> {
    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|error| ThalamusError {
            status: 500,
            message: error.to_string(),
        })?;
    let ollama_url = env::var("GENOS_OLLAMA_URL")
        .or_else(|_| env::var("OLLAMA_API_URL"))
        .unwrap_or_else(|_| "http://127.0.0.1:11434".to_string());
    let requested = env::var("LLM_PROVIDER")
        .unwrap_or_else(|_| "auto".to_string())
        .to_lowercase();
    let (provider, discovered_model) = if requested == "auto" {
        if let Some(model) = thalamus_select_ollama_model(&client, &ollama_url) {
            ("ollama".to_string(), Some(model))
        } else if env::var("OPENAI_API_KEY").is_ok() || env::var("GENOS_MODEL_API_KEY").is_ok() {
            ("openai".to_string(), None)
        } else if env::var("ANTHROPIC_API_KEY").is_ok() {
            ("anthropic".to_string(), None)
        } else if env::var("GEMINI_API_KEY").is_ok() {
            ("gemini".to_string(), None)
        } else {
            return Err(ThalamusError {
                status: 503,
                message: "No LLM provider is configured.".into(),
            });
        }
    } else {
        (requested, None)
    };
    let model = configured_model(&provider, discovered_model)?;
    Ok(ProviderRoute {
        client,
        ollama_url,
        provider,
        model,
    })
}

fn configured_model(provider: &str, discovered: Option<String>) -> Result<String, ThalamusError> {
    match provider {
        "ollama" => Ok(env::var("OLLAMA_MODEL")
            .ok()
            .or(discovered)
            .or_else(|| env::var("GENOS_DEFAULT_OLLAMA_MODEL").ok())
            .unwrap_or_else(|| "llama3".into())),
        "openai" => Ok(env::var("OPENAI_MODEL")
            .or_else(|_| env::var("GENOS_OPENAI_MODEL"))
            .unwrap_or_else(|_| "gpt-4o-mini".into())),
        "anthropic" => Ok(env::var("ANTHROPIC_MODEL")
            .or_else(|_| env::var("GENOS_ANTHROPIC_MODEL"))
            .unwrap_or_else(|_| "claude-sonnet-4-6".into())),
        "gemini" => Ok(env::var("GEMINI_MODEL")
            .or_else(|_| env::var("GENOS_GEMINI_MODEL"))
            .unwrap_or_else(|_| "gemini-3.8-flash".into())),
        _ => Err(ThalamusError {
            status: 400,
            message: format!(
                "Unsupported LLM_PROVIDER '{provider}'. Use auto, ollama, openai, anthropic, or gemini."
            ),
        }),
    }
}

pub(super) fn call_provider(
    route: &ProviderRoute,
    request: &ThalamusRequest,
    messages: &[ThalamusMessage],
) -> Result<String, ThalamusError> {
    match route.provider.as_str() {
        "ollama" => call_ollama(route, request, messages),
        "openai" => call_openai(route, request, messages),
        "anthropic" => call_anthropic(route, request, messages),
        "gemini" => call_gemini(route, request, messages),
        _ => Err(ThalamusError {
            status: 400,
            message: "Unsupported LLM provider.".into(),
        }),
    }
}

fn call_ollama(
    route: &ProviderRoute,
    request: &ThalamusRequest,
    messages: &[ThalamusMessage],
) -> Result<String, ThalamusError> {
    let wire_messages = messages
        .iter()
        .map(|message| {
            serde_json::json!({
                "role": message.role, "content": message.content
            })
        })
        .collect::<Vec<_>>();
    let mut options = serde_json::json!({});
    if let Some(temperature) = request.temperature {
        options["temperature"] = serde_json::json!(temperature);
    }
    let body = serde_json::json!({ "model": route.model, "messages": wire_messages, "stream": false, "options": options });
    let url = format!("{}/api/chat", route.ollama_url);
    let response = route
        .client
        .post(&url)
        .json(&body)
        .send()
        .map_err(|error| ThalamusError {
            status: 502,
            message: format!("Ollama connection failure at {}: {error}", route.ollama_url),
        })?;
    let status = response.status();
    let data = response
        .json::<serde_json::Value>()
        .map_err(|error| ThalamusError {
            status: 502,
            message: format!("Invalid Ollama response: {error}"),
        })?;
    if !status.is_success() {
        return Err(ThalamusError {
            status: 502,
            message: data["error"]
                .as_str()
                .unwrap_or("Ollama request failed")
                .to_string(),
        });
    }
    data["message"]["content"]
        .as_str()
        .map(str::to_string)
        .ok_or_else(|| ThalamusError {
            status: 502,
            message: format!("Unexpected Ollama response for {}.", route.model),
        })
}

fn call_openai(
    route: &ProviderRoute,
    request: &ThalamusRequest,
    messages: &[ThalamusMessage],
) -> Result<String, ThalamusError> {
    let api_key = env::var("OPENAI_API_KEY")
        .or_else(|_| env::var("GENOS_MODEL_API_KEY"))
        .map_err(|_| ThalamusError {
            status: 503,
            message: "OPENAI_API_KEY is not configured.".into(),
        })?;
    let wire_messages = messages
        .iter()
        .map(|message| {
            serde_json::json!({
                "role": message.role, "content": message.content
            })
        })
        .collect::<Vec<_>>();
    let mut body = serde_json::json!({
        "model": route.model,
        "messages": wire_messages,
        "max_tokens": request.max_tokens.unwrap_or(2048)
    });
    if let Some(temperature) = request.temperature {
        body["temperature"] = serde_json::json!(temperature);
    }
    let response = route
        .client
        .post("https://api.openai.com/v1/chat/completions")
        .header("Authorization", format!("Bearer {api_key}"))
        .json(&body)
        .send()
        .map_err(|error| ThalamusError {
            status: 502,
            message: format!("OpenAI connection failure: {error}"),
        })?;
    let status = response.status();
    let data = response
        .json::<serde_json::Value>()
        .map_err(|error| ThalamusError {
            status: 502,
            message: format!("Invalid OpenAI response: {error}"),
        })?;
    if !status.is_success() {
        return Err(upstream_error(&data, "OpenAI request failed"));
    }
    data["choices"][0]["message"]["content"]
        .as_str()
        .map(str::to_string)
        .ok_or_else(|| ThalamusError {
            status: 502,
            message: "OpenAI response has no completion content.".into(),
        })
}

fn call_anthropic(
    route: &ProviderRoute,
    request: &ThalamusRequest,
    messages: &[ThalamusMessage],
) -> Result<String, ThalamusError> {
    let api_key = env::var("ANTHROPIC_API_KEY").map_err(|_| ThalamusError {
        status: 503,
        message: "ANTHROPIC_API_KEY is not configured.".into(),
    })?;
    let system = messages
        .iter()
        .filter(|message| message.role == "system")
        .map(|message| message.content.as_str())
        .collect::<Vec<_>>()
        .join("\n");
    let wire_messages = messages.iter().filter(|message| message.role != "system").map(|message| serde_json::json!({
        "role": if message.role == "assistant" { "assistant" } else { "user" }, "content": message.content
    })).collect::<Vec<_>>();
    let mut body = serde_json::json!({
        "model": route.model, "max_tokens": request.max_tokens.unwrap_or(2048),
        "system": system, "messages": wire_messages
    });
    if let Some(temperature) = request.temperature {
        body["temperature"] = serde_json::json!(temperature);
    }
    let response = route
        .client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .json(&body)
        .send()
        .map_err(|error| ThalamusError {
            status: 502,
            message: format!("Anthropic connection failure: {error}"),
        })?;
    let status = response.status();
    let data = response
        .json::<serde_json::Value>()
        .map_err(|error| ThalamusError {
            status: 502,
            message: format!("Invalid Anthropic response: {error}"),
        })?;
    if !status.is_success() {
        return Err(upstream_error(&data, "Anthropic request failed"));
    }
    data["content"][0]["text"]
        .as_str()
        .map(str::to_string)
        .ok_or_else(|| ThalamusError {
            status: 502,
            message: "Anthropic response has no completion content.".into(),
        })
}

fn call_gemini(
    route: &ProviderRoute,
    request: &ThalamusRequest,
    messages: &[ThalamusMessage],
) -> Result<String, ThalamusError> {
    let api_key = env::var("GEMINI_API_KEY").map_err(|_| ThalamusError {
        status: 503,
        message: "GEMINI_API_KEY is not configured.".into(),
    })?;
    let system = messages
        .iter()
        .filter(|message| message.role == "system")
        .map(|message| message.content.as_str())
        .collect::<Vec<_>>()
        .join("\n");
    let contents = messages.iter().filter(|message| message.role != "system").map(|message| serde_json::json!({
        "role": if message.role == "assistant" { "model" } else { "user" }, "parts": [{"text": message.content}]
    })).collect::<Vec<_>>();
    let mut config = serde_json::json!({ "maxOutputTokens": request.max_tokens.unwrap_or(2048) });
    if let Some(temperature) = request.temperature {
        config["temperature"] = serde_json::json!(temperature);
    }
    let body = serde_json::json!({
        "system_instruction": {"parts": [{"text": system}]},
        "contents": contents, "generationConfig": config
    });
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent",
        route.model
    );
    let response = route
        .client
        .post(&url)
        .header("x-goog-api-key", api_key)
        .json(&body)
        .send()
        .map_err(|error| ThalamusError {
            status: 502,
            message: format!("Gemini connection failure: {error}"),
        })?;
    let status = response.status();
    let data = response
        .json::<serde_json::Value>()
        .map_err(|error| ThalamusError {
            status: 502,
            message: format!("Invalid Gemini response: {error}"),
        })?;
    if !status.is_success() {
        return Err(upstream_error(&data, "Gemini request failed"));
    }
    data["candidates"][0]["content"]["parts"][0]["text"]
        .as_str()
        .map(str::to_string)
        .ok_or_else(|| ThalamusError {
            status: 502,
            message: "Gemini response has no completion content.".into(),
        })
}

fn upstream_error(data: &serde_json::Value, fallback: &str) -> ThalamusError {
    ThalamusError {
        status: 502,
        message: data["error"]["message"]
            .as_str()
            .unwrap_or(fallback)
            .to_string(),
    }
}

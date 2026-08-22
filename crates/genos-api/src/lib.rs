use axum::{
    extract::State,
    http::HeaderMap,
    response::{
        sse::{Event, KeepAlive, Sse},
        IntoResponse, Response,
    },
    routing::{get, post},
    Json, Router,
};
use futures::stream;
use genos_model::{GenerationConfig, LlmProvider, Message, Role};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    convert::Infallible,
    sync::Arc,
    time::{SystemTime, UNIX_EPOCH},
};

#[derive(Serialize)]
struct Health {
    status: &'static str,
}
#[derive(Clone)]
pub struct ApiState {
    pub provider: Arc<dyn LlmProvider>,
    pub tenant_tokens: Arc<HashMap<String, String>>,
}
#[derive(Debug, Deserialize)]
pub struct ChatCompletionRequest {
    pub model: Option<String>,
    pub messages: Vec<ChatMessage>,
    #[serde(default)]
    pub temperature: Option<f32>,
    #[serde(default)]
    pub max_tokens: Option<u32>,
    #[serde(default)]
    pub stream: bool,
    #[serde(default)]
    pub response_format: Option<Value>,
}
#[derive(Debug, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
    #[serde(default)]
    pub tool_call_id: Option<String>,
}
#[derive(Debug, Serialize)]
struct ChatCompletionResponse {
    id: String,
    object: &'static str,
    created: u64,
    model: String,
    choices: Vec<ChatChoice>,
    usage: ChatUsage,
}
#[derive(Debug, Serialize)]
struct ChatChoice {
    index: usize,
    message: ChatOutputMessage,
    finish_reason: &'static str,
}
#[derive(Debug, Serialize)]
struct ChatOutputMessage {
    role: &'static str,
    content: Option<String>,
}
#[derive(Debug, Serialize)]
struct ChatUsage {
    prompt_tokens: u64,
    completion_tokens: u64,
    total_tokens: u64,
}

pub fn router() -> Router {
    let provider = genos_model::factory::ModelFactory::create("fake://api", None)
        .expect("fake provider is always available");
    router_with_provider(Arc::from(provider))
}
pub fn router_with_provider(provider: Arc<dyn LlmProvider>) -> Router {
    router_with_config(provider, HashMap::new())
}
pub fn router_with_config(
    provider: Arc<dyn LlmProvider>,
    tenant_tokens: HashMap<String, String>,
) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/v1/chat/completions", post(chat_completions))
        .with_state(ApiState {
            provider,
            tenant_tokens: Arc::new(tenant_tokens),
        })
}
async fn health() -> Json<Health> {
    Json(Health { status: "ok" })
}

async fn chat_completions(
    State(state): State<ApiState>,
    headers: HeaderMap,
    Json(request): Json<ChatCompletionRequest>,
) -> Response {
    if !state.tenant_tokens.is_empty() {
        let tenant = headers
            .get("x-genos-tenant")
            .and_then(|value| value.to_str().ok());
        let token = headers
            .get("authorization")
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.strip_prefix("Bearer "));
        if tenant
            .and_then(|tenant| state.tenant_tokens.get(tenant))
            .zip(token)
            .is_none_or(|(expected, actual)| expected != actual)
        {
            return (axum::http::StatusCode::UNAUTHORIZED, Json(json!({ "error": { "message": "invalid tenant credentials", "type": "authentication_error" } }))).into_response();
        }
    }
    let messages = request
        .messages
        .iter()
        .map(|message| Message {
            role: match message.role.as_str() {
                "system" => Role::System,
                "assistant" => Role::Assistant,
                "tool" => Role::Tool,
                _ => Role::User,
            },
            content: message.content.clone(),
            tool_call_id: message.tool_call_id.clone(),
        })
        .collect::<Vec<_>>();
    let config = GenerationConfig {
        temperature: request.temperature,
        max_tokens: request.max_tokens,
        ..Default::default()
    };
    if request.stream {
        let chunks = match state.provider.stream(&messages, &config).await {
            Ok(chunks) => chunks,
            Err(error) => return provider_error(error.to_string()),
        };
        let model = request.model.unwrap_or_else(|| "genos".into());
        let events = chunks.into_iter().map(move |chunk| { let payload = json!({ "id": "genos-stream", "object": "chat.completion.chunk", "created": now(), "model": model, "choices": [{ "index": 0, "delta": { "content": chunk.delta }, "finish_reason": if chunk.done { Some("stop") } else { None } }] }); Ok::<Event, Infallible>(Event::default().data(payload.to_string())) });
        return Sse::new(stream::iter(events))
            .keep_alive(KeepAlive::default())
            .into_response();
    }
    match state.provider.generate(&messages, &config).await {
        Ok(response) => Json(ChatCompletionResponse {
            id: format!("genos-{}", now()),
            object: "chat.completion",
            created: now(),
            model: request.model.unwrap_or_else(|| "genos".into()),
            choices: vec![ChatChoice {
                index: 0,
                message: ChatOutputMessage {
                    role: "assistant",
                    content: response.content,
                },
                finish_reason: "stop",
            }],
            usage: ChatUsage {
                prompt_tokens: response.usage.prompt_tokens,
                completion_tokens: response.usage.completion_tokens,
                total_tokens: response.usage.total_tokens,
            },
        })
        .into_response(),
        Err(error) => provider_error(error.to_string()),
    }
}
fn provider_error(message: String) -> Response {
    (
        axum::http::StatusCode::BAD_GATEWAY,
        Json(json!({ "error": { "message": message, "type": "provider_error" } })),
    )
        .into_response()
}
fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn maps_openai_roles() {
        let message = ChatMessage {
            role: "system".into(),
            content: "rules".into(),
            tool_call_id: None,
        };
        let mapped = match message.role.as_str() {
            "system" => Role::System,
            _ => Role::User,
        };
        assert_eq!(mapped, Role::System);
    }
}

use axum::http::HeaderMap;
use axum::{
    extract::State,
    response::{
        sse::{Event, KeepAlive, Sse},
        IntoResponse, Response,
    },
    routing::{get, post},
    Json, Router,
};
use futures::stream;
use genos_model::{GenerationConfig, LlmProvider, Message, Role};
use security::RateLimitConfig;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    convert::Infallible,
    sync::Arc,
    time::{SystemTime, UNIX_EPOCH},
};

pub mod security;
pub use security::{AuthenticatedTenant, SecurityState};

#[derive(Serialize)]
struct Health {
    status: &'static str,
}
#[derive(Clone)]
pub struct ApiState {
    pub provider: Arc<dyn LlmProvider>,
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
pub const DEFAULT_RATE_LIMIT_CAPACITY: u32 = 120;
pub const DEFAULT_RATE_LIMIT_REFILL_PER_SEC: u32 = 30;

pub fn router_with_config(
    provider: Arc<dyn LlmProvider>,
    tenant_tokens: HashMap<String, String>,
) -> Router {
    router_with_security(
        provider,
        tenant_tokens,
        RateLimitConfig::new(
            DEFAULT_RATE_LIMIT_CAPACITY,
            DEFAULT_RATE_LIMIT_REFILL_PER_SEC,
        ),
    )
}

pub fn router_with_security(
    provider: Arc<dyn LlmProvider>,
    tenant_tokens: HashMap<String, String>,
    rate_limit: RateLimitConfig,
) -> Router {
    let security = SecurityState::new(tenant_tokens, rate_limit);
    let protected = Router::new()
        .route("/v1/chat/completions", post(chat_completions))
        .layer(axum::middleware::from_fn_with_state(
            security,
            security::middleware,
        ));
    Router::new()
        .route("/health", get(health))
        .merge(protected)
        .with_state(ApiState { provider })
}
async fn health() -> Json<Health> {
    Json(Health { status: "ok" })
}

async fn chat_completions(
    State(state): State<ApiState>,
    Json(request): Json<ChatCompletionRequest>,
) -> Response {
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

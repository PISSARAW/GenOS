use super::{ParsedRequest, error_response, json_response};
use crate::security::{RateLimiter, TenantAuth};
use crate::thalamus::{ThalamusMessage, ThalamusRequest, call_thalamus};
use crate::types::{
    ChatChoice, ChatCompletionRequest, ChatCompletionResponse, ChatOutputMessage, ChatUsage,
    HealthResponse,
};
use chrono::Utc;
use serde_json::json;
use std::sync::Mutex;
use uuid::Uuid;

pub(super) fn health_response() -> (u16, Vec<(String, String)>, String) {
    json_response(
        200,
        &HealthResponse {
            status: "healthy".into(),
            version: "3.0.0".into(),
            timestamp: Utc::now().to_rfc3339(),
        },
    )
}

pub(super) fn models_response() -> (u16, Vec<(String, String)>, String) {
    let models = json!({ "object": "list", "data": [
        { "id": "genos-core-v3", "object": "model", "owned_by": "genos", "permission": [] },
        { "id": "genos-biology", "object": "model", "owned_by": "genos", "permission": [] },
        { "id": "genos-swarm-intelligence", "object": "model", "owned_by": "genos", "permission": [] }
    ] });
    (200, json_headers(), models.to_string())
}

pub(super) fn handle_chat_completion(
    request: &ParsedRequest,
    auth: &TenantAuth,
    limiter: &Mutex<RateLimiter>,
) -> (u16, Vec<(String, String)>, String) {
    let cache_scope = match tenant_scope(request, auth) {
        Ok(scope) => scope,
        Err(response) => return response,
    };
    if !limiter
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .try_acquire(1)
    {
        return error_response(
            429,
            "Rate limit exceeded. Try again later.",
            "rate_limit_error",
        );
    }
    let chat_request = match serde_json::from_str::<ChatCompletionRequest>(&request.body) {
        Ok(parsed) => parsed,
        Err(error) => {
            return error_response(
                400,
                &format!("Invalid ChatCompletionRequest JSON: {error}"),
                "invalid_request_error",
            );
        }
    };
    if chat_request.stream {
        return error_response(
            400,
            "Streaming is not supported by this endpoint.",
            "invalid_request_error",
        );
    }
    let input_tokens = chat_request
        .messages
        .iter()
        .map(|message| message.content.len())
        .sum::<usize>()
        .div_ceil(4)
        .max(1) as u64;
    let thalamus_request = ThalamusRequest {
        messages: chat_request
            .messages
            .iter()
            .map(|message| ThalamusMessage {
                role: message.role.clone(),
                content: message.content.clone(),
            })
            .collect(),
        rethink: request.rethink,
        system_level: request.system_level,
        cache_scope,
        temperature: chat_request.temperature,
        max_tokens: chat_request.max_tokens,
    };
    let completion = match call_thalamus(&thalamus_request) {
        Ok(text) => text,
        Err(error) => return error_response(error.status, &error.message, "upstream_error"),
    };
    completion_response(chat_request.model, completion, input_tokens)
}

fn tenant_scope(
    request: &ParsedRequest,
    auth: &TenantAuth,
) -> Result<String, (u16, Vec<(String, String)>, String)> {
    let token = request
        .auth_header
        .as_deref()
        .and_then(|header| header.strip_prefix("Bearer "));
    match token {
        Some(token) => auth
            .verify_key(token.trim())
            .map(str::to_string)
            .ok_or_else(|| {
                error_response(
                    401,
                    "Invalid or unauthorized API key.",
                    "authentication_error",
                )
            }),
        None if auth.has_keys() => Err(error_response(
            401,
            "Authentication is required for this API endpoint.",
            "authentication_error",
        )),
        None => Ok("anonymous".into()),
    }
}

fn completion_response(
    model: Option<String>,
    text: String,
    input_tokens: u64,
) -> (u16, Vec<(String, String)>, String) {
    let output_tokens = (text.len() / 4).max(1) as u64;
    let response = ChatCompletionResponse {
        id: format!("chatcmpl-{}", Uuid::new_v4().simple()),
        object: "chat.completion".into(),
        created: Utc::now().timestamp() as u64,
        model: model.unwrap_or_else(|| "genos-core-v3".into()),
        choices: vec![ChatChoice {
            index: 0,
            message: ChatOutputMessage {
                role: "assistant".into(),
                content: Some(text),
            },
            finish_reason: "stop".into(),
        }],
        usage: ChatUsage {
            prompt_tokens: input_tokens,
            completion_tokens: output_tokens,
            total_tokens: input_tokens + output_tokens,
        },
    };
    json_response(200, &response)
}

fn json_headers() -> Vec<(String, String)> {
    vec![("Content-Type".into(), "application/json".into())]
}

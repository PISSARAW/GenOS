use crate::{GenerationConfig, LlmProvider, LlmResponse, Message, Role, TokenUsage};
use anyhow::{anyhow, Context};
use async_trait::async_trait;
use reqwest::Client;
use serde_json::{json, Value};

#[derive(Clone, Debug)]
pub enum Protocol {
    Anthropic,
    Gemini,
    Cohere,
    Bedrock,
    Vertex,
}

#[derive(Clone, Debug)]
pub struct JsonProvider {
    pub name: String,
    pub model: String,
    pub endpoint: String,
    pub api_key: String,
    pub protocol: Protocol,
    client: Client,
}

impl JsonProvider {
    pub fn new(
        name: impl Into<String>,
        model: impl Into<String>,
        endpoint: impl Into<String>,
        api_key: impl Into<String>,
        protocol: Protocol,
    ) -> Self {
        Self {
            name: name.into(),
            model: model.into(),
            endpoint: endpoint.into(),
            api_key: api_key.into(),
            protocol,
            client: Client::new(),
        }
    }
}

#[async_trait]
impl LlmProvider for JsonProvider {
    fn provider_name(&self) -> &str {
        &self.name
    }
    async fn generate(
        &self,
        messages: &[Message],
        config: &GenerationConfig,
    ) -> anyhow::Result<LlmResponse> {
        let request = match self.protocol {
            Protocol::Anthropic => anthropic_request(&self.model, messages, config),
            Protocol::Gemini => gemini_request(&self.model, messages, config),
            Protocol::Cohere => cohere_request(&self.model, messages, config),
            Protocol::Bedrock | Protocol::Vertex => {
                openai_compatible_request(&self.model, messages, config)
            }
        };
        let mut builder = self.client.post(&self.endpoint).json(&request);
        if !self.api_key.is_empty() {
            builder = match self.protocol {
                Protocol::Anthropic => builder.header("x-api-key", &self.api_key),
                Protocol::Gemini => builder.query(&[("key", &self.api_key)]),
                _ => builder.bearer_auth(&self.api_key),
            };
        }
        let response = builder.send().await.context("provider request failed")?;
        let status = response.status();
        let body: Value = response
            .json()
            .await
            .context("provider response was not JSON")?;
        if !status.is_success() {
            return Err(anyhow!(
                "{} provider returned {}: {}",
                self.name,
                status,
                body
            ));
        }
        parse_response(&self.protocol, &self.model, body)
    }
}

fn role(role: &Role) -> &'static str {
    match role {
        Role::System => "system",
        Role::User => "user",
        Role::Assistant => "assistant",
        Role::Tool => "tool",
    }
}
fn openai_compatible_request(
    model: &str,
    messages: &[Message],
    config: &GenerationConfig,
) -> Value {
    json!({ "model": model, "messages": messages.iter().map(|m| json!({"role": role(&m.role), "content": m.content})).collect::<Vec<_>>(), "temperature": config.temperature, "max_tokens": config.max_tokens, "tools": config.tools })
}
fn anthropic_request(model: &str, messages: &[Message], config: &GenerationConfig) -> Value {
    json!({ "model": model, "max_tokens": config.max_tokens.unwrap_or(1024), "system": messages.iter().find(|m| m.role == Role::System).map(|m| m.content.clone()), "messages": messages.iter().filter(|m| m.role != Role::System).map(|m| json!({"role": if m.role == Role::Assistant { "assistant" } else { "user" }, "content": m.content})).collect::<Vec<_>>(), "tools": config.tools.iter().map(|tool| json!({"name":tool.name,"description":tool.description,"input_schema":tool.parameters})).collect::<Vec<_>>() })
}
fn gemini_request(model: &str, messages: &[Message], config: &GenerationConfig) -> Value {
    json!({ "model": model, "contents": messages.iter().filter(|m| m.role != Role::System).map(|m| json!({"role": if m.role == Role::User {"user"} else {"model"}, "parts":[{"text":m.content}]})).collect::<Vec<_>>(), "generationConfig": {"temperature": config.temperature, "maxOutputTokens": config.max_tokens} })
}
fn cohere_request(model: &str, messages: &[Message], config: &GenerationConfig) -> Value {
    json!({ "model": model, "messages": messages.iter().map(|m| json!({"role": role(&m.role), "content": m.content})).collect::<Vec<_>>(), "max_tokens": config.max_tokens, "temperature": config.temperature })
}

fn parse_response(protocol: &Protocol, model: &str, body: Value) -> anyhow::Result<LlmResponse> {
    let (content, tool_calls, prompt_tokens, completion_tokens) = match protocol {
        Protocol::Anthropic => (
            body["content"]
                .as_array()
                .and_then(|items| {
                    items
                        .iter()
                        .find(|item| item["type"] == "text")
                        .and_then(|item| item["text"].as_str())
                })
                .map(str::to_owned),
            vec![],
            body["usage"]["input_tokens"].as_u64().unwrap_or_default(),
            body["usage"]["output_tokens"].as_u64().unwrap_or_default(),
        ),
        Protocol::Gemini | Protocol::Vertex => (
            body["candidates"][0]["content"]["parts"][0]["text"]
                .as_str()
                .map(str::to_owned)
                .or_else(|| {
                    body["choices"][0]["message"]["content"]
                        .as_str()
                        .map(str::to_owned)
                }),
            vec![],
            body["usageMetadata"]["promptTokenCount"]
                .as_u64()
                .unwrap_or_default(),
            body["usageMetadata"]["candidatesTokenCount"]
                .as_u64()
                .unwrap_or_default(),
        ),
        Protocol::Cohere => (
            body["message"]["content"][0]["text"]
                .as_str()
                .map(str::to_owned)
                .or_else(|| body["text"].as_str().map(str::to_owned)),
            vec![],
            body["usage"]["tokens"]["input_tokens"]
                .as_u64()
                .unwrap_or_default(),
            body["usage"]["tokens"]["output_tokens"]
                .as_u64()
                .unwrap_or_default(),
        ),
        Protocol::Bedrock => (
            body["output"]["message"]["content"][0]["text"]
                .as_str()
                .map(str::to_owned)
                .or_else(|| {
                    body["choices"][0]["message"]["content"]
                        .as_str()
                        .map(str::to_owned)
                }),
            vec![],
            body["usage"]["input_tokens"].as_u64().unwrap_or_default(),
            body["usage"]["output_tokens"].as_u64().unwrap_or_default(),
        ),
    };
    Ok(LlmResponse {
        content: content.clone(),
        tool_calls,
        usage: TokenUsage {
            prompt_tokens,
            completion_tokens,
            total_tokens: prompt_tokens + completion_tokens,
            latency_ms: 0,
        },
        request_hash: String::new(),
        response_hash: String::new(),
        model_version: Some(model.into()),
        system_fingerprint: None,
        seed_used: None,
        temperature_used: None,
        top_p_used: None,
        top_k_used: None,
    })
}

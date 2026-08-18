use crate::{GenerationConfig, LlmProvider, LlmResponse, Message, Role, TokenUsage};
use anyhow::{anyhow, Context};
use async_trait::async_trait;
use reqwest::Client;
use serde::{Deserialize, Serialize};

#[derive(Serialize)]
struct OpenAiMessage {
    role: String,
    content: String,
}

#[derive(Serialize)]
struct OpenAiRequest<'a> {
    model: &'a str,
    messages: Vec<OpenAiMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    seed: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    top_p: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_completion_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    stop: Vec<String>,
}

#[derive(Deserialize)]
struct OpenAiResponse {
    choices: Vec<OpenAiChoice>,
    usage: Option<OpenAiUsage>,
}

#[derive(Deserialize)]
struct OpenAiChoice {
    message: OpenAiResponseMessage,
}

#[derive(Deserialize)]
struct OpenAiResponseMessage {
    content: Option<String>,
}

#[derive(Deserialize)]
struct OpenAiUsage {
    prompt_tokens: u64,
    completion_tokens: u64,
    total_tokens: u64,
}

/// A real adapter for OpenAI to demonstrate provider-neutral interoperability.
#[derive(Clone, Debug)]
pub struct OpenAiAdapter {
    pub api_key: String,
    pub model: String,
    client: Client,
}

impl OpenAiAdapter {
    pub fn new(api_key: String, model: String) -> Self {
        Self {
            api_key,
            model,
            client: Client::new(),
        }
    }
}

fn map_role(role: &Role) -> String {
    match role {
        Role::System => "system".to_string(),
        Role::User => "user".to_string(),
        Role::Assistant => "assistant".to_string(),
        Role::Tool => "tool".to_string(),
    }
}

fn map_messages(messages: &[Message]) -> Vec<OpenAiMessage> {
    messages
        .iter()
        .map(|m| OpenAiMessage {
            role: map_role(&m.role),
            content: m.content.clone(),
        })
        .collect()
}

#[async_trait]
impl LlmProvider for OpenAiAdapter {
    fn provider_name(&self) -> &str {
        "openai"
    }

    async fn generate(
        &self,
        messages: &[Message],
        config: &GenerationConfig,
    ) -> anyhow::Result<LlmResponse> {
        let req_body = OpenAiRequest {
            model: config.exact_model_version.as_deref().unwrap_or(&self.model),
            messages: map_messages(messages),
            temperature: config.temperature,
            seed: config.seed,
            top_p: config.top_p,
            max_completion_tokens: config.max_tokens,
            stop: config.stop_sequences.clone(),
        };

        let start_time = std::time::Instant::now();

        let response = self
            .client
            .post("https://api.openai.com/v1/chat/completions")
            .bearer_auth(&self.api_key)
            .json(&req_body)
            .send()
            .await
            .context("Failed to send HTTP request to OpenAI")?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(anyhow!("OpenAI API error: {}", error_text));
        }

        let openai_res: OpenAiResponse = response
            .json()
            .await
            .context("Failed to parse OpenAI JSON response")?;

        let latency_ms = start_time.elapsed().as_millis() as u64;

        let content = openai_res
            .choices
            .first()
            .and_then(|c| c.message.content.clone());

        let usage = openai_res.usage.unwrap_or(OpenAiUsage {
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0,
        });

        // Hashing omitted for real adapter in this basic version,
        // could use the same sha2 approach if needed.
        Ok(LlmResponse {
            content,
            tool_calls: vec![],
            usage: TokenUsage {
                prompt_tokens: usage.prompt_tokens,
                completion_tokens: usage.completion_tokens,
                total_tokens: usage.total_tokens,
                latency_ms,
            },
            request_hash: "openai_req_hash".to_string(),
            response_hash: "openai_res_hash".to_string(),
            model_version: Some(config.exact_model_version.clone().unwrap_or(self.model.clone())),
            seed_used: config.seed,
            temperature_used: config.temperature,
            top_p_used: config.top_p,
            top_k_used: config.top_k,
        })
    }
}

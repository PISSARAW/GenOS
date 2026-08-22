use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::Value;

pub mod adapters;
pub mod factory;
pub mod fake;
pub mod inference;
pub mod reliability;
pub mod router;
pub mod ssm;

/// Standardized roles for LLM messages
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Role {
    System,
    User,
    Assistant,
    Tool,
}

/// A universal message type for communicating with LLMs
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub role: Role,
    pub content: String,
    pub tool_call_id: Option<String>,
}

/// Configuration grouping to keep function parameters < 3
#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct GenerationConfig {
    pub exact_model_version: Option<String>,
    pub temperature: Option<f32>,
    pub seed: Option<u64>,
    pub top_p: Option<f32>,
    pub top_k: Option<u32>,
    pub max_tokens: Option<u32>,
    pub stop_sequences: Vec<String>,
    #[serde(default)]
    pub tools: Vec<ToolDefinition>,
    #[serde(default)]
    pub response_format: Option<Value>,
}

/// A standardized tool call request returned by the model
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCall {
    pub id: String,
    pub function_name: String,
    pub arguments: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolDefinition {
    pub name: String,
    pub description: String,
    pub parameters: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamChunk {
    pub delta: String,
    pub done: bool,
}

/// Usage statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenUsage {
    pub prompt_tokens: u64,
    pub completion_tokens: u64,
    pub total_tokens: u64,
    pub latency_ms: u64,
}

/// Universal response from a provider
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LlmResponse {
    pub content: Option<String>,
    pub tool_calls: Vec<ToolCall>,
    pub usage: TokenUsage,
    pub request_hash: String,
    pub response_hash: String,
    pub model_version: Option<String>,
    pub system_fingerprint: Option<String>,
    pub seed_used: Option<u64>,
    pub temperature_used: Option<f32>,
    pub top_p_used: Option<f32>,
    pub top_k_used: Option<u32>,
}

/// The main abstraction trait for all LLM providers
#[async_trait]
pub trait LlmProvider: Send + Sync {
    /// Returns the name of the provider (e.g. "OpenAI", "Fake")
    fn provider_name(&self) -> &str;

    /// Generates a response based on a history of messages and a configuration.
    async fn generate(
        &self,
        messages: &[Message],
        config: &GenerationConfig,
    ) -> anyhow::Result<LlmResponse>;

    /// Normalized streaming surface. Providers with native streaming can
    /// override this; the default keeps every adapter usable by emitting one
    /// final chunk.
    async fn stream(
        &self,
        messages: &[Message],
        config: &GenerationConfig,
    ) -> anyhow::Result<Vec<StreamChunk>> {
        let response = self.generate(messages, config).await?;
        Ok(vec![StreamChunk {
            delta: response.content.unwrap_or_default(),
            done: true,
        }])
    }
}

pub fn parse_structured<T: serde::de::DeserializeOwned>(
    response: &LlmResponse,
) -> anyhow::Result<T> {
    let content = response
        .content
        .as_deref()
        .ok_or_else(|| anyhow::anyhow!("model returned no structured content"))?;
    Ok(serde_json::from_str(content)?)
}

pub fn validate_required_fields(value: &Value, schema: &Value) -> anyhow::Result<()> {
    let object = value
        .as_object()
        .ok_or_else(|| anyhow::anyhow!("structured output must be a JSON object"))?;
    for required in schema
        .get("required")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        let field = required
            .as_str()
            .ok_or_else(|| anyhow::anyhow!("schema required fields must be strings"))?;
        if !object.contains_key(field) {
            anyhow::bail!("structured output is missing required field {field}");
        }
    }
    Ok(())
}

pub fn validate_tool_call(call: &ToolCall, tools: &[ToolDefinition]) -> anyhow::Result<Value> {
    let tool = tools
        .iter()
        .find(|tool| tool.name == call.function_name)
        .ok_or_else(|| anyhow::anyhow!("unknown tool {}", call.function_name))?;
    let arguments: Value = serde_json::from_str(&call.arguments).map_err(|error| {
        anyhow::anyhow!("invalid arguments for {}: {error}", call.function_name)
    })?;
    validate_required_fields(&arguments, &tool.parameters)?;
    Ok(arguments)
}

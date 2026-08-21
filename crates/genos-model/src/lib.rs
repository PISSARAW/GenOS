use async_trait::async_trait;
use serde::{Deserialize, Serialize};

pub mod adapters;
pub mod factory;
pub mod fake;
pub mod inference;
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
}

/// A standardized tool call request returned by the model
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCall {
    pub id: String,
    pub function_name: String,
    pub arguments: String,
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
}

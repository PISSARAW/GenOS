use async_trait::async_trait;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ModelRequest {
    pub provider: String,
    pub model: String,
    pub prompt: String,
    pub temperature: Option<f32>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ModelUsage {
    pub prompt_tokens: u64,
    pub completion_tokens: u64,
    pub total_tokens: u64,
    pub latency_ms: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ModelResponse {
    pub content: String,
    pub usage: ModelUsage,
    pub request_hash: String,
    pub response_hash: String,
}

#[async_trait]
pub trait ModelProvider: Send + Sync {
    async fn infer(&self, request: ModelRequest) -> anyhow::Result<ModelResponse>;
}

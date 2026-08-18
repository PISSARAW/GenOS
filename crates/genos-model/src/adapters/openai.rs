use crate::{GenerationConfig, LlmProvider, LlmResponse, Message, TokenUsage};
use async_trait::async_trait;

/// A stub adapter for OpenAI to demonstrate provider-neutral interoperability.
/// In a real implementation, this would use `reqwest` or `async-openai`.
#[derive(Clone, Debug)]
pub struct OpenAiAdapter {
    pub api_key: String,
    pub model: String,
}

impl OpenAiAdapter {
    pub fn new(api_key: String, model: String) -> Self {
        Self { api_key, model }
    }
}

#[async_trait]
impl LlmProvider for OpenAiAdapter {
    fn provider_name(&self) -> &str {
        "openai"
    }

    async fn generate(
        &self,
        _messages: &[Message],
        _config: &GenerationConfig,
    ) -> anyhow::Result<LlmResponse> {
        // Stub implementation
        // Here we would map `_messages` to OpenAI's JSON format and make a HTTP request.
        
        Ok(LlmResponse {
            content: Some(format!("Stub response from {} via OpenAiAdapter", self.model)),
            tool_calls: vec![],
            usage: TokenUsage {
                prompt_tokens: 0,
                completion_tokens: 0,
                total_tokens: 0,
                latency_ms: 100, // Simulated network latency
            },
            request_hash: "mock_req_hash".to_string(),
            response_hash: "mock_res_hash".to_string(),
        })
    }
}

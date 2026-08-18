use crate::{GenerationConfig, LlmProvider, LlmResponse, Message, TokenUsage};
use async_trait::async_trait;

/// A provider that degrades gracefully by returning a static fallback string
/// instead of an error if the primary provider fails.
pub struct DegradationProvider {
    primary: Box<dyn LlmProvider>,
    fallback_response: String,
}

impl DegradationProvider {
    pub fn new(primary: Box<dyn LlmProvider>, fallback_response: String) -> Self {
        Self {
            primary,
            fallback_response,
        }
    }
}

#[async_trait]
impl LlmProvider for DegradationProvider {
    fn provider_name(&self) -> &str {
        "degradation_wrapper"
    }

    async fn generate(
        &self,
        messages: &[Message],
        config: &GenerationConfig,
    ) -> anyhow::Result<LlmResponse> {
        match self.primary.generate(messages, config).await {
            Ok(response) => Ok(response),
            Err(_) => {
                // Return a graceful degraded response to prevent the agent from crashing
                Ok(LlmResponse {
                    content: Some(self.fallback_response.clone()),
                    tool_calls: vec![],
                    usage: TokenUsage {
                        prompt_tokens: 0,
                        completion_tokens: 0,
                        total_tokens: 0,
                        latency_ms: 0,
                    },
                    request_hash: "degraded_request_hash".to_string(),
                    response_hash: "degraded_response_hash".to_string(),
                    model_version: Some("degraded_mode".to_string()),
                    seed_used: None,
                    temperature_used: None,
                    top_p_used: None,
                    top_k_used: None,
                })
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fake::FakeModel;
    use crate::{Role, TokenUsage};
    use anyhow::anyhow;

    struct FailingModel;

    #[async_trait]
    impl LlmProvider for FailingModel {
        fn provider_name(&self) -> &str {
            "failing"
        }

        async fn generate(
            &self,
            _messages: &[Message],
            _config: &GenerationConfig,
        ) -> anyhow::Result<LlmResponse> {
            Err(anyhow!("Simulated API failure"))
        }
    }

    #[tokio::test]
    async fn test_degradation_wrapper_returns_primary_if_success() {
        let wrapper = DegradationProvider::new(Box::new(FakeModel::new()), "Degraded".to_string());
        let messages = vec![Message {
            role: Role::User,
            content: "INPUT A".to_string(),
            tool_call_id: None,
        }];
        let config = GenerationConfig::default();

        let response = wrapper.generate(&messages, &config).await.expect("failed");
        assert_eq!(response.content.as_deref(), Some("RESPONSE A"));
    }

    #[tokio::test]
    async fn test_degradation_wrapper_returns_fallback_if_primary_fails() {
        let wrapper = DegradationProvider::new(Box::new(FailingModel), "Degraded state".to_string());
        let messages = vec![];
        let config = GenerationConfig::default();

        let response = wrapper.generate(&messages, &config).await.expect("failed");
        assert_eq!(response.content.as_deref(), Some("Degraded state"));
        assert_eq!(response.model_version.as_deref(), Some("degraded_mode"));
    }
}

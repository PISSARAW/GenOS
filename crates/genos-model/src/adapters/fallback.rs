use crate::{GenerationConfig, LlmProvider, LlmResponse, Message};
use anyhow::anyhow;
use async_trait::async_trait;

/// A provider that attempts multiple fallback providers in sequence.
pub struct FallbackProvider {
    providers: Vec<Box<dyn LlmProvider>>,
}

impl FallbackProvider {
    pub fn new(providers: Vec<Box<dyn LlmProvider>>) -> Self {
        Self { providers }
    }
}

#[async_trait]
impl LlmProvider for FallbackProvider {
    fn provider_name(&self) -> &str {
        "fallback_router"
    }

    async fn generate(
        &self,
        messages: &[Message],
        config: &GenerationConfig,
    ) -> anyhow::Result<LlmResponse> {
        if self.providers.is_empty() {
            return Err(anyhow!("No providers configured in FallbackProvider"));
        }

        let mut last_error = None;

        for provider in &self.providers {
            match provider.generate(messages, config).await {
                Ok(response) => return Ok(response),
                Err(e) => {
                    // In a real MLOps system, we would log the failure of the primary API here.
                    last_error = Some(e);
                }
            }
        }

        Err(anyhow!(
            "All fallback providers failed. Last error: {:?}",
            last_error
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fake::FakeModel;
    use crate::{Role, TokenUsage};

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
    async fn test_fallback_router_succeeds_on_second_try() {
        let providers: Vec<Box<dyn LlmProvider>> =
            vec![Box::new(FailingModel), Box::new(FakeModel::new())];
        let router = FallbackProvider::new(providers);

        let messages = vec![Message {
            role: Role::User,
            content: "INPUT A".to_string(),
            tool_call_id: None,
        }];
        let config = GenerationConfig::default();

        let response = router.generate(&messages, &config).await.expect("failed");
        assert_eq!(response.content.as_deref(), Some("RESPONSE A"));
    }

    #[tokio::test]
    async fn test_fallback_router_fails_if_all_fail() {
        let providers: Vec<Box<dyn LlmProvider>> =
            vec![Box::new(FailingModel), Box::new(FailingModel)];
        let router = FallbackProvider::new(providers);

        let messages = vec![];
        let config = GenerationConfig::default();

        let response = router.generate(&messages, &config).await;
        assert!(response.is_err());
    }
}

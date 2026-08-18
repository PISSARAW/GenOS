use crate::{GenerationConfig, LlmProvider, LlmResponse, Message, TokenUsage};
use async_trait::async_trait;
use sha2::{Digest, Sha256};

/// Deterministic, offline model used by runtime and integration tests.
#[derive(Clone, Debug, Default)]
pub struct FakeModel;

impl FakeModel {
    pub fn new() -> Self {
        Self
    }
}

fn stable_hash(value: &str) -> String {
    format!("{:x}", Sha256::digest(value.as_bytes()))
}

fn serialize_messages(messages: &[Message]) -> String {
    messages
        .iter()
        .map(|m| format!("{:?}:{}", m.role, m.content))
        .collect::<Vec<_>>()
        .join("\n")
}

#[async_trait]
impl LlmProvider for FakeModel {
    fn provider_name(&self) -> &str {
        "fake"
    }

    async fn generate(
        &self,
        messages: &[Message],
        _config: &GenerationConfig,
    ) -> anyhow::Result<LlmResponse> {
        let serialized_input = serialize_messages(messages);
        
        // Very basic mock behavior based on last message
        let last_msg = messages.last().map(|m| m.content.as_str()).unwrap_or("");
        
        let content = match last_msg {
            "INPUT A" => "RESPONSE A",
            prompt => prompt,
        }
        .to_string();

        let request_hash = stable_hash(&serialized_input);
        let response_hash = stable_hash(&content);

        Ok(LlmResponse {
            content: Some(content.clone()),
            tool_calls: vec![],
            usage: TokenUsage {
                prompt_tokens: serialized_input.len() as u64,
                completion_tokens: content.len() as u64,
                total_tokens: (serialized_input.len() + content.len()) as u64,
                latency_ms: 0,
            },
            request_hash,
            response_hash,
        })
    }
}

/// Seeded provider used to test controlled non-determinism.
#[derive(Clone, Debug)]
pub struct RandomModel {
    seed: u64,
}

impl RandomModel {
    pub fn new(seed: u64) -> Self {
        Self { seed }
    }

    pub fn seed(&self) -> u64 {
        self.seed
    }
}

#[async_trait]
impl LlmProvider for RandomModel {
    fn provider_name(&self) -> &str {
        "random-test"
    }

    async fn generate(
        &self,
        messages: &[Message],
        _config: &GenerationConfig,
    ) -> anyhow::Result<LlmResponse> {
        let serialized_input = serialize_messages(messages);
        
        let content = if self.seed == 42 {
            "RESPONSE A"
        } else {
            "RESPONSE B"
        }
        .to_string();

        let request_hash = stable_hash(&format!("{}:{}", self.seed, serialized_input));
        let response_hash = stable_hash(&content);

        Ok(LlmResponse {
            content: Some(content.clone()),
            tool_calls: vec![],
            usage: TokenUsage {
                prompt_tokens: serialized_input.len() as u64,
                completion_tokens: content.len() as u64,
                total_tokens: (serialized_input.len() + content.len()) as u64,
                latency_ms: 0,
            },
            request_hash,
            response_hash,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::Role;

    fn test_messages() -> Vec<Message> {
        vec![Message {
            role: Role::User,
            content: "INPUT A".to_string(),
            tool_call_id: None,
        }]
    }

    #[tokio::test]
    async fn fake_model_is_stable_and_offline() {
        let model = FakeModel::new();
        let msgs = test_messages();
        let config = GenerationConfig::default();

        let first = model.generate(&msgs, &config).await.expect("failed");
        let second = model.generate(&msgs, &config).await.expect("failed");
        
        assert_eq!(first.content.as_deref(), Some("RESPONSE A"));
        assert_eq!(first.content, second.content);
        assert_eq!(first.request_hash, second.request_hash);
        assert_eq!(first.response_hash, second.response_hash);
        assert_eq!(first.usage.latency_ms, 0);
    }

    #[tokio::test]
    async fn random_model_reproduces_by_seed_but_can_diverge_functionally() {
        let msgs = test_messages();
        let config = GenerationConfig::default();

        let a1 = RandomModel::new(42).generate(&msgs, &config).await.expect("failed");
        let a2 = RandomModel::new(42).generate(&msgs, &config).await.expect("failed");
        let b = RandomModel::new(99).generate(&msgs, &config).await.expect("failed");

        assert_eq!(a1.content.as_deref(), Some("RESPONSE A"));
        assert_eq!(a1.content, a2.content);
        assert_eq!(a1.request_hash, a2.request_hash);
        
        assert_eq!(b.content.as_deref(), Some("RESPONSE B"));
        assert_ne!(a1.content, b.content);
        assert_ne!(a1.request_hash, b.request_hash);
    }
}


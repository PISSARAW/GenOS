use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

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

/// Deterministic, offline model used by runtime and integration tests.
///
/// The fixed mapping makes tests independent from provider availability,
/// sampling, latency, and model-version changes.
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

#[async_trait]
impl ModelProvider for FakeModel {
    async fn infer(&self, request: ModelRequest) -> anyhow::Result<ModelResponse> {
        let content = match request.prompt.as_str() {
            "INPUT A" => "RESPONSE A",
            prompt => prompt,
        }
        .to_string();
        let request_hash = stable_hash(&request.prompt);
        let response_hash = stable_hash(&content);

        Ok(ModelResponse {
            content: content.clone(),
            usage: ModelUsage {
                prompt_tokens: request.prompt.len() as u64,
                completion_tokens: content.len() as u64,
                total_tokens: (request.prompt.len() + content.len()) as u64,
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

    #[tokio::test]
    async fn fake_model_is_stable_and_offline() {
        let model = FakeModel::new();
        let request = ModelRequest {
            provider: "fake".to_string(),
            model: "fake-v1".to_string(),
            prompt: "INPUT A".to_string(),
            temperature: Some(0.9),
        };

        let first = model.infer(request.clone()).await.expect("fake model failed");
        let second = model.infer(request).await.expect("fake model failed");
        assert_eq!(first.content, "RESPONSE A");
        assert_eq!(first.content, second.content);
        assert_eq!(first.request_hash, second.request_hash);
        assert_eq!(first.response_hash, second.response_hash);
        assert_eq!(first.usage.latency_ms, 0);
    }

    #[tokio::test]
    async fn identical_sibling_branches_have_identical_replay_baseline() {
        let model = FakeModel::new();
        let request = ModelRequest {
            provider: "fake".to_string(),
            model: "fake-v1".to_string(),
            prompt: "INPUT A".to_string(),
            temperature: Some(0.0),
        };

        // A and B are sibling branches of the same snapshot. Branch identity
        // is deliberately not part of the model request: same state + same
        // input must establish the reproducibility baseline.
        let branch_a = model.infer(request.clone()).await.expect("branch A failed");
        let branch_b = model.infer(request).await.expect("branch B failed");

        assert_eq!(branch_a.content, branch_b.content);
        assert_eq!(branch_a.request_hash, branch_b.request_hash);
        assert_eq!(branch_a.response_hash, branch_b.response_hash);
        assert_eq!(branch_a.usage.total_tokens, branch_b.usage.total_tokens);
    }
}

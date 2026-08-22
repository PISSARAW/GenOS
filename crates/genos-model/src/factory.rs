use crate::adapters::openai::OpenAiAdapter;
use crate::fake::{FakeModel, RandomModel};
use crate::LlmProvider;
use anyhow::anyhow;

/// A factory to instantiate model providers based on URI schemes.
pub struct ModelFactory;

impl ModelFactory {
    /// Creates a provider from a given URI and optional API key.
    ///
    /// Examples:
    /// - "fake://test" -> FakeModel
    /// - "random://42" -> RandomModel(42)
    /// - "openai://gpt-4o" -> OpenAiAdapter
    pub fn create(uri: &str, api_key: Option<String>) -> anyhow::Result<Box<dyn LlmProvider>> {
        if uri.starts_with("fake://") {
            Ok(Box::new(FakeModel::new()))
        } else if uri.starts_with("random://") {
            let seed_str = uri.trim_start_matches("random://");
            let seed: u64 = seed_str.parse().unwrap_or(0);
            Ok(Box::new(RandomModel::new(seed)))
        } else if uri.starts_with("openai://") {
            let model_name = uri.trim_start_matches("openai://").to_string();
            let key = api_key.unwrap_or_else(|| "mock_key".to_string());
            Ok(Box::new(OpenAiAdapter::new(key, model_name)))
        } else {
            Err(anyhow!("Unknown model provider scheme: {}", uri))
        }
    }
}

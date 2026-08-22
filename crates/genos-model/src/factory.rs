use crate::adapters::openai::OpenAiAdapter;
use crate::adapters::providers::{JsonProvider, Protocol};
use crate::fake::{FakeModel, RandomModel};
use crate::LlmProvider;
use anyhow::anyhow;
use std::env;

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
        } else if uri.starts_with("mistral://") {
            let model_name = uri.trim_start_matches("mistral://").to_string();
            let key = api_key
                .or_else(|| env::var("MISTRAL_API_KEY").ok())
                .unwrap_or_default();
            Ok(Box::new(OpenAiAdapter::new_with_endpoint(
                key,
                model_name,
                "https://api.mistral.ai/v1/chat/completions",
                "mistral",
            )))
        } else if uri.starts_with("ollama://") {
            let model_name = uri.trim_start_matches("ollama://").to_string();
            let endpoint = env::var("GENOS_OLLAMA_ENDPOINT")
                .unwrap_or_else(|_| "http://localhost:11434/v1/chat/completions".into());
            Ok(Box::new(OpenAiAdapter::new_with_endpoint(
                String::new(),
                model_name,
                endpoint,
                "ollama",
            )))
        } else if uri.starts_with("lmstudio://") {
            let model_name = uri.trim_start_matches("lmstudio://").to_string();
            let endpoint = env::var("GENOS_LMSTUDIO_ENDPOINT")
                .unwrap_or_else(|_| "http://localhost:1234/v1/chat/completions".into());
            Ok(Box::new(OpenAiAdapter::new_with_endpoint(
                String::new(),
                model_name,
                endpoint,
                "lmstudio",
            )))
        } else if uri.starts_with("vllm://") {
            let model_name = uri.trim_start_matches("vllm://").to_string();
            let endpoint = env::var("GENOS_VLLM_ENDPOINT")
                .unwrap_or_else(|_| "http://localhost:8000/v1/chat/completions".into());
            Ok(Box::new(OpenAiAdapter::new_with_endpoint(
                api_key.unwrap_or_default(),
                model_name,
                endpoint,
                "vllm",
            )))
        } else if uri.starts_with("openai-compatible://") {
            let model_name = uri.trim_start_matches("openai-compatible://").to_string();
            let endpoint = env::var("GENOS_OPENAI_COMPATIBLE_ENDPOINT").map_err(|_| {
                anyhow!("GENOS_OPENAI_COMPATIBLE_ENDPOINT is required for openai-compatible://")
            })?;
            Ok(Box::new(OpenAiAdapter::new_with_endpoint(
                api_key.unwrap_or_default(),
                model_name,
                endpoint,
                "openai-compatible",
            )))
        } else if uri.starts_with("anthropic://") {
            let model = uri.trim_start_matches("anthropic://").to_string();
            let key = api_key
                .or_else(|| env::var("ANTHROPIC_API_KEY").ok())
                .unwrap_or_default();
            Ok(Box::new(JsonProvider::new(
                "anthropic",
                model,
                env::var("GENOS_ANTHROPIC_ENDPOINT")
                    .unwrap_or_else(|_| "https://api.anthropic.com/v1/messages".into()),
                key,
                Protocol::Anthropic,
            )))
        } else if uri.starts_with("gemini://") {
            let model = uri.trim_start_matches("gemini://").to_string();
            let key = api_key
                .or_else(|| env::var("GEMINI_API_KEY").ok())
                .unwrap_or_default();
            let endpoint = env::var("GENOS_GEMINI_ENDPOINT").unwrap_or_else(|_| format!("https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"));
            Ok(Box::new(JsonProvider::new(
                "gemini",
                model,
                endpoint,
                key,
                Protocol::Gemini,
            )))
        } else if uri.starts_with("cohere://") {
            let model = uri.trim_start_matches("cohere://").to_string();
            let key = api_key
                .or_else(|| env::var("COHERE_API_KEY").ok())
                .unwrap_or_default();
            Ok(Box::new(JsonProvider::new(
                "cohere",
                model,
                env::var("GENOS_COHERE_ENDPOINT")
                    .unwrap_or_else(|_| "https://api.cohere.com/v2/chat".into()),
                key,
                Protocol::Cohere,
            )))
        } else if uri.starts_with("bedrock://") {
            let model = uri.trim_start_matches("bedrock://").to_string();
            let endpoint = env::var("GENOS_BEDROCK_ENDPOINT")
                .map_err(|_| anyhow!("GENOS_BEDROCK_ENDPOINT is required for bedrock://"))?;
            Ok(Box::new(JsonProvider::new(
                "bedrock",
                model,
                endpoint,
                api_key.unwrap_or_default(),
                Protocol::Bedrock,
            )))
        } else if uri.starts_with("vertex://") {
            let model = uri.trim_start_matches("vertex://").to_string();
            let endpoint = env::var("GENOS_VERTEX_ENDPOINT")
                .map_err(|_| anyhow!("GENOS_VERTEX_ENDPOINT is required for vertex://"))?;
            Ok(Box::new(JsonProvider::new(
                "vertex",
                model,
                endpoint,
                api_key.unwrap_or_default(),
                Protocol::Vertex,
            )))
        } else {
            Err(anyhow!("Unknown model provider scheme: {}", uri))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn factory_routes_openai_compatible_providers() {
        assert_eq!(
            ModelFactory::create("ollama://llama3", None)
                .unwrap()
                .provider_name(),
            "ollama"
        );
        assert_eq!(
            ModelFactory::create("lmstudio://local", None)
                .unwrap()
                .provider_name(),
            "lmstudio"
        );
        assert_eq!(
            ModelFactory::create("vllm://qwen", None)
                .unwrap()
                .provider_name(),
            "vllm"
        );
        assert_eq!(
            ModelFactory::create("mistral://small", Some("key".into()))
                .unwrap()
                .provider_name(),
            "mistral"
        );
        assert_eq!(
            ModelFactory::create("anthropic://claude", Some("key".into()))
                .unwrap()
                .provider_name(),
            "anthropic"
        );
        assert_eq!(
            ModelFactory::create("gemini://flash", Some("key".into()))
                .unwrap()
                .provider_name(),
            "gemini"
        );
        assert_eq!(
            ModelFactory::create("cohere://command", Some("key".into()))
                .unwrap()
                .provider_name(),
            "cohere"
        );
    }
}

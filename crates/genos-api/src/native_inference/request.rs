use super::json_hash;
use reqwest::header::HeaderValue;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::net::SocketAddr;
use std::sync::{Arc, atomic::{AtomicBool, Ordering}};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum ProviderConfig {
    Ollama { address: SocketAddr, model: String, generation: u64 },
    #[serde(rename = "openai")]
    OpenAi { model: String, generation: u64 },
}

impl ProviderConfig {
    pub fn model(&self) -> &str {
        match self { Self::Ollama { model, .. } | Self::OpenAi { model, .. } => model }
    }
    pub fn generation(&self) -> u64 {
        match self { Self::Ollama { generation, .. } | Self::OpenAi { generation, .. } => *generation }
    }
    pub fn name(&self) -> &'static str {
        match self { Self::Ollama { .. } => "ollama", Self::OpenAi { .. } => "openai" }
    }
    pub(super) fn url(&self) -> Result<String, String> {
        match self {
            Self::Ollama { address, .. } if address.ip().is_loopback() && address.port() != 0 =>
                Ok(format!("http://{address}/api/chat")),
            Self::Ollama { .. } => Err("NATIVE_LLM_OLLAMA_REQUIRES_LOOPBACK_ADDRESS".into()),
            Self::OpenAi { .. } => Ok("https://api.openai.com/v1/chat/completions".into()),
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct Generation {
    pub max_output_tokens: u64,
    pub temperature_milli: u16,
}

impl Generation {
    pub fn validate(&self) -> Result<(), String> {
        if !(1..=32768).contains(&self.max_output_tokens) || self.temperature_milli > 2000 {
            return Err("NATIVE_LLM_GENERATION_LIMIT_INVALID".into());
        }
        Ok(())
    }
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Role { System, User, Assistant }

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct Message { pub role: Role, pub content: String }

#[derive(Clone)]
pub struct Credential { pub(super) bearer: HeaderValue }

impl Credential {
    pub fn new(value: String) -> Result<Self, String> {
        if value.trim().is_empty() || value.len() > 4096 { return Err("NATIVE_LLM_CREDENTIAL_INVALID".into()); }
        let mut bearer = HeaderValue::from_str(&format!("Bearer {value}")).map_err(|_| "NATIVE_LLM_CREDENTIAL_INVALID")?;
        bearer.set_sensitive(true);
        Ok(Self { bearer })
    }
}

impl std::fmt::Debug for Credential {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("Credential([REDACTED])")
    }
}

#[derive(Clone, Debug)]
pub struct InferenceRequest {
    pub operation_id: String,
    pub binding_hash: String,
    pub context_hash: String,
    pub actor_id: String,
    pub input_hash: String,
    pub provider: ProviderConfig,
    pub generation: Generation,
    pub messages: Vec<Message>,
    pub max_input_tokens: u64,
    pub expires_ms: u64,
    pub credential: Option<Credential>,
    pub cancelled: Option<Arc<AtomicBool>>,
}

pub fn request_descriptor(request: &InferenceRequest) -> Value {
    json!({"profile":"genos.native-inference/request/v1", "operation_id":request.operation_id,
        "binding_hash":request.binding_hash,"context_hash":request.context_hash,"actor_id":request.actor_id,
        "input_hash":request.input_hash,"provider":request.provider,"generation":request.generation,
        "messages":request.messages,"max_input_tokens":request.max_input_tokens,"expires_ms":request.expires_ms})
}

pub fn request_hash(request: &InferenceRequest) -> Result<String, String> {
    json_hash(&request_descriptor(request))
}

pub fn provider_config_hash(provider: &ProviderConfig) -> Result<String, String> {
    json_hash(&serde_json::to_value(provider).map_err(|error| error.to_string())?)
}

pub fn validate_provider(provider: &ProviderConfig) -> Result<(), String> {
    if provider.model().trim().is_empty() || provider.model().len() > 256 {
        return Err("NATIVE_LLM_MODEL_REQUIRED".into());
    }
    if provider.generation() == 0 { return Err("NATIVE_LLM_PROVIDER_GENERATION_REQUIRED".into()); }
    provider.url()?;
    Ok(())
}

pub fn validate_request(request: &InferenceRequest) -> Result<(), String> {
    request.validate_identity()?;
    request.validate_generation()?;
    request.validate_messages()?;
    validate_provider(&request.provider)
}

pub(super) fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as u64
}

impl InferenceRequest {
    pub(super) fn is_cancelled(&self) -> bool {
        self.cancelled.as_ref().is_some_and(|cancelled| cancelled.load(Ordering::Acquire))
    }

    pub(super) fn validate(&self) -> Result<(), String> {
        validate_request(self)?;
        match (&self.provider, &self.credential) {
            (ProviderConfig::OpenAi { .. }, None) => return Err("NATIVE_LLM_OPENAI_CREDENTIAL_REQUIRED".into()),
            (ProviderConfig::Ollama { .. }, Some(_)) => return Err("NATIVE_LLM_OLLAMA_CREDENTIAL_UNSUPPORTED".into()),
            _ => {}
        }
        Ok(())
    }

    fn validate_identity(&self) -> Result<(), String> {
        for value in [&self.operation_id, &self.binding_hash, &self.context_hash, &self.actor_id, &self.input_hash] {
            if value.trim().is_empty() || value.len() > 256 { return Err("NATIVE_LLM_IDENTITY_INVALID".into()); }
        }
        Ok(())
    }

    fn validate_generation(&self) -> Result<(), String> {
        self.generation.validate()?;
        if !(1..=1_000_000).contains(&self.max_input_tokens) { return Err("NATIVE_LLM_INPUT_LIMIT_INVALID".into()); }
        let remaining = self.expires_ms.checked_sub(now_ms()).ok_or("NATIVE_LLM_DEADLINE_EXPIRED")?;
        if remaining == 0 || remaining > 180000 { return Err("NATIVE_LLM_DEADLINE_OUT_OF_RANGE".into()); }
        if self.is_cancelled() { return Err("NATIVE_LLM_CANCELLED_BEFORE_DISPATCH".into()); }
        Ok(())
    }

    fn validate_messages(&self) -> Result<(), String> {
        if self.messages.is_empty() || self.messages.len() > 64 { return Err("NATIVE_LLM_MESSAGE_COUNT_INVALID".into()); }
        let mut size = 0usize;
        for message in &self.messages {
            if message.content.trim().is_empty() { return Err("NATIVE_LLM_EMPTY_MESSAGE".into()); }
            size = size.checked_add(message.content.len()).ok_or("NATIVE_LLM_PROMPT_TOO_LARGE")?;
        }
        if size > 65536 { return Err("NATIVE_LLM_PROMPT_TOO_LARGE".into()); }
        Ok(())
    }
}

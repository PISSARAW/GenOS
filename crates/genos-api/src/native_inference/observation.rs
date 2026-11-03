use super::request::{InferenceRequest, ProviderConfig, Generation, provider_config_hash, request_hash};
use super::json_hash;
use serde::Serialize;
use serde_json::json;

#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Finish { Complete, Truncated, Refused, ToolRequested, Incomplete }

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
pub struct TokenUsage {
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub total_tokens: Option<u64>,
}

#[derive(Clone, Debug, Serialize)]
pub(super) struct Identity {
    pub operation_id: String, pub binding_hash: String, pub context_hash: String,
    pub actor_id: String, pub input_hash: String, pub request_hash: String,
    pub provider_config_hash: String, pub provider: ProviderConfig,
    pub generation: Generation,
}

impl Identity {
    pub fn capture(request: &InferenceRequest) -> Result<Self, String> {
        let mut identity = Self::unhashed(request);
        identity.request_hash = request_hash(request)?;
        identity.provider_config_hash = provider_config_hash(&request.provider)?;
        Ok(identity)
    }
    pub fn unhashed(request: &InferenceRequest) -> Self {
        Self { operation_id: request.operation_id.clone(), binding_hash: request.binding_hash.clone(),
            context_hash: request.context_hash.clone(), actor_id: request.actor_id.clone(), input_hash: request.input_hash.clone(),
            request_hash: String::new(), provider_config_hash: String::new(), provider: request.provider.clone(),
            generation: request.generation.clone() }
    }
}

#[derive(Clone, Debug, Serialize)]
pub(super) struct ResponseFacts {
    pub status: u16,
    pub response_hash: String,
    pub provider_request_id: Option<String>,
    pub reported_model: Option<String>,
    pub input_tokens: Option<u64>,
    pub output_tokens: Option<u64>,
    pub total_tokens: Option<u64>,
    pub usage: Option<TokenUsage>,
    pub finish_reason: Option<String>,
    pub refusal: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
/// Une réponse reçue par le transport, jamais une preuve construite depuis JSON.
/// ```compile_fail
/// let _: genos_api::native_inference::ModelObservation =
///     serde_json::from_str("{}").unwrap();
/// ```
pub struct ModelObservation {
    identity: Identity,
    response: ResponseFacts,
    response_body: Vec<u8>,
    text: String,
    finish: Finish,
    elapsed_ms: u64,
    receipt_hash: String,
}

impl ModelObservation {
    pub(super) fn from_response(identity: Identity, response: (ResponseFacts, String, Finish, Vec<u8>), elapsed_ms: u64) -> Result<Self, String> {
        if super::bytes_hash(&response.3) != response.0.response_hash { return Err("NATIVE_LLM_RESPONSE_HASH_MISMATCH".into()); }
        let mut observation = Self { identity, response: response.0, text: response.1, finish: response.2,
            response_body: response.3, elapsed_ms, receipt_hash: String::new() };
        observation.receipt_hash = json_hash(&json!({"profile":"genos.native-inference/observation/v1",
            "observation":observation}))?;
        Ok(observation)
    }
    pub fn operation_id(&self) -> &str { &self.identity.operation_id }
    pub fn binding_hash(&self) -> &str { &self.identity.binding_hash }
    pub fn context_hash(&self) -> &str { &self.identity.context_hash }
    pub fn actor_id(&self) -> &str { &self.identity.actor_id }
    pub fn input_hash(&self) -> &str { &self.identity.input_hash }
    pub fn request_hash(&self) -> &str { &self.identity.request_hash }
    pub fn provider_config_hash(&self) -> &str { &self.identity.provider_config_hash }
    pub fn provider(&self) -> &ProviderConfig { &self.identity.provider }
    pub fn generation(&self) -> &Generation { &self.identity.generation }
    pub fn text(&self) -> &str { &self.text }
    pub fn output(&self) -> &[u8] { self.text.as_bytes() }
    pub fn response_hash(&self) -> &str { &self.response.response_hash }
    pub fn response_body(&self) -> &[u8] { &self.response_body }
    pub fn raw_response(&self) -> &[u8] { &self.response_body }
    pub fn receipt_hash(&self) -> &str { &self.receipt_hash }
    pub fn usage(&self) -> Option<&TokenUsage> { self.response.usage.as_ref() }
    pub fn observed_input_tokens(&self) -> Option<u64> { self.response.input_tokens }
    pub fn observed_output_tokens(&self) -> Option<u64> { self.response.output_tokens }
    pub fn observed_total_tokens(&self) -> Option<u64> { self.response.total_tokens }
    pub fn elapsed_ms(&self) -> u64 { self.elapsed_ms }
    pub fn http_status(&self) -> u16 { self.response.status }
    pub fn finish(&self) -> Finish { self.finish }
    pub fn finish_reason(&self) -> Option<&str> { self.response.finish_reason.as_deref() }
    pub fn refusal(&self) -> Option<&str> { self.response.refusal.as_deref() }
    pub fn reported_model(&self) -> Option<&str> { self.response.reported_model.as_deref() }
    pub fn provider_request_id(&self) -> Option<&str> { self.response.provider_request_id.as_deref() }
    pub fn assert_request(&self, request: &InferenceRequest) -> Result<(), String> {
        if self.request_hash() != request_hash(request)? { return Err("NATIVE_LLM_OBSERVATION_REQUEST_MISMATCH".into()); }
        Ok(())
    }
}

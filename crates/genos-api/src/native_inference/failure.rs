use super::observation::{Identity, ResponseFacts, TokenUsage};
use super::request::{InferenceRequest, ProviderConfig, request_hash};
use serde::Serialize;

#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum FailurePhase { BeforeDispatch, ObservedHttpFailure, OutcomeUnknown }

#[derive(Clone, Serialize)]
pub struct InferenceFailure {
    identity: Identity,
    phase: FailurePhase,
    message: String,
    elapsed_ms: u64,
    response: Option<ResponseFacts>,
    response_body: Option<Vec<u8>>,
}

impl InferenceFailure {
    pub(super) fn before(request: &InferenceRequest, message: String) -> Self {
        let identity = Identity::capture(request).unwrap_or_else(|_| Identity::unhashed(request));
        Self { identity, phase: FailurePhase::BeforeDispatch, message, elapsed_ms: 0,
            response: None, response_body: None }
    }
    pub(super) fn dispatched(identity: Identity, phase: FailurePhase, message: String) -> Self {
        Self { identity, phase, message, elapsed_ms: 0, response: None, response_body: None }
    }
    pub(super) fn with_response(mut self, response: ResponseFacts, body: Vec<u8>) -> Self {
        self.response = Some(response);
        self.response_body = Some(body);
        self
    }
    pub(super) fn with_elapsed(mut self, elapsed_ms: u64) -> Self { self.elapsed_ms = elapsed_ms; self }
    pub fn phase(&self) -> FailurePhase { self.phase }
    pub fn message(&self) -> &str { &self.message }
    pub fn operation_id(&self) -> &str { &self.identity.operation_id }
    pub fn binding_hash(&self) -> &str { &self.identity.binding_hash }
    pub fn context_hash(&self) -> &str { &self.identity.context_hash }
    pub fn actor_id(&self) -> &str { &self.identity.actor_id }
    pub fn input_hash(&self) -> &str { &self.identity.input_hash }
    pub fn request_hash(&self) -> &str { &self.identity.request_hash }
    pub fn provider_config_hash(&self) -> &str { &self.identity.provider_config_hash }
    pub fn provider(&self) -> &ProviderConfig { &self.identity.provider }
    pub fn elapsed_ms(&self) -> u64 { self.elapsed_ms }
    pub fn http_status(&self) -> Option<u16> { self.response.as_ref().map(|response| response.status) }
    pub fn response_hash(&self) -> Option<&str> { self.response.as_ref().map(|response| response.response_hash.as_str()) }
    pub fn response_body(&self) -> Option<&[u8]> { self.response_body.as_deref() }
    pub fn usage(&self) -> Option<&TokenUsage> { self.response.as_ref().and_then(|response| response.usage.as_ref()) }
    pub fn observed_input_tokens(&self) -> Option<u64> { self.response.as_ref().and_then(|response| response.input_tokens) }
    pub fn observed_output_tokens(&self) -> Option<u64> { self.response.as_ref().and_then(|response| response.output_tokens) }
    pub fn observed_total_tokens(&self) -> Option<u64> { self.response.as_ref().and_then(|response| response.total_tokens) }
    pub fn assert_request(&self, request: &InferenceRequest) -> Result<(), String> {
        if self.request_hash() != request_hash(request)? { return Err("NATIVE_LLM_FAILURE_REQUEST_MISMATCH".into()); }
        Ok(())
    }
}

impl std::fmt::Display for InferenceFailure {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(formatter, "{:?}: {}", self.phase, self.message)
    }
}

impl std::fmt::Debug for InferenceFailure {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.debug_struct("InferenceFailure").field("phase", &self.phase)
            .field("request_hash", &self.identity.request_hash).field("message", &self.message).finish()
    }
}
impl std::error::Error for InferenceFailure {}

use super::{InferenceRequest, InferenceFailure, FailurePhase, ModelObservation, Message, Role};
use super::observation::Identity;
use serde::{Serialize, Deserialize};
use serde_json::{Value, json};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
/// ID fournisseur OpenAI, ou corrélation locale déterministe si Ollama omet l'ID.
pub struct ToolCall { pub id: String, pub name: String, pub arguments: Value }

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct ToolDefinition { pub name: String, pub description: String, pub parameters: Value }

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "role", rename_all = "lowercase", deny_unknown_fields)]
pub enum ToolMessage {
    System { content: String },
    User { content: String },
    Assistant { content: String, tool_calls: Vec<ToolCall> },
    Tool { tool_call_id: String, name: String, content: String },
}

#[derive(Clone, Debug)]
/// Conversation effective entière. `base.messages` doit égaler `tool_base_messages(messages)`.
/// Les outils ne confèrent aucune autorité ; leur exécution reste une décision du runtime.
pub struct ToolInferenceRequest {
    pub base: InferenceRequest,
    pub messages: Vec<ToolMessage>,
    pub tools: Vec<ToolDefinition>,
}

/// Observation de vrais champs tool_calls HTTP, sans exécution ni autorité accordée.
/// ```compile_fail
/// let _: genos_api::native_inference::ToolObservation = serde_json::from_str("{}").unwrap();
/// ```
#[derive(Clone, Debug, Serialize)]
pub struct ToolObservation { native: ModelObservation, tool_calls: Vec<ToolCall> }

impl ToolObservation {
    pub fn native(&self) -> &ModelObservation { &self.native }
    pub fn tool_calls(&self) -> &[ToolCall] { &self.tool_calls }
    pub fn assert_request(&self, request: &ToolInferenceRequest) -> Result<(), String> {
        if self.native.request_hash() != tool_request_hash(request)? { return Err("NATIVE_LLM_TOOL_REQUEST_MISMATCH".into()); }
        Ok(())
    }
}

/// Projection déterministe ; les résultats d'outils restent uniquement dans le dialogue structuré.
pub fn tool_base_messages(messages: &[ToolMessage]) -> Vec<Message> {
    messages.iter().filter_map(|message| {
        let (role, content) = match message {
            ToolMessage::System { content } => (Role::System, content),
            ToolMessage::User { content } => (Role::User, content),
            ToolMessage::Assistant { content, .. } => (Role::Assistant, content),
            ToolMessage::Tool { .. } => return None,
        };
        (!content.trim().is_empty()).then(|| Message { role, content: content.clone() })
    }).collect()
}

pub fn tool_request_descriptor(request: &ToolInferenceRequest) -> Value {
    json!({"profile":"genos.native-inference/tools-request/v1",
        "base":super::request_descriptor(&request.base),"messages":request.messages,"tools":request.tools})
}

pub fn tool_request_hash(request: &ToolInferenceRequest) -> Result<String, String> {
    super::tool_validation::bounded(request)?;
    super::json_hash(&tool_request_descriptor(request))
}

pub fn validate_tool_request(request: &ToolInferenceRequest) -> Result<(), String> {
    super::tool_validation::validate(request)
}

pub fn execute_tools(request: &ToolInferenceRequest) -> Result<ToolObservation, InferenceFailure> {
    let mut identity = Identity::capture(&request.base).unwrap_or_else(|_| Identity::unhashed(&request.base));
    let hash = tool_request_hash(request);
    if let Ok(hash) = &hash { identity.request_hash = hash.clone(); }
    let before = |error| InferenceFailure::dispatched(identity.clone(), FailurePhase::BeforeDispatch, error);
    hash.map_err(before)?;
    validate_tool_request(request).map_err(before)?;
    let body = super::tool_wire::body(request).map_err(before)?;
    let native = super::transport::execute_bound((&request.base, identity), body)?;
    let decoded = super::tool_wire::decode(request, &native);
    match decoded {
        Ok((tool_calls, finish)) => {
            let original = native.clone();
            let native = native.with_finish(finish).map_err(|error| original.rejected(error))?;
            Ok(ToolObservation { native, tool_calls })
        }
        Err(error) => Err(native.rejected(error)),
    }
}

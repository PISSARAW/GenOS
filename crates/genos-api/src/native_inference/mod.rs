//! Transport natif explicite : aucune sélection par prompt, simulation ou relance.
mod request;
mod observation;
mod failure;
mod wire;
mod transport;
mod tools;
mod tool_validation;
mod tool_schema;
mod tool_wire;

pub use request::{Credential, Generation, InferenceRequest, Message, ProviderConfig, Role,
    provider_config_hash, request_descriptor, request_hash, validate_provider, validate_request};
pub use observation::{Finish, ModelObservation, TokenUsage};
pub use failure::{FailurePhase, InferenceFailure};
pub use transport::execute;
pub use tools::{ToolCall, ToolDefinition, ToolMessage, ToolInferenceRequest, ToolObservation,
    execute_tools, tool_base_messages, tool_request_descriptor, tool_request_hash, validate_tool_request};

use serde_json::Value;
use sha2::{Digest, Sha256};

pub(super) fn bytes_hash(bytes: &[u8]) -> String {
    format!("sha256:{:x}", Sha256::digest(bytes))
}

pub(super) fn json_hash(value: &Value) -> Result<String, String> {
    let canonical = sorted(value);
    serde_json::to_vec(&canonical).map(|bytes| bytes_hash(&bytes)).map_err(|error| error.to_string())
}

fn sorted(value: &Value) -> Value {
    match value {
        Value::Object(entries) => {
            let ordered: std::collections::BTreeMap<_, _> = entries.iter().collect();
            Value::Object(ordered.into_iter().map(|(key, entry)| (key.clone(), sorted(entry))).collect())
        }
        Value::Array(entries) => Value::Array(entries.iter().map(sorted).collect()),
        other => other.clone(),
    }
}

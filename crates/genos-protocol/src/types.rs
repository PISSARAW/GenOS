use serde::{Deserialize, Serialize};
use serde_json::Value;
use thiserror::Error;

pub const PROTOCOL_VERSION: &str = "genos.protocol/v1alpha1";

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ToolSpec {
    pub name: String,
    pub title: String,
    pub description: String,
    #[serde(rename = "inputSchema")]
    pub input_schema: Value,
    #[serde(rename = "outputSchema")]
    pub output_schema: Value,
    pub annotations: ToolAnnotations,
    #[serde(rename = "_meta")]
    pub meta: Value,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolAnnotations {
    pub read_only_hint: bool,
    pub destructive_hint: bool,
    pub idempotent_hint: bool,
    pub open_world_hint: bool,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct PlannedCommand {
    pub operation: String,
    pub args: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ProtocolResult {
    pub protocol_version: String,
    pub operation: String,
    pub exit_code: i32,
    pub output: Option<Value>,
    pub stdout: String,
    pub stderr: String,
}

impl ProtocolResult {
    pub fn new(
        operation: impl Into<String>,
        exit_code: i32,
        stdout: String,
        stderr: String,
    ) -> Self {
        let output = serde_json::from_str(stdout.trim()).ok();
        Self {
            protocol_version: PROTOCOL_VERSION.to_string(),
            operation: operation.into(),
            exit_code,
            output,
            stdout,
            stderr,
        }
    }
}

#[derive(Debug, Error, PartialEq)]
pub enum ProtocolError {
    #[error("unknown GenOS tool '{0}'")]
    UnknownTool(String),
    #[error("invalid input for {operation}: {message}")]
    InvalidInput { operation: String, message: String },
}

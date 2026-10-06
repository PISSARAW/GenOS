use crate::omega::{OmegaEnvelope, OmegaOperation};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;

pub type Handler = Box<dyn Fn(OperationContext) -> Result<Value, String> + Send + Sync>;

#[derive(Clone, Debug)]
pub struct OperationContext {
    pub operation: OmegaOperation,
    pub input: Value,
    pub context: Value,
    pub values: BTreeMap<String, Value>,
    pub receipt: Option<Value>,
}

#[derive(Clone, Debug, Default)]
pub struct ExecutionInput {
    pub context: Value,
    pub objects: BTreeMap<String, Value>,
    pub policy: BTreeMap<String, Vec<String>>,
    pub allow_emit: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct OperationResult {
    pub id: String,
    pub kind: String,
    pub status: String,
    pub reason: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct ExecutionResult {
    pub status: String,
    pub reason: Option<String>,
    pub results: Vec<OperationResult>,
    pub values: BTreeMap<String, Value>,
    pub digest: String,
}

pub struct ExecArgs<'a> {
    pub operation: &'a OmegaOperation,
    pub input: &'a ExecutionInput,
    pub values: &'a mut BTreeMap<String, Value>,
    pub receipts: &'a mut BTreeMap<String, Value>,
}
use crate::omega::{OmegaEnvelope, OmegaOperation};
use serde_json::Value;
use std::collections::{BTreeMap, HashMap};

use super::context::{ExecutionInput, OperationContext};
use super::handlers::{Handlers, Handler};

pub struct ReadArgs<'a> {
    pub operation: &'a OmegaOperation,
    pub context: OperationContext,
    pub input: &'a ExecutionInput,
    pub values: &'a mut BTreeMap<String, Value>,
    pub reference: &'a str,
    pub handlers: &'a Handlers,
}

pub struct InvokeArgs<'a> {
    pub operation: &'a OmegaOperation,
    pub context: OperationContext,
    pub handlers: &'a HashMap<String, Box<dyn Fn(OperationContext) -> Result<Value, String> + Send + Sync>>,
    pub values: &'a mut BTreeMap<String, Value>,
    pub reference: &'a str,
    pub missing: &'a str,
}

pub struct CheckArgs<'a> {
    pub operation: &'a OmegaOperation,
    pub context: OperationContext,
    pub handlers: &'a HashMap<String, Box<dyn Fn(OperationContext) -> Result<Value, String> + Send + Sync>>,
    pub values: &'a mut BTreeMap<String, Value>,
    pub receipts: &'a mut BTreeMap<String, Value>,
    pub reference: &'a str,
}

pub struct EmitArgs<'a> {
    pub operation: &'a OmegaOperation,
    pub context: OperationContext,
    pub input: &'a ExecutionInput,
    pub values: &'a mut BTreeMap<String, Value>,
    pub receipts: &'a BTreeMap<String, Value>,
    pub reference: &'a str,
    pub handlers: &'a Handlers,
}
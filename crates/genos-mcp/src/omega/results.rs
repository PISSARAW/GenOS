use crate::omega::OmegaOperation;
use serde_json::Value;
use std::collections::BTreeMap;

use super::context::{ExecutionResult, OperationResult};

pub fn ready(operation: &OmegaOperation) -> OperationResult {
    OperationResult {
        id: operation.0.clone(),
        kind: operation.1.clone(),
        status: "ready".into(),
        reason: None,
    }
}

pub fn emitted(operation: &OmegaOperation) -> OperationResult {
    OperationResult {
        id: operation.0.clone(),
        kind: operation.1.clone(),
        status: "emitted".into(),
        reason: None,
    }
}

pub fn blocked_operation(operation: &OmegaOperation, reason: String) -> OperationResult {
    OperationResult {
        id: operation.0.clone(),
        kind: operation.1.clone(),
        status: "blocked".into(),
        reason: Some(reason),
    }
}

pub fn blocked(reason: String) -> ExecutionResult {
    blocked_with(Vec::new(), BTreeMap::new(), &reason)
}

pub fn blocked_with(
    results: Vec<OperationResult>,
    values: BTreeMap<String, Value>,
    reason: &str,
) -> ExecutionResult {
    let mut result = ExecutionResult {
        status: "blocked".into(),
        reason: Some(reason.into()),
        results,
        values,
        digest: String::new(),
    };
    result.digest = super::execution::digest(&result.results);
    result
}
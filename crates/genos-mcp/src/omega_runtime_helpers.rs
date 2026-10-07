use super::{ExecutionInput, ExecutionResult, OmegaOperation, OperationResult};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
fn input_policy(input: &ExecutionInput) -> BTreeMap<String, Vec<String>> {
    input.policy.clone()
}

pub(super) fn allowed(policy: &BTreeMap<String, Vec<String>>, kind: &str, reference: Option<&str>) -> bool {
    policy.get(&kind.to_lowercase()).is_some_and(|references| {
        reference.is_some_and(|value| references.iter().any(|item| item == value))
    })
}

pub(super) fn operation_input(operation: &OmegaOperation, values: &BTreeMap<String, Value>) -> Value {
    let inputs: Vec<Value> = operation
        .3
        .iter()
        .filter_map(|id| values.get(id).cloned())
        .collect();
    match inputs.len() {
        0 => Value::Null,
        1 => inputs.into_iter().next().unwrap_or(Value::Null),
        _ => Value::Array(inputs),
    }
}

pub(super) fn ready(operation: &OmegaOperation) -> OperationResult {
    OperationResult {
        id: operation.0.clone(),
        kind: operation.1.clone(),
        status: "ready".into(),
        reason: None,
    }
}

pub(super) fn emitted(operation: &OmegaOperation) -> OperationResult {
    OperationResult {
        id: operation.0.clone(),
        kind: operation.1.clone(),
        status: "emitted".into(),
        reason: None,
    }
}

pub(super) fn blocked_operation(operation: &OmegaOperation, reason: String) -> OperationResult {
    OperationResult {
        id: operation.0.clone(),
        kind: operation.1.clone(),
        status: "blocked".into(),
        reason: Some(reason),
    }
}

pub(super) fn blocked(reason: String) -> ExecutionResult {
    blocked_with(Vec::new(), BTreeMap::new(), &reason)
}

pub(super) fn blocked_with(
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
    result.digest = digest(&result.results);
    result
}

pub(super) fn digest(results: &[OperationResult]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(serde_json::to_vec(results).unwrap_or_default());
    format!("sha256:{:x}", hasher.finalize())
}


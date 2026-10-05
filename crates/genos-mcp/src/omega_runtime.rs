use crate::omega::{validate, OmegaEnvelope, OmegaOperation};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, HashMap, HashSet};

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

#[derive(Default)]
pub struct OmegaRuntime {
    readers: HashMap<String, Handler>,
    selectors: HashMap<String, Handler>,
    tools: HashMap<String, Handler>,
    inferers: HashMap<String, Handler>,
    verifiers: HashMap<String, Handler>,
    emitters: HashMap<String, Handler>,
}

impl OmegaRuntime {
    pub fn register_reader<F>(&mut self, reference: &str, handler: F)
    where
        F: Fn(OperationContext) -> Result<Value, String> + Send + Sync + 'static,
    {
        self.readers.insert(reference.into(), Box::new(handler));
    }

    pub fn register_selector<F>(&mut self, reference: &str, handler: F)
    where
        F: Fn(OperationContext) -> Result<Value, String> + Send + Sync + 'static,
    {
        self.selectors.insert(reference.into(), Box::new(handler));
    }

    pub fn register_tool<F>(&mut self, reference: &str, handler: F)
    where
        F: Fn(OperationContext) -> Result<Value, String> + Send + Sync + 'static,
    {
        self.tools.insert(reference.into(), Box::new(handler));
    }

    pub fn register_inferer<F>(&mut self, reference: &str, handler: F)
    where
        F: Fn(OperationContext) -> Result<Value, String> + Send + Sync + 'static,
    {
        self.inferers.insert(reference.into(), Box::new(handler));
    }

    pub fn register_verifier<F>(&mut self, reference: &str, handler: F)
    where
        F: Fn(OperationContext) -> Result<Value, String> + Send + Sync + 'static,
    {
        self.verifiers.insert(reference.into(), Box::new(handler));
    }

    pub fn register_emitter<F>(&mut self, reference: &str, handler: F)
    where
        F: Fn(OperationContext) -> Result<Value, String> + Send + Sync + 'static,
    {
        self.emitters.insert(reference.into(), Box::new(handler));
    }

    pub fn execute(&self, envelope: &OmegaEnvelope, input: ExecutionInput) -> ExecutionResult {
        if let Err(reason) = validate(envelope) {
            return blocked(reason);
        }
        let mut input = input;
        if input.policy.is_empty() {
            input.policy = envelope.policy.iter().cloned().collect();
        }
        let mut values = BTreeMap::new();
        let mut receipts = BTreeMap::new();
        let mut completed = HashSet::new();
        let mut pending = envelope.operations.clone();
        let mut results = Vec::new();
        while !pending.is_empty() {
            let Some(index) = pending.iter().position(|operation| {
                operation
                    .3
                    .iter()
                    .all(|dependency| completed.contains(dependency))
            }) else {
                return blocked_with(results, values, "dependency_execution_failed");
            };
            let operation = pending.remove(index);
            let result = self.execute_operation(&operation, &input, &mut values, &mut receipts);
            let entry = OperationResult {
                id: operation.0.clone(),
                kind: operation.1.clone(),
                status: result.status.clone(),
                reason: result.reason.clone(),
            };
            results.push(entry);
            if result.status == "blocked" {
                return blocked_with(
                    results,
                    values,
                    result.reason.as_deref().unwrap_or("operation_failed"),
                );
            }
            completed.insert(operation.0);
        }
        let digest = digest(&results);
        ExecutionResult {
            status: "emitted".into(),
            reason: None,
            results,
            values,
            digest,
        }
    }

    fn execute_operation(
        &self,
        operation: &OmegaOperation,
        input: &ExecutionInput,
        values: &mut BTreeMap<String, Value>,
        receipts: &mut BTreeMap<String, Value>,
    ) -> OperationResult {
        let context = OperationContext {
            operation: operation.clone(),
            input: operation_input(operation, values),
            context: input.context.clone(),
            values: values.clone(),
            receipt: None,
        };
        if !allowed(&input_policy(input), &operation.1, operation.2.as_deref()) {
            return blocked_operation(
                operation,
                format!("{}_not_authorized", operation.1.to_lowercase()),
            );
        }
        let reference = operation.2.clone().unwrap_or_default();
        match operation.1.as_str() {
            "READ" => self.read(operation, context, input, values, &reference),
            "SELECT" => self.invoke(
                operation,
                context,
                &self.selectors,
                values,
                &reference,
                "selector_missing",
            ),
            "CALL" => self.invoke(
                operation,
                context,
                &self.tools,
                values,
                &reference,
                "tool_missing",
            ),
            "INFER" => self.invoke(
                operation,
                context,
                &self.inferers,
                values,
                &reference,
                "inferer_missing",
            ),
            "CHECK" => self.check(
                operation,
                context,
                &self.verifiers,
                values,
                receipts,
                &reference,
            ),
            "EMIT" => self.emit(operation, context, input, values, receipts, &reference),
            _ => blocked_operation(operation, "operation_kind_invalid".into()),
        }
    }

    fn read(
        &self,
        operation: &OmegaOperation,
        context: OperationContext,
        input: &ExecutionInput,
        values: &mut BTreeMap<String, Value>,
        reference: &str,
    ) -> OperationResult {
        let value = self
            .readers
            .get(reference)
            .map(|handler| handler(context))
            .unwrap_or_else(|| {
                input
                    .objects
                    .get(reference)
                    .cloned()
                    .ok_or_else(|| "reader_missing".into())
            });
        match value {
            Ok(value) => {
                values.insert(operation.0.clone(), value);
                ready(operation)
            }
            Err(reason) => blocked_operation(operation, reason),
        }
    }

    fn invoke(
        &self,
        operation: &OmegaOperation,
        context: OperationContext,
        handlers: &HashMap<String, Handler>,
        values: &mut BTreeMap<String, Value>,
        reference: &str,
        missing: &str,
    ) -> OperationResult {
        let Some(handler) = handlers.get(reference) else {
            return blocked_operation(operation, missing.into());
        };
        match handler(context) {
            Ok(value) => {
                values.insert(operation.0.clone(), value);
                ready(operation)
            }
            Err(reason) => blocked_operation(operation, reason),
        }
    }

    fn check(
        &self,
        operation: &OmegaOperation,
        context: OperationContext,
        handlers: &HashMap<String, Handler>,
        values: &mut BTreeMap<String, Value>,
        receipts: &mut BTreeMap<String, Value>,
        reference: &str,
    ) -> OperationResult {
        let Some(handler) = handlers.get(reference) else {
            return blocked_operation(operation, "verifier_missing".into());
        };
        match handler(context) {
            Ok(receipt) if verified(&receipt) => {
                receipts.insert(operation.0.clone(), receipt);
                values.insert(operation.0.clone(), operation_input(operation, values));
                OperationResult {
                    id: operation.0.clone(),
                    kind: operation.1.clone(),
                    status: "verified".into(),
                    reason: None,
                }
            }
            Ok(_) => blocked_operation(operation, "verification_failed".into()),
            Err(reason) => blocked_operation(operation, reason),
        }
    }

    fn emit(
        &self,
        operation: &OmegaOperation,
        context: OperationContext,
        input: &ExecutionInput,
        values: &mut BTreeMap<String, Value>,
        receipts: &BTreeMap<String, Value>,
        reference: &str,
    ) -> OperationResult {
        if !input.allow_emit {
            return blocked_operation(operation, "emit_not_authorized".into());
        }
        let receipt = operation.3.iter().find_map(|id| receipts.get(id)).cloned();
        if receipt.as_ref().is_none_or(|value| !verified(value)) {
            return blocked_operation(operation, "emit_requires_verified_receipt".into());
        }
        let Some(handler) = self.emitters.get(reference) else {
            return blocked_operation(operation, "emitter_missing".into());
        };
        let result = handler(OperationContext { receipt, ..context });
        match result {
            Ok(value) => {
                values.insert(operation.0.clone(), value);
                ready(operation)
            }
            Err(reason) => blocked_operation(operation, reason),
        }
    }
}

fn input_policy(input: &ExecutionInput) -> BTreeMap<String, Vec<String>> {
    input.policy.clone()
}

fn allowed(policy: &BTreeMap<String, Vec<String>>, kind: &str, reference: Option<&str>) -> bool {
    policy.get(&kind.to_lowercase()).is_some_and(|references| {
        reference.is_some_and(|value| references.iter().any(|item| item == value))
    })
}

fn operation_input(operation: &OmegaOperation, values: &BTreeMap<String, Value>) -> Value {
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

fn verified(value: &Value) -> bool {
    value.get("valid").and_then(Value::as_bool) == Some(true)
        || matches!(
            value.get("status").and_then(Value::as_str),
            Some("verified" | "formally_proved")
        )
}

fn ready(operation: &OmegaOperation) -> OperationResult {
    OperationResult {
        id: operation.0.clone(),
        kind: operation.1.clone(),
        status: "ready".into(),
        reason: None,
    }
}

fn blocked_operation(operation: &OmegaOperation, reason: String) -> OperationResult {
    OperationResult {
        id: operation.0.clone(),
        kind: operation.1.clone(),
        status: "blocked".into(),
        reason: Some(reason),
    }
}

fn blocked(reason: String) -> ExecutionResult {
    blocked_with(Vec::new(), BTreeMap::new(), &reason)
}

fn blocked_with(
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

fn digest(results: &[OperationResult]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(serde_json::to_vec(results).unwrap_or_default());
    format!("sha256:{:x}", hasher.finalize())
}

#[cfg(test)]
#[path = "omega_runtime_tests.rs"]
mod tests;

use crate::omega::{validate, OmegaEnvelope, OmegaOperation};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, HashSet};

use super::context::{ExecArgs, ExecutionInput, ExecutionResult, OperationContext, OperationResult};
use super::handlers::Handlers;
use super::results::{blocked, blocked_operation, blocked_with, emitted, ready};

pub fn execute(envelope: &OmegaEnvelope, input: ExecutionInput, handlers: &Handlers) -> ExecutionResult {
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
        let args = ExecArgs { operation: &operation, input: &input, values: &mut values, receipts: &mut receipts };
        let result = execute_operation(args, handlers);
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
    args: ExecArgs<'_>,
    handlers: &Handlers,
) -> OperationResult {
    let operation = args.operation;
    let context = OperationContext {
        operation: operation.clone(),
        input: operation_input(operation, args.values),
        context: args.input.context.clone(),
        values: args.values.clone(),
        receipt: None,
    };
    if !allowed(&input_policy(args.input), &operation.1, operation.2.as_deref()) {
        return blocked_operation(
            operation,
            format!("{}_not_authorized", operation.1.to_lowercase()),
        );
    }
    let reference = operation.2.clone().unwrap_or_default();
    match operation.1.as_str() {
        "READ" => read(ReadArgs { operation, context, input: args.input, values: args.values, reference: &reference, handlers }),
        "SELECT" => invoke(InvokeArgs {
            operation,
            context,
            handler: handlers.get_selector(&reference),
            values: args.values,
            reference: &reference,
            missing: "selector_missing",
        }),
        "CALL" => invoke(InvokeArgs {
            operation,
            context,
            handler: handlers.get_tool(&reference),
            values: args.values,
            reference: &reference,
            missing: "tool_missing",
        }),
        "INFER" => invoke(InvokeArgs {
            operation,
            context,
            handler: handlers.get_inferer(&reference),
            values: args.values,
            reference: &reference,
            missing: "inferer_missing",
        }),
        "CHECK" => check(CheckArgs {
            operation,
            context,
            handler: handlers.get_verifier(&reference),
            values: args.values,
            receipts: args.receipts,
            reference: &reference,
        }),
        "EMIT" => emit(EmitArgs {
            operation,
            context,
            input: args.input,
            values: args.values,
            receipts: args.receipts,
            reference: &reference,
            handlers,
        }),
        _ => blocked_operation(operation, "operation_kind_invalid".into()),
    }
}

struct ReadArgs<'a> {
    operation: &'a OmegaOperation,
    context: OperationContext,
    input: &'a ExecutionInput,
    values: &'a mut BTreeMap<String, Value>,
    reference: &'a str,
    handlers: &'a Handlers,
}

struct InvokeArgs<'a> {
    operation: &'a OmegaOperation,
    context: OperationContext,
    handler: Option<&'a Box<dyn Fn(OperationContext) -> Result<Value, String> + Send + Sync>>,
    values: &'a mut BTreeMap<String, Value>,
    reference: &'a str,
    missing: &'a str,
}

struct CheckArgs<'a> {
    operation: &'a OmegaOperation,
    context: OperationContext,
    handler: Option<&'a Box<dyn Fn(OperationContext) -> Result<Value, String> + Send + Sync>>,
    values: &'a mut BTreeMap<String, Value>,
    receipts: &'a mut BTreeMap<String, Value>,
    reference: &'a str,
}

struct EmitArgs<'a> {
    operation: &'a OmegaOperation,
    context: OperationContext,
    input: &'a ExecutionInput,
    values: &'a mut BTreeMap<String, Value>,
    receipts: &'a BTreeMap<String, Value>,
    reference: &'a str,
    handlers: &'a Handlers,
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

fn read(args: ReadArgs) -> OperationResult {
    let ReadArgs { operation, context, input, values, reference, handlers } = args;
    let value = handlers
        .get_reader(reference)
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

fn invoke(args: InvokeArgs) -> OperationResult {
    let InvokeArgs { operation, context, handler, values, reference, missing } = args;
    let Some(handler) = handler else {
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

fn check(args: CheckArgs) -> OperationResult {
    let CheckArgs { operation, context, handler, values, receipts, reference } = args;
    let Some(handler) = handler else {
        return blocked_operation(operation, "verifier_missing".into());
    };
    match handler(context) {
        Ok(receipt) if super::proofs::verified(&receipt) => {
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

fn emit(args: EmitArgs) -> OperationResult {
    let EmitArgs { operation, context, input, values, receipts, reference, handlers } = args;
    if !input.allow_emit {
        return blocked_operation(operation, "emit_not_authorized".into());
    }
    let Some((candidate, receipt)) = super::proofs::emission(operation, values, receipts) else {
        return blocked_operation(operation, "emit_requires_verified_receipt".into());
    };
    let Some(handler) = handlers.get_emitter(reference) else {
        return blocked_operation(operation, "emitter_missing".into());
    };
    let result = handler(OperationContext { receipt: Some(receipt), input: candidate, ..context });
    match result {
        Ok(value) => {
            values.insert(operation.0.clone(), value);
            emitted(operation)
        }
        Err(reason) => blocked_operation(operation, reason),
    }
}

fn digest(results: &[OperationResult]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(serde_json::to_vec(results).unwrap_or_default());
    format!("sha256:{:x}", hasher.finalize())
}
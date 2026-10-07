use super::{OmegaRuntime, OperationContext, OperationResult, OmegaOperation, ExecutionInput, Handler, ready, emitted, blocked_operation, operation_input, proofs};
use serde_json::Value;
use std::collections::{BTreeMap, HashMap};

pub struct ReadArgs<'a> {
    pub operation: &'a OmegaOperation,
    pub context: OperationContext,
    pub input: &'a ExecutionInput,
    pub values: &'a mut BTreeMap<String, Value>,
    pub reference: &'a str,
}

pub struct InvokeArgs<'a> {
    pub operation: &'a OmegaOperation,
    pub context: OperationContext,
    pub handlers: &'a HashMap<String, Handler>,
    pub values: &'a mut BTreeMap<String, Value>,
    pub reference: &'a str,
    pub missing: &'a str,
}

pub struct CheckArgs<'a> {
    pub operation: &'a OmegaOperation,
    pub context: OperationContext,
    pub handlers: &'a HashMap<String, Handler>,
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
}

impl OmegaRuntime {
    pub fn read(&self, args: ReadArgs) -> OperationResult {
        let ReadArgs { operation, context, input, values, reference } = args;
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

    pub fn invoke(&self, args: InvokeArgs) -> OperationResult {
        let InvokeArgs { operation, context, handlers, values, reference, missing } = args;
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

    pub fn check(&self, args: CheckArgs) -> OperationResult {
        let CheckArgs { operation, context, handlers, values, receipts, reference } = args;
        let Some(handler) = handlers.get(reference) else {
            return blocked_operation(operation, "verifier_missing".into());
        };
        match handler(context) {
            Ok(receipt) if proofs::verified(&receipt) => {
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

    pub fn emit(&self, args: EmitArgs) -> OperationResult {
        let EmitArgs { operation, context, input, values, receipts, reference } = args;
        if !input.allow_emit {
            return blocked_operation(operation, "emit_not_authorized".into());
        }
        let Some((candidate, receipt)) = proofs::emission(operation, values, receipts) else {
            return blocked_operation(operation, "emit_requires_verified_receipt".into());
        };
        let Some(handler) = self.emitters.get(reference) else {
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
}

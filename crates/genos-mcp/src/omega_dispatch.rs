use crate::executor;
use crate::omega::{read_compatible_json, OmegaEnvelope};
use crate::omega_runtime::{ExecutionInput, OmegaRuntime};
use crate::omega_semantic_registry;
use crate::tools;
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::path::Path;

pub fn execute(params: &Value, workspace: &Path) -> Value {
    let source = params.get("envelope").unwrap_or(params);
    let bytes = match serde_json::to_vec(source) {
        Ok(bytes) => bytes,
        Err(error) => return blocked(format!("omega_envelope_encode_failed:{error}")),
    };
    let envelope = match read_compatible_json(&bytes) {
        Ok(envelope) => envelope,
        Err(error) => return blocked(error),
    };
    if let Err(error) = omega_semantic_registry::validate(&envelope) {
        return blocked(error);
    }
    let mut runtime = OmegaRuntime::default();
    register_selectors(&mut runtime, &envelope);
    register_values(&mut runtime, params, &envelope);
    register_tools(&mut runtime, params, &envelope, workspace);
    let input = ExecutionInput {
        context: params.get("context").cloned().unwrap_or(Value::Null),
        objects: object_map(params.get("objects")),
        policy: envelope.policy.iter().cloned().collect(),
        allow_emit: params
            .get("allowEmit")
            .and_then(Value::as_bool)
            .unwrap_or(false),
    };
    serde_json::to_value(runtime.execute(&envelope, input))
        .unwrap_or_else(|error| json!({ "status": "blocked", "reason": error.to_string() }))
}

fn object_map(value: Option<&Value>) -> BTreeMap<String, Value> {
    value
        .and_then(Value::as_object)
        .map(|items| items.clone().into_iter().collect())
        .unwrap_or_default()
}

fn register_selectors(runtime: &mut OmegaRuntime, envelope: &OmegaEnvelope) {
    for operation in envelope.operations.iter().filter(|item| item.1 == "SELECT") {
        let reference = operation.2.clone().unwrap_or_default();
        runtime.register_selector(&reference, |context| Ok(context.input));
    }
}

fn register_values(runtime: &mut OmegaRuntime, params: &Value, envelope: &OmegaEnvelope) {
    register_map(runtime, params.get("inferenceResults"), envelope, "INFER");
    register_map(
        runtime,
        params.get("verificationReceipts"),
        envelope,
        "CHECK",
    );
    register_map(runtime, params.get("emissionResults"), envelope, "EMIT");
}

fn register_map(
    runtime: &mut OmegaRuntime,
    values: Option<&Value>,
    envelope: &OmegaEnvelope,
    kind: &str,
) {
    let Some(values) = values.and_then(Value::as_object) else {
        return;
    };
    for operation in envelope.operations.iter().filter(|item| item.1 == kind) {
        let reference = operation.2.clone().unwrap_or_default();
        let Some(value) = values.get(&reference).cloned() else {
            continue;
        };
        runtime_handler(runtime, kind, &reference, value);
    }
}

fn runtime_handler(runtime: &mut OmegaRuntime, kind: &str, reference: &str, value: Value) {
    match kind {
        "INFER" => runtime.register_inferer(reference, move |_| Ok(value.clone())),
        "CHECK" => runtime.register_verifier(reference, move |_| Ok(value.clone())),
        "EMIT" => runtime.register_emitter(reference, move |_| Ok(value.clone())),
        _ => {}
    }
}

fn register_tools(
    runtime: &mut OmegaRuntime,
    params: &Value,
    envelope: &OmegaEnvelope,
    workspace: &Path,
) {
    let Some(mapping) = params.get("toolMap").and_then(Value::as_object) else {
        return;
    };
    for operation in envelope.operations.iter().filter(|item| item.1 == "CALL") {
        let reference = operation.2.clone().unwrap_or_default();
        let Some(name) = mapping
            .get(&reference)
            .and_then(Value::as_str)
            .map(String::from)
        else {
            continue;
        };
        let root = workspace.to_path_buf();
        runtime.register_tool(&reference, move |context| {
            let args = if context.input.is_object() {
                context.input.clone()
            } else {
                json!({ "input": context.input })
            };
            if !tools::is_tool_allowed_for_call(&name, &args) {
                return Err("tool_not_allowed".into());
            }
            let (code, output) = executor::handle_tool_call(&name, &args, &root);
            if code != 0 {
                return Err(output);
            }
            serde_json::from_str(&output).or_else(|_| Ok(json!({ "text": output })))
        });
    }
}

fn blocked(reason: String) -> Value {
    json!({ "status": "blocked", "reason": reason })
}

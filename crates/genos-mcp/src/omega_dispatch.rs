use crate::executor;
use crate::omega::{read_compatible_json, OmegaEnvelope};
use crate::omega_runtime::{ExecutionInput, OmegaRuntime};
use crate::omega_semantic_registry;
use crate::tools;
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::path::Path;

pub fn execute(params: &Value, workspace: &Path) -> Value {
    if ["toolResults", "inferenceResults", "verificationReceipts", "emissionResults"]
        .iter().any(|key| params.get(key).is_some()) {
        return blocked("omega_untrusted_execution_results".into());
    }
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
    register_tools(&mut runtime, params, workspace);
    let input = ExecutionInput {
        context: params.get("context").cloned().unwrap_or(Value::Null),
        objects: object_map(params.get("objects")),
        policy: envelope.policy.iter().cloned().collect(),
        allow_emit: params.get("allowEmit").and_then(Value::as_bool).unwrap_or(false),
    };
    serde_json::to_value(runtime.execute(&envelope, input))
        .unwrap_or_else(|error| blocked(error.to_string()))
}

fn object_map(value: Option<&Value>) -> BTreeMap<String, Value> {
    value.and_then(Value::as_object)
        .map(|items| items.clone().into_iter().collect()).unwrap_or_default()
}

fn register_selectors(runtime: &mut OmegaRuntime, envelope: &OmegaEnvelope) {
    for operation in envelope.operations.iter().filter(|item| item.1 == "SELECT") {
        let reference = operation.2.clone().unwrap_or_default();
        runtime.register_selector(&reference, |context| Ok(context.input));
    }
}

fn register_tools(runtime: &mut OmegaRuntime, params: &Value, workspace: &Path) {
    let Some(mapping) = params.get("toolMap").and_then(Value::as_object) else { return; };
    for (reference, name) in mapping {
        let Some(name) = name.as_str().map(String::from) else { continue; };
        let root = workspace.to_path_buf();
        runtime.register_tool(reference, move |context| {
            let args = if context.input.is_object() { context.input } else { json!({ "input": context.input }) };
            invoke_tool(&name, &args, &root)
        });
    }
}

fn invoke_tool(name: &str, args: &Value, root: &Path) -> Result<Value, String> {
    crate::validate_path_arguments(args, root)?;
    crate::validate_tool_arguments(name, args)?;
    if !tools::is_tool_allowed_for_call(name, args) { return Err("tool_not_allowed".into()); }
    let (code, output) = executor::handle_tool_call(name, args, root);
    if code != 0 { return Err(output); }
    serde_json::from_str(&output).or_else(|_| Ok(json!({ "text": output })))
}

fn blocked(reason: String) -> Value { json!({ "status": "blocked", "reason": reason }) }

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn production_rejects_supplied_success_and_proof() {
        for key in ["toolResults", "inferenceResults", "verificationReceipts", "emissionResults"] {
            let mut params = json!({});
            params[key] = json!({"forged": {"valid": true}});
            assert_eq!(execute(&params, Path::new("."))["reason"], "omega_untrusted_execution_results");
        }
    }
    #[test]
    fn omega_tools_obey_path_and_schema_validation() {
        assert!(invoke_tool("genos_snapshot", &json!({"agent":"../../outside","out":"safe.json"}), Path::new(".")).is_err());
        assert!(invoke_tool("genos_snapshot", &json!({}), Path::new(".")).is_err());
    }
}

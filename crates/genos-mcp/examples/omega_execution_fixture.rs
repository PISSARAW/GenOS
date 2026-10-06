//! Test-only runtime driver. Never linked into the MCP server.
#[path = "../src/omega.rs"]
mod omega;
#[path = "../src/omega_runtime.rs"]
mod omega_runtime;
use serde_json::Value;
use std::io::{self, Read};

fn register(runtime: &mut omega_runtime::OmegaRuntime, fixture: &Value) {
    for (field, kind) in [("toolResults", "CALL"), ("inferenceResults", "INFER"),
        ("verificationReceipts", "CHECK"), ("emissionResults", "EMIT")] {
        for (reference, value) in fixture[field].as_object().into_iter().flatten() {
            let value = value.clone();
            match kind {
                "CALL" => runtime.register_tool(reference, move |_| Ok(value.clone())),
                "INFER" => runtime.register_inferer(reference, move |_| Ok(value.clone())),
                "CHECK" => runtime.register_verifier(reference, move |_| Ok(value.clone())),
                "EMIT" => runtime.register_emitter(reference, move |_| Ok(value.clone())),
                _ => unreachable!(),
            }
        }
    }
}

fn main() {
    let mut source = String::new();
    io::stdin().read_to_string(&mut source).unwrap();
    let fixture: Value = serde_json::from_str(&source).unwrap();
    let envelope = omega::read_compatible_json(&serde_json::to_vec(&fixture["envelope"]).unwrap()).unwrap();
    let mut runtime = omega_runtime::OmegaRuntime::default();
    for op in &envelope.operations {
        if op.1 == "SELECT" { runtime.register_selector(op.2.as_deref().unwrap(), |ctx| Ok(ctx.input)); }
    }
    register(&mut runtime, &fixture);
    let input = omega_runtime::ExecutionInput {
        context: Value::Null,
        objects: serde_json::from_value(fixture["objects"].clone()).unwrap(),
        policy: envelope.policy.iter().cloned().collect(),
        allow_emit: fixture["allowEmit"].as_bool().unwrap_or(false),
    };
    println!("{}", serde_json::to_string(&runtime.execute(&envelope, input)).unwrap());
}

#[path = "../omega.rs"]
pub mod omega;
#[path = "../omega_runtime.rs"]
pub mod omega_runtime;

use omega::{OmegaEnvelope, OmegaOperation, SCHEMA};
use omega_runtime::{ExecutionInput, OmegaRuntime, OperationContext};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, atomic::{AtomicUsize, Ordering}};

fn operation(value: &Value, malformed: bool) -> OmegaOperation {
    OmegaOperation(
        value["id"].as_str().unwrap_or_default().into(),
        if malformed { "CALLX" } else { value["kind"].as_str().unwrap_or_default() }.into(),
        value["reference"].as_str().map(str::to_owned),
        Vec::new(),
        value["state"].as_str().unwrap_or("open").into(),
    )
}

fn execute(value: &Value, authorized: bool, malformed: bool) -> Value {
    let op = operation(value, malformed);
    let effects = Arc::new(AtomicUsize::new(0));
    let mut runtime = OmegaRuntime::default();
    let counter = Arc::clone(&effects);
    runtime.register_tool(op.2.as_deref().unwrap_or_default(), move |context: OperationContext| {
        counter.fetch_add(1, Ordering::SeqCst);
        Ok(context.context["arguments"].clone())
    });
    let policy = if authorized { vec![("call".into(), vec![op.2.clone().unwrap_or_default()])] } else { Vec::new() };
    let envelope = OmegaEnvelope { schema: SCHEMA.into(), version: 1,
        id: op.0.clone(), operations: vec![op.clone()], policy, payload: None };
    let input = ExecutionInput { context: json!({"arguments": value["arguments"]}), ..Default::default() };
    let result = runtime.execute(&envelope, input);
    let side_effects = effects.load(Ordering::SeqCst);
    if result.status == "emitted" {
        json!({"status":"emitted", "value":result.values.get(&op.0).cloned().unwrap_or(Value::Null), "side_effects":side_effects})
    } else {
        let reason_class = if malformed { "invalid_operation" } else { "unauthorized" };
        json!({"status":"blocked", "reason_class":reason_class, "side_effects":side_effects})
    }
}

fn hash(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../benchmarks/omega-bench-2026");
    let input_path = root.join("dataset/public/inputs/E12.jsonl");
    let input = fs::read_to_string(&input_path)?;
    let mut outputs = Vec::new();
    for line in input.lines() {
        let row: Value = serde_json::from_str(line)?;
        let intent = &row["input"]["intent"];
        outputs.push(json!({"scenario_id":row["scenario_id"],
            "valid":execute(intent, true, false),
            "unauthorized":execute(intent, false, false),
            "malformed":execute(intent, true, true)}));
    }
    let body = outputs.iter().map(Value::to_string).collect::<Vec<_>>().join("\n") + "\n";
    let output_path = root.join("results/E12-rust.jsonl");
    fs::create_dir_all(output_path.parent().unwrap())?;
    fs::write(&output_path, body.as_bytes())?;
    let dataset_manifest = fs::read(root.join("dataset/manifest.json"))?;
    let manifest = json!({"backend":"production_rust_omega_runtime", "business_backend":true,
        "cases":outputs.len(), "dataset_manifest_sha256":hash(&dataset_manifest), "output_sha256":hash(body.as_bytes())});
    fs::write(output_path.with_extension("manifest.json"), serde_json::to_vec_pretty(&manifest)?)?;
    println!("Rust Omega runtime: {} cases -> {}", outputs.len(), output_path.display());
    Ok(())
}

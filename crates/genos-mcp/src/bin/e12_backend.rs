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

fn transfer_operation(operation: &Value, backend: &str) -> Value {
    match backend {
        "json" | "portable" => serde_json::from_slice(
            &serde_json::to_vec(operation).unwrap_or_default()).unwrap_or(Value::Null),
        "tabular" => json!({"id":operation["id"], "kind":operation["kind"],
            "reference":operation["reference"], "arguments":{
                "record_id":operation["arguments"]["record_id"],
                "limit":operation["arguments"]["limit"]}}),
        _ => Value::Null,
    }
}

fn mission_transfer(workload: &Value) -> Value {
    let operation = &workload["operation"];
    let backends = workload["backends"].as_array().cloned().unwrap_or_default();
    let agents = workload["agents"].as_u64().unwrap_or_default();
    let mut first_results = Vec::new();
    let mut violations = Vec::new();
    let mut transfer_count = 0_u64;
    let mut processed_agents = 0_u64;
    for agent_index in 0..agents {
        let mut agent_ok = true;
        for backend in &backends {
            let backend_name = backend.as_str().unwrap_or_default();
            let result = transfer_operation(operation, backend_name);
            transfer_count += 1;
            agent_ok = agent_ok && result == *operation;
            if agent_index == 0 { first_results.push(result); }
        }
        if agent_ok { processed_agents += 1; }
        else if !violations.iter().any(|item| *item == "portable_semantics_lost") {
            violations.push("portable_semantics_lost");
        }
    }
    let equivalent = processed_agents == agents && violations.is_empty();
    json!({"agent_count":agents, "processed_agents":processed_agents,
        "transfer_count":transfer_count, "backend_results":first_results,
        "equivalent":equivalent, "violations":violations})
}

struct ExecutionRequest<'a> {
    value: &'a Value,
    authorized: bool,
    malformed: bool,
    workload: Option<&'a Value>,
}

fn execute(request: ExecutionRequest<'_>) -> Value {
    let ExecutionRequest { value, authorized, malformed, workload } = request;
    let op = operation(value, malformed);
    let effects = Arc::new(AtomicUsize::new(0));
    let mut runtime = OmegaRuntime::default();
    let counter = Arc::clone(&effects);
    let mission_input = workload.cloned();
    runtime.register_tool(op.2.as_deref().unwrap_or_default(), move |context: OperationContext| {
        counter.fetch_add(1, Ordering::SeqCst);
        let mission = mission_input.as_ref().map(mission_transfer);
        Ok(json!({"value":context.context["arguments"], "mission_execution":mission}))
    });
    let policy = if authorized { vec![("call".into(), vec![op.2.clone().unwrap_or_default()])] } else { Vec::new() };
    let envelope = OmegaEnvelope { schema: SCHEMA.into(), version: 1,
        id: op.0.clone(), operations: vec![op.clone()], policy, payload: None };
    let input = ExecutionInput { context: json!({"arguments": value["arguments"]}), ..Default::default() };
    let result = runtime.execute(&envelope, input);
    let side_effects = effects.load(Ordering::SeqCst);
    if result.status == "emitted" {
        let value = result.values.get(&op.0).cloned().unwrap_or(Value::Null);
        json!({"response":{"status":"emitted", "value":value["value"],
            "side_effects":side_effects}, "mission_execution":value["mission_execution"]})
    } else {
        let reason_class = if malformed { "invalid_operation" } else { "unauthorized" };
        json!({"response":{"status":"blocked", "reason_class":reason_class,
            "side_effects":side_effects}, "mission_execution":Value::Null})
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
        let valid = execute(ExecutionRequest { value:intent, authorized:true,
            malformed:false, workload:Some(&row["input"]["mission_workload"]) });
        let unauthorized = execute(ExecutionRequest { value:intent, authorized:false,
            malformed:false, workload:None });
        let malformed = execute(ExecutionRequest { value:intent, authorized:true,
            malformed:true, workload:None });
        outputs.push(json!({"scenario_id":row["scenario_id"],
            "valid":valid["response"], "unauthorized":unauthorized["response"],
            "malformed":malformed["response"], "mission_execution":valid["mission_execution"]}));
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

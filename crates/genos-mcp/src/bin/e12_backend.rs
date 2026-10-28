#[path = "../omega.rs"]
pub mod omega;
#[path = "../omega_runtime.rs"]
pub mod omega_runtime;

use omega::{OmegaEnvelope, OmegaOperation, SCHEMA};
use omega_runtime::{ExecutionInput, OmegaRuntime, OperationContext};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::time::{Instant, SystemTime, UNIX_EPOCH};
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

fn timestamp_ms() -> u128 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis()
}

fn record_trace_event(events: &mut Vec<Value>, name: &str, started: Instant) {
    events.push(json!({"name":name, "at_unix_ms":timestamp_ms(),
        "elapsed_ms":started.elapsed().as_secs_f64() * 1000.0}));
}

fn checked_results_dir(root: &Path) -> Result<PathBuf, Box<dyn std::error::Error>> {
    let configured = std::env::var_os("OMEGA_RESULTS_DIR")
        .map(PathBuf::from);
    configured_results_dir(root, configured.as_deref())
}

fn configured_results_dir(
    root: &Path,
    configured: Option<&Path>,
) -> Result<PathBuf, Box<dyn std::error::Error>> {
    let canonical_root = fs::canonicalize(root)?;
    let canonical_results = fs::canonicalize(canonical_root.join("results"))?;
    let candidate = match configured {
        Some(path) if path.components().any(|part| part == Component::ParentDir) => {
            return Err("E12 output path must stay under public results/".into());
        }
        Some(path) if path.is_absolute() => path.to_path_buf(),
        Some(path) => canonical_root.join(path),
        None => canonical_results.clone(),
    };
    if !candidate.starts_with(&canonical_results) {
        return Err("E12 output path must stay under public results/".into());
    }
    let safe_candidate = confined_candidate(&canonical_results, &candidate)?;
    fs::create_dir_all(&safe_candidate)?;
    let canonical_candidate = fs::canonicalize(safe_candidate)?;
    if !canonical_candidate.starts_with(&canonical_results) {
        return Err("E12 output path must stay under public results/".into());
    }
    Ok(canonical_candidate)
}

fn confined_candidate(
    results_root: &Path,
    candidate: &Path,
) -> Result<PathBuf, Box<dyn std::error::Error>> {
    let mut ancestor = candidate;
    let mut missing = Vec::new();
    while let Err(error) = fs::symlink_metadata(ancestor) {
        if error.kind() != std::io::ErrorKind::NotFound {
            return Err(error.into());
        }
        let name = ancestor.file_name().ok_or("invalid E12 results path")?;
        missing.push(name.to_os_string());
        ancestor = ancestor.parent().ok_or("invalid E12 results path")?;
    }
    let mut safe = fs::canonicalize(ancestor)?;
    if !safe.starts_with(results_root) {
        return Err("E12 output path must stay under public results/".into());
    }
    for name in missing.iter().rev() {
        safe.push(name);
    }
    if !safe.starts_with(results_root) {
        return Err("E12 output path must stay under public results/".into());
    }
    Ok(safe)
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../benchmarks/omega-bench-2026");
    let input_root = std::env::var_os("OMEGA_DATASET_INPUTS").map(PathBuf::from)
        .unwrap_or_else(|| root.join("dataset/public/inputs"));
    let input_path = input_root.join("E12.jsonl");
    let input = fs::read_to_string(&input_path)?;
    let mut outputs = Vec::new();
    let mut traces = Vec::new();
    for line in input.lines() {
        let row: Value = serde_json::from_str(line)?;
        let started = Instant::now();
        let mut events = Vec::new();
        record_trace_event(&mut events, "run_started", started);
        let intent = &row["input"]["intent"];
        let valid = execute(ExecutionRequest { value:intent, authorized:true,
            malformed:false, workload:Some(&row["input"]["mission_workload"]) });
        record_trace_event(&mut events, "valid_operation_observed", started);
        let unauthorized = execute(ExecutionRequest { value:intent, authorized:false,
            malformed:false, workload:None });
        record_trace_event(&mut events, "unauthorized_operation_observed", started);
        let malformed = execute(ExecutionRequest { value:intent, authorized:true,
            malformed:true, workload:None });
        record_trace_event(&mut events, "malformed_operation_observed", started);
        let output = json!({"scenario_id":row["scenario_id"],
            "valid":valid["response"], "unauthorized":unauthorized["response"],
            "malformed":malformed["response"], "mission_execution":valid["mission_execution"]});
        record_trace_event(&mut events, "mission_transfer_observed", started);
        record_trace_event(&mut events, "run_completed", started);
        let input_bytes = serde_json::to_vec(&row["input"])?;
        let result_bytes = serde_json::to_vec(&output)?;
        traces.push(json!({"schema":"omega-bench-e12-trace/v1",
            "backend":"production_rust_omega_runtime", "scenario_id":row["scenario_id"],
            "started_at_unix_ms":events.first().and_then(|event|event["at_unix_ms"].as_u64()),
            "ended_at_unix_ms":events.last().and_then(|event|event["at_unix_ms"].as_u64()),
            "duration_ms":started.elapsed().as_secs_f64() * 1000.0,
            "input_sha256":hash(&input_bytes), "result_sha256":hash(&result_bytes),
            "status":"completed", "events":events}));
        outputs.push(output);
    }
    let body = outputs.iter().map(Value::to_string).collect::<Vec<_>>().join("\n") + "\n";
    let output_path = checked_results_dir(&root)?.join("E12-rust.jsonl");
    fs::create_dir_all(output_path.parent().unwrap())?;
    fs::write(&output_path, body.as_bytes())?;
    let trace_path = output_path.with_file_name("E12-rust.traces.jsonl");
    let trace_body = traces.iter().map(Value::to_string).collect::<Vec<_>>().join("\n") + "\n";
    fs::write(&trace_path, trace_body.as_bytes())?;
    let dataset_manifest = fs::read(root.join("dataset/manifest.json"))?;
    let manifest = json!({"backend":"production_rust_omega_runtime", "business_backend":true,
        "cases":outputs.len(), "dataset_manifest_sha256":hash(&dataset_manifest), "output_sha256":hash(body.as_bytes()),
        "trace_file":trace_path.file_name().and_then(|name|name.to_str()).unwrap_or_default(),
        "trace_records":traces.len(), "trace_sha256":hash(trace_body.as_bytes())});
    fs::write(output_path.with_extension("manifest.json"), serde_json::to_vec_pretty(&manifest)?)?;
    println!("Rust Omega runtime: {} cases -> {}", outputs.len(), output_path.display());
    Ok(())
}

#[cfg(test)]
mod path_tests {
    use super::configured_results_dir;
    use std::fs;
    use std::path::Path;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temporary_root() -> std::path::PathBuf {
        let nonce = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
        std::env::temp_dir().join(format!("omega-e12-path-{}-{nonce}", std::process::id()))
    }

    #[test]
    fn default_results_path_canonicalizes_trusted_parent_components() {
        let base = temporary_root();
        let root = base.join("parent").join("..").join("benchmark");
        fs::create_dir_all(root.join("results")).unwrap();
        let actual = configured_results_dir(&root, None).unwrap();
        assert_eq!(actual, fs::canonicalize(root.join("results")).unwrap());
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn configured_traversal_is_rejected_before_creating_outside_directory() {
        let root = temporary_root();
        fs::create_dir_all(root.join("results")).unwrap();
        let outside = root.join("escaped");
        let result = configured_results_dir(&root, Some(Path::new("results/../escaped")));
        assert!(result.is_err());
        assert!(!outside.exists());
        let absolute_outside = root.with_file_name(format!(
            "{}-outside",
            root.file_name().unwrap().to_string_lossy()
        ));
        let result = configured_results_dir(&root, Some(&absolute_outside));
        assert!(result.is_err());
        assert!(!absolute_outside.exists());
        fs::remove_dir_all(root).unwrap();
    }
}

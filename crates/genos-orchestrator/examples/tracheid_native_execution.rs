//! Compile and execute a validated Trachéide plan as a bounded native Rust process.
//!
//! This opt-in conformance probe measures software execution only; it is not a
//! production executor, a speed claim, or evidence of biological behavior.

#[path = "tracheid_native_execution/native.rs"]
mod native;
#[path = "tracheid_native_execution/native_source.rs"]
mod native_source;

use genos_orchestrator::genos_biology::{Tracheid, TracheidExecutionPlan, TracheidPlanInput};
use std::fs;
use std::path::{Path, PathBuf};

fn main() -> Result<(), String> {
    let input = parse_cli_input()?;
    let mut target = Tracheid::new("native-conformance");
    target.trigger_lignified_apoptosis("pipeline:native-conformance")?;
    let plan = TracheidExecutionPlan::new(
        "pipeline:native-conformance",
        target.plate.cavitation_resistance_mpa,
    )?;
    let inputs = [input];
    let scratch_root = target_scratch_root()?;
    let report = native::compile_and_run(native::NativeRequest {
        plan: &plan,
        target: &target,
        inputs: &inputs,
        scratch_root: &scratch_root,
    })?;
    let output = serde_json::json!({
        "schema": "genos.tracheid-native-conformance/v1",
        "executor": "host-native-rustc",
        "planExecution": "compiled_native_operations",
        "referenceExecution": "interpreted_typed_plan",
        "batchSize": report.results.len(),
        "outputsEquivalent": true,
        "rustcCompileProcessElapsedMicros": report.compile_micros,
        "nativeProcessElapsedMicros": report.process_micros,
        "nativeProcessTimingIncludes": "process startup, child input/output, and execution",
        "scratchRoot": report.scratch_root,
        "scratchPath": report.scratch_path,
        "scratchCleaned": !report.scratch_path.exists(),
        "result": report.results.first(),
        "claimScope": "software execution only; no biological truth or speedup claimed"
    });
    println!("{}", serde_json::to_string_pretty(&output).map_err(|error| error.to_string())?);
    Ok(())
}

fn parse_cli_input() -> Result<TracheidPlanInput, String> {
    let values: Vec<String> = std::env::args().skip(1).collect();
    if values.len() != 2 {
        return Err("usage: tracheid_native_execution <volume> <tension_mpa>".into());
    }
    let volume = parse_finite(&values[0], "volume")?;
    let tension_mpa = parse_finite(&values[1], "tension_mpa")?;
    if volume < 0.0 {
        return Err("volume must be nonnegative".into());
    }
    Ok(TracheidPlanInput { volume, tension_mpa })
}

fn parse_finite(value: &str, label: &str) -> Result<f64, String> {
    let parsed = value
        .parse::<f64>()
        .map_err(|error| format!("invalid {label}: {error}"))?;
    if !parsed.is_finite() {
        return Err(format!("{label} must be finite"));
    }
    Ok(parsed)
}

fn target_scratch_root() -> Result<PathBuf, String> {
    let executable = std::env::current_exe()
        .and_then(fs::canonicalize)
        .map_err(|error| error.to_string())?;
    let profile = executable
        .parent()
        .and_then(Path::parent)
        .ok_or("cannot locate Cargo target profile directory")?;
    let root = profile.join("tracheid-native-scratch");
    fs::create_dir_all(&root).map_err(|error| error.to_string())?;
    fs::canonicalize(root).map_err(|error| error.to_string())
}

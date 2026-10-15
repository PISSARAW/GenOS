//! Compile and execute a validated Trachéide plan as a bounded native Rust process.
//!
//! This is an opt-in conformance probe, not a production executor or biological model.

use super::native_source::NATIVE_EXECUTOR;
use genos_orchestrator::genos_biology::{
    SapTransportYield, Tracheid, TracheidExecutionPlan, TracheidPlanInput,
    TracheidPlanOperation, execute_tracheid_plan,
};
use std::fs::{self, File};
use std::path::{Path, PathBuf};
use std::process::{Command, ExitStatus, Stdio};
use std::thread;
use std::time::{Duration, Instant};

const MAX_BATCH: usize = 512;
const MAX_INPUT_BYTES: u64 = 65_536;
const MAX_OUTPUT_BYTES: u64 = 65_536;
const COMPILER_TIMEOUT: Duration = Duration::from_secs(30);
const EXECUTOR_TIMEOUT: Duration = Duration::from_secs(5);


pub(super) struct NativeRequest<'a> {
    pub(super) plan: &'a TracheidExecutionPlan,
    pub(super) target: &'a Tracheid,
    pub(super) inputs: &'a [TracheidPlanInput],
    pub(super) scratch_root: &'a Path,
}

pub(super) struct NativeRunReport {
    pub(super) results: Vec<SapTransportYield>,
    pub(super) compile_micros: u128,
    pub(super) process_micros: u128,
    pub(super) scratch_root: PathBuf,
    pub(super) scratch_path: PathBuf,
}

struct ProcessSettings<'a> {
    scratch: &'a Path,
    label: &'a str,
    timeout: Duration,
}

struct ProcessOutput {
    status: ExitStatus,
    stdout_path: PathBuf,
    stderr_path: PathBuf,
}

struct ScratchWork {
    _owner: tempfile::TempDir,
    root: PathBuf,
    path: PathBuf,
}

pub(super) fn compile_and_run(request: NativeRequest<'_>) -> Result<NativeRunReport, String> {
    validate_batch(&request)?;
    let scratch = prepare_scratch(request.scratch_root)?;
    let report = run_in_scratch(&request, &scratch)?;
    drop(scratch);
    Ok(report)
}

fn prepare_scratch(root: &Path) -> Result<ScratchWork, String> {
    let canonical_root = fs::canonicalize(root).map_err(|error| error.to_string())?;
    let owner = tempfile::Builder::new()
        .prefix("tracheid-native-")
        .tempdir_in(&canonical_root)
        .map_err(|error| error.to_string())?;
    let path = fs::canonicalize(owner.path()).map_err(|error| error.to_string())?;
    if !path.starts_with(&canonical_root) {
        return Err("native scratch directory escaped its configured root".into());
    }
    Ok(ScratchWork {
        _owner: owner,
        root: canonical_root,
        path,
    })
}

fn run_in_scratch(
    request: &NativeRequest<'_>,
    scratch: &ScratchWork,
) -> Result<NativeRunReport, String> {
    let source_path = scratch.path.join("executor.rs");
    let executable_path =
        scratch.path.join(format!("executor{}", std::env::consts::EXE_SUFFIX));
    let input_path = scratch.path.join("input.txt");
    let source = generate_source(request.plan)?;
    fs::write(&source_path, source).map_err(|error| error.to_string())?;
    write_inputs(&input_path, request.inputs)?;
    let compile_micros = compile_native(&source_path, &executable_path, &scratch.path)?;
    let (results, process_micros) = run_native(NativeRunRequest {
        executable: &executable_path,
        input_path: &input_path,
        plan: request.plan,
        target: request.target,
        inputs: request.inputs,
        scratch: &scratch.path,
    })?;
    Ok(NativeRunReport {
        results,
        compile_micros,
        process_micros,
        scratch_root: scratch.root.clone(),
        scratch_path: scratch.path.clone(),
    })
}

fn validate_batch(request: &NativeRequest<'_>) -> Result<(), String> {
    if request.inputs.is_empty() || request.inputs.len() > MAX_BATCH {
        return Err(format!("native input batch must contain 1..={MAX_BATCH} rows"));
    }
    request.plan.validate()?;
    for input in request.inputs {
        execute_tracheid_plan(request.plan, request.target, *input)?;
    }
    if request.plan.operations.as_slice()
        != [
            TracheidPlanOperation::CheckCavitation,
            TracheidPlanOperation::PassThroughOrBlock,
        ]
    {
        return Err("native code generator does not support this operation sequence".into());
    }
    Ok(())
}

fn generate_source(plan: &TracheidExecutionPlan) -> Result<String, String> {
    plan.validate()?;
    let expected = [
        TracheidPlanOperation::CheckCavitation,
        TracheidPlanOperation::PassThroughOrBlock,
    ];
    if plan.operations.as_slice() != expected.as_slice() {
        return Err("native code generator refuses an unsupported operation sequence".into());
    }
    let threshold_bits = plan.cavitation_resistance_mpa.to_bits();
    Ok(NATIVE_EXECUTOR.replace("__THRESHOLD_BITS__", &threshold_bits.to_string()))
}

fn write_inputs(path: &Path, inputs: &[TracheidPlanInput]) -> Result<(), String> {
    let mut content = String::new();
    for input in inputs {
        content.push_str(&format!("{} {}\n", input.volume.to_bits(), input.tension_mpa.to_bits()));
    }
    if content.len() as u64 > MAX_INPUT_BYTES {
        return Err("native input exceeds byte limit".into());
    }
    fs::write(path, content).map_err(|error| error.to_string())
}

fn compile_native(source: &Path, executable: &Path, scratch: &Path) -> Result<u128, String> {
    let compiler = std::env::var_os("RUSTC").unwrap_or_else(|| "rustc".into());
    let mut command = Command::new(compiler);
    command
        .args(["--edition=2024", "-C", "opt-level=2"])
        .arg(source)
        .arg("-o")
        .arg(executable)
        .env("TMPDIR", scratch)
        .env("TEMP", scratch)
        .env("TMP", scratch)
        .current_dir(scratch);
    let started = Instant::now();
    let output = run_bounded(
        &mut command,
        ProcessSettings { scratch, label: "compile", timeout: COMPILER_TIMEOUT },
    )?;
    if !output.status.success() {
        return Err(format!("rustc failed: {}", read_diagnostic(&output.stderr_path)?));
    }
    Ok(started.elapsed().as_micros())
}

struct NativeRunRequest<'a> {
    executable: &'a Path,
    input_path: &'a Path,
    plan: &'a TracheidExecutionPlan,
    target: &'a Tracheid,
    inputs: &'a [TracheidPlanInput],
    scratch: &'a Path,
}

fn run_native(request: NativeRunRequest<'_>) -> Result<(Vec<SapTransportYield>, u128), String> {
    let mut command = Command::new(request.executable);
    command.arg(request.input_path).current_dir(request.scratch);
    let started = Instant::now();
    let output = run_bounded(
        &mut command,
        ProcessSettings {
            scratch: request.scratch,
            label: "execute",
            timeout: EXECUTOR_TIMEOUT,
        },
    )?;
    let elapsed = started.elapsed().as_micros();
    if !output.status.success() {
        return Err(format!("native executor failed: {}", read_diagnostic(&output.stderr_path)?));
    }
    let native_output = read_limited(&output.stdout_path, MAX_OUTPUT_BYTES)?;
    let native_output = String::from_utf8(native_output)
        .map_err(|error| format!("native executor output is not UTF-8: {error}"))?;
    let native_results =
        parse_native_results(&native_output, request.plan, request.inputs.len())?;
    let interpreted = request.inputs
        .iter()
        .map(|input| execute_tracheid_plan(request.plan, request.target, *input))
        .collect::<Result<Vec<_>, _>>()?;
    assert_equivalent(&native_results, &interpreted)?;
    Ok((native_results, elapsed))
}

fn parse_native_results(
    output: &str,
    plan: &TracheidExecutionPlan,
    expected_rows: usize,
) -> Result<Vec<SapTransportYield>, String> {
    let rows: Vec<&str> = output.lines().collect();
    if rows.len() != expected_rows {
        return Err("native executor returned an unexpected row count".into());
    }
    rows.into_iter().map(|row| parse_native_row(row, plan)).collect()
}

fn parse_native_row(row: &str, plan: &TracheidExecutionPlan) -> Result<SapTransportYield, String> {
    let fields: Vec<&str> = row.split_whitespace().collect();
    if fields.len() != 4 {
        return Err("native executor returned a malformed row".into());
    }
    let transported_bits = fields[0].parse::<u64>().map_err(|error| error.to_string())?;
    let tension_bits = fields[1].parse::<u64>().map_err(|error| error.to_string())?;
    let cavitation_flag = fields[2].parse::<u8>().map_err(|error| error.to_string())?;
    let token_bits = fields[3].parse::<u64>().map_err(|error| error.to_string())?;
    if cavitation_flag > 1 {
        return Err("native executor returned an invalid cavitation flag".into());
    }
    let cavitation_detected = cavitation_flag == 1;
    Ok(SapTransportYield {
        transported_volume: f64::from_bits(transported_bits),
        tension_applied_mpa: f64::from_bits(tension_bits),
        cavitation_detected,
        token_cost: f64::from_bits(token_bits),
        conduit_state: if cavitation_detected {
            "EMBOLISM_CAVITATION_BLOCK".into()
        } else {
            format!("OSSIFIED_STATIC_PASS_THROUGH_{}", plan.pipeline_id)
        },
    })
}

fn assert_equivalent(
    native: &[SapTransportYield],
    interpreted: &[SapTransportYield],
) -> Result<(), String> {
    if native.len() != interpreted.len() {
        return Err("native and interpreted result counts differ".into());
    }
    for (native_result, interpreted_result) in native.iter().zip(interpreted) {
        if native_result.transported_volume != interpreted_result.transported_volume
            || native_result.tension_applied_mpa != interpreted_result.tension_applied_mpa
            || native_result.cavitation_detected != interpreted_result.cavitation_detected
            || native_result.token_cost != interpreted_result.token_cost
            || native_result.conduit_state != interpreted_result.conduit_state
        {
            return Err("native and interpreted plan outputs differ".into());
        }
    }
    Ok(())
}

fn run_bounded(
    command: &mut Command,
    settings: ProcessSettings<'_>,
) -> Result<ProcessOutput, String> {
    let stdout_path = settings.scratch.join(format!("{}.stdout", settings.label));
    let stderr_path = settings.scratch.join(format!("{}.stderr", settings.label));
    let stdout = File::create(&stdout_path).map_err(|error| error.to_string())?;
    let stderr = File::create(&stderr_path).map_err(|error| error.to_string())?;
    let mut child = command
        .stdout(Stdio::from(stdout))
        .stderr(Stdio::from(stderr))
        .spawn()
        .map_err(|error| error.to_string())?;
    let started = Instant::now();
    loop {
        if started.elapsed() >= settings.timeout {
            child.kill().map_err(|error| error.to_string())?;
            let _ = child.wait();
            return Err(format!("{} process exceeded its time limit", settings.label));
        }
        if let Some(status) = child.try_wait().map_err(|error| error.to_string())? {
            return Ok(ProcessOutput { status, stdout_path, stderr_path });
        }
        thread::sleep(Duration::from_millis(10));
    }
}

fn read_diagnostic(path: &Path) -> Result<String, String> {
    read_limited(path, 16_384).map(|bytes| String::from_utf8_lossy(&bytes).into_owned())
}

fn read_limited(path: &Path, max_bytes: u64) -> Result<Vec<u8>, String> {
    let metadata = fs::metadata(path).map_err(|error| error.to_string())?;
    if metadata.len() > max_bytes {
        return Err("native subprocess output exceeds byte limit".into());
    }
    fs::read(path).map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    include!("native_tests.rs");
}

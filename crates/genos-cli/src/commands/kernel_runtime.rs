use genos_orchestrator::kernel_cycle::{ControlKernel, KernelMissionReport, StepInput};
use genos_orchestrator::kernel_runtime_verifier::{
    MissionVerification, VerificationTarget, verify_database,
};
use genos_orchestrator::kernel_state::Observations;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use std::process::Command;
use uuid::Uuid;
#[path = "kernel_runtime_inputs.rs"]
mod kernel_runtime_inputs;
use kernel_runtime_inputs::{
    DIAGNOSTIC_HYPOTHESES, MAX_TIMEOUT_MS, MISSION_TOKEN_BUDGET,
    VERIFICATION_TIMEOUT_MS, parse_native_objectives, parse_success_criteria, validate_executor,
    parse_completion_contract, validate_timeout_ms,
};

#[derive(Serialize)]
struct RuntimeLaunchReceipt {
    executable: String,
    exit_code: i32,
    stdout_sha256: String,
}

#[derive(Serialize)]
struct LiveKernelReport {
    schema: &'static str,
    mission_id: String,
    report: KernelMissionReport,
    runtime: RuntimeLaunchReceipt,
}

#[derive(Serialize, Deserialize)]
struct VerificationRequest {
    database: PathBuf,
    mission_id: String,
    objective: String,
    plan_hash: String,
}

struct LiveMissionBinding<'a> {
    mission_id: &'a str,
    objective: &'a str,
    plan_hash: String,
    plan_json: String,
    objective_hash: String,
    completion_contract: Option<serde_json::Value>,
    success_criteria: Option<serde_json::Value>,
    native_objectives: Option<serde_json::Value>,
    read_only_workspace_evidence: bool,
    timeout_ms: u64,
    executor: String,
}

struct RuntimePaths {
    root: PathBuf,
    database: PathBuf,
    workspace_root: PathBuf,
}

pub struct MissionOptions<'a> {
    pub workspace_root: Option<&'a Path>,
    pub completion_contract: Option<&'a str>,
    pub success_criteria: Option<&'a str>,
    pub native_objectives: Option<&'a str>,
    pub read_only_workspace_evidence: bool,
    pub timeout_ms: u64,
    pub executor: &'a str,
}

pub fn execute_mission(
    mission: &str,
    options: MissionOptions<'_>,
) -> Result<(), String> {
    validate_mission_text(mission)?;
    let paths = runtime_paths(options.workspace_root)?;
    let mission_id = format!("mission_kernel_{}", Uuid::new_v4());
    let (kernel, plan) = prepare_kernel(mission)?;
    let mut binding = mission_binding(&mission_id, mission, &plan)?;
    apply_mission_options(&mut binding, &options)?;
    let (runtime, verification) = execute_and_verify(&paths, &binding, &plan)?;
    let report = kernel.verified_report(&verification)?;
    println!(
        "{}",
        serde_json::to_string(&LiveKernelReport {
            schema: "genos.live-control-kernel-report/v1",
            mission_id,
            report,
            runtime,
        })
        .map_err(|error| error.to_string())?
    );
    Ok(())
}

fn runtime_paths(requested_workspace: Option<&Path>) -> Result<RuntimePaths, String> {
    let root = repository_root()?;
    let requested = requested_workspace.map(Path::to_path_buf).or_else(|| {
        std::env::var_os("GENOS_WORKSPACE_ROOT").map(PathBuf::from)
    });
    let workspace_root = resolve_workspace_root(&root, requested)?;
    Ok(RuntimePaths {
        database: database_path(&root),
        root,
        workspace_root,
    })
}

fn execute_and_verify(
    paths: &RuntimePaths,
    binding: &LiveMissionBinding<'_>,
    plan: &genos_orchestrator::kernel_morphogenesis::MorphogenesisPlan,
) -> Result<(RuntimeLaunchReceipt, MissionVerification), String> {
    let runtime = launch_node_runtime(paths, binding, plan)?;
    let verification = invoke_independent_verifier(paths, binding)?;
    Ok((runtime, verification))
}

fn validate_mission_text(mission: &str) -> Result<(), String> {
    if mission.trim().is_empty() {
        return Err(String::from("Mission text cannot be empty."));
    }
    Ok(())
}

fn apply_mission_options(
    binding: &mut LiveMissionBinding<'_>,
    options: &MissionOptions<'_>,
) -> Result<(), String> {
    binding.completion_contract = parse_completion_contract(options.completion_contract)?;
    binding.success_criteria = parse_success_criteria(options.success_criteria)?;
    binding.native_objectives = parse_native_objectives(options.native_objectives)?;
    validate_timeout_ms(options.timeout_ms)?;
    binding.read_only_workspace_evidence = options.read_only_workspace_evidence;
    binding.timeout_ms = options.timeout_ms;
    validate_executor(options.executor)?;
    binding.executor = options.executor.to_owned();
    Ok(())
}

pub fn execute_verifier(payload: &str) -> Result<(), String> {
    let request: VerificationRequest = serde_json::from_str(payload)
        .map_err(|error| format!("invalid kernel verification request: {error}"))?;
    let target = VerificationTarget {
        mission_id: &request.mission_id,
        expected_objective: &request.objective,
        expected_plan_hash: &request.plan_hash,
    };
    let verification = verify_database(&request.database, &target)?;
    println!(
        "{}",
        serde_json::to_string(&verification).map_err(|error| error.to_string())?
    );
    Ok(())
}

fn prepare_kernel(
    mission: &str,
) -> Result<
    (
        ControlKernel,
        genos_orchestrator::kernel_morphogenesis::MorphogenesisPlan,
    ),
    String,
> {
    let mut kernel = ControlKernel::new(mission);
    kernel.state.cognition.diversity_score = 0.8;
    kernel.state.resources.tokens_budget = MISSION_TOKEN_BUDGET;
    kernel
        .state
        .epistemics
        .evidence_gaps
        .push(String::from("mission_runtime_unverified"));
    let outcome = kernel.step(
        &Observations::default(),
        &StepInput {
            no_progress: false,
            worker_error_rate: 0.0,
        },
    );
    if !outcome.governance.allowed || !outcome.plan_applied {
        return Err(String::from(
            "Rust control kernel refused the initial mission plan",
        ));
    }
    Ok((kernel, outcome.plan))
}

fn launch_node_runtime(
    paths: &RuntimePaths,
    binding: &LiveMissionBinding<'_>,
    plan: &genos_orchestrator::kernel_morphogenesis::MorphogenesisPlan,
) -> Result<RuntimeLaunchReceipt, String> {
    let payload = orchestrator_payload(paths, binding, plan);
    let output = Command::new("node")
        .current_dir(&paths.root)
        .env("GENOS_DB_PATH", &paths.database)
        .env("GENOS_WORKSPACE_ROOT", &paths.workspace_root)
        .arg("backend/bin/genos-orchestrate.cjs")
        .arg(payload.to_string())
        .output()
        .map_err(|error| format!("cannot start the Node mission runtime: {error}"))?;
    if !output.status.success() {
        return Err(format!(
            "Node mission failed with {}: {}",
            output.status,
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }
    Ok(RuntimeLaunchReceipt {
        executable: String::from("backend/bin/genos-orchestrate.cjs"),
        exit_code: output.status.code().unwrap_or(0),
        stdout_sha256: format!("{:x}", Sha256::digest(&output.stdout)),
    })
}

fn orchestrator_payload(
    paths: &RuntimePaths,
    binding: &LiveMissionBinding<'_>,
    plan: &genos_orchestrator::kernel_morphogenesis::MorphogenesisPlan,
) -> serde_json::Value {
    let mut payload = serde_json::json!({
        "mission": binding.objective,
        "missionId": binding.mission_id,
        "timeoutMs": binding.timeout_ms,
        "executor": binding.executor,
        "executionBudget": {
            "tokens": MISSION_TOKEN_BUDGET,
            "costUsd": 5,
            "latencyMs": binding.timeout_ms,
            "verification": {
                "executions": 2,
                "latencyMs": VERIFICATION_TIMEOUT_MS
            }
        },
        "background": false,
        "autonomous_orchestration": true,
        "workspaceRoot": paths.workspace_root,
        "allowFileEdits": false,
        "readOnlyWorkspaceEvidence": binding.read_only_workspace_evidence,
        "diagnosticHypotheses": DIAGNOSTIC_HYPOTHESES.map(|statement| {
            serde_json::json!({ "statement": statement })
        }),
        "requiresEvidenceBeforePromotion": true,
        "rustKernelPlan": {
            "schema": "genos.rust-control-kernel-plan/v1",
            "missionId": binding.mission_id,
            "objectiveHash": binding.objective_hash,
            "planHash": binding.plan_hash,
            "planJson": binding.plan_json,
            "plan": plan
        }
    });
    if let Some(contract) = &binding.completion_contract {
        payload["completionContract"] = contract.clone();
    }
    if let Some(criteria) = &binding.success_criteria {
        payload["successCriteria"] = criteria.clone();
    }
    if let Some(objectives) = &binding.native_objectives {
        payload["native_objectives"] = objectives.clone();
    }
    payload
}

fn resolve_workspace_root(root: &Path, requested: Option<PathBuf>) -> Result<PathBuf, String> {
    let candidate = requested.unwrap_or_else(|| root.to_path_buf());
    let candidate = if candidate.is_absolute() {
        candidate
    } else {
        root.join(candidate)
    };
    let canonical_workspace = candidate
        .canonicalize()
        .map_err(|error| format!("cannot resolve workspace root: {error}"))?;
    if !canonical_workspace.is_dir() {
        return Err(String::from("workspace root must be an existing directory"));
    }
    let candidate_text = candidate
        .to_str()
        .ok_or_else(|| String::from("workspace path must be valid UTF-8"))?;
    let normalized = normalize_windows_verbatim_prefix(candidate_text);
    let workspace = PathBuf::from(normalized);
    if !workspace.is_absolute() {
        return Err(String::from("workspace root must be absolute"));
    }
    Ok(workspace)
}

fn normalize_windows_verbatim_prefix(value: &str) -> String {
    if let Some(unc_path) = value.strip_prefix(r"\\?\UNC\") {
        return format!(r"\\{unc_path}");
    }
    value.strip_prefix(r"\\?\").unwrap_or(value).to_owned()
}

fn invoke_independent_verifier(
    paths: &RuntimePaths,
    binding: &LiveMissionBinding<'_>,
) -> Result<MissionVerification, String> {
    let request = VerificationRequest {
        database: paths.database.clone(),
        mission_id: binding.mission_id.into(),
        objective: binding.objective.into(),
        plan_hash: binding.plan_hash.clone(),
    };
    let output = Command::new(std::env::current_exe().map_err(|error| error.to_string())?)
        .current_dir(&paths.root)
        .arg("kernel-verify")
        .arg(serde_json::to_string(&request).map_err(|error| error.to_string())?)
        .output()
        .map_err(|error| format!("cannot start independent Rust verifier: {error}"))?;
    if !output.status.success() {
        return Err(format!(
            "independent Rust verification failed: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }
    serde_json::from_slice(&output.stdout)
        .map_err(|error| format!("invalid independent verification output: {error}"))
}

fn mission_binding<'a>(
    mission_id: &'a str,
    objective: &'a str,
    plan: &genos_orchestrator::kernel_morphogenesis::MorphogenesisPlan,
) -> Result<LiveMissionBinding<'a>, String> {
    let plan_json = serde_json::to_string(plan).map_err(|error| error.to_string())?;
    Ok(LiveMissionBinding {
        mission_id,
        objective,
        plan_hash: format!("{:x}", Sha256::digest(plan_json.as_bytes())),
        plan_json,
        objective_hash: format!("{:x}", Sha256::digest(objective.as_bytes())),
        completion_contract: None,
        success_criteria: None,
        native_objectives: None,
        read_only_workspace_evidence: false,
        timeout_ms: MAX_TIMEOUT_MS,
        executor: String::from("codex"),
    })
}

fn database_path(root: &Path) -> PathBuf {
    std::env::var_os("GENOS_DB_PATH")
        .map(PathBuf::from)
        .unwrap_or_else(|| root.join("backend/genos.db"))
}

fn repository_root() -> Result<PathBuf, String> {
    let current = std::env::current_dir()
        .map_err(|error| format!("cannot resolve current directory: {error}"))?;
    current
        .ancestors()
        .find(|path| path.join("backend/bin/genos-orchestrate.cjs").is_file())
        .map(PathBuf::from)
        .ok_or_else(|| String::from("run genos inside a GenOS repository"))
}

#[cfg(test)]
#[path = "kernel_runtime_tests.rs"]
mod tests;

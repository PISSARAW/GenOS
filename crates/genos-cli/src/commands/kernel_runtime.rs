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
}

struct RuntimePaths {
    root: PathBuf,
    database: PathBuf,
}

pub fn execute_mission(mission: &str) -> Result<(), String> {
    if mission.trim().is_empty() {
        return Err(String::from("Mission text cannot be empty."));
    }
    let root = repository_root()?;
    let paths = RuntimePaths { database: database_path(&root), root };
    let mission_id = format!("mission_kernel_{}", Uuid::new_v4());
    let (kernel, plan) = prepare_kernel(mission)?;
    let binding = mission_binding(&mission_id, mission, &plan)?;
    let runtime = launch_node_runtime(&paths, &binding, &plan)?;
    let verification = invoke_independent_verifier(&paths, &binding)?;
    let report = kernel.verified_report(&verification)?;
    println!("{}", serde_json::to_string(&LiveKernelReport {
        schema: "genos.live-control-kernel-report/v1",
        mission_id,
        report,
        runtime,
    }).map_err(|error| error.to_string())?);
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
    println!("{}", serde_json::to_string(&verification).map_err(|error| error.to_string())?);
    Ok(())
}

fn prepare_kernel(
    mission: &str,
) -> Result<(ControlKernel, genos_orchestrator::kernel_morphogenesis::MorphogenesisPlan), String> {
    let mut kernel = ControlKernel::new(mission);
    kernel.state.cognition.diversity_score = 0.8;
    kernel.state.resources.tokens_budget = 100_000;
    kernel.state.epistemics.evidence_gaps.push(String::from("mission_runtime_unverified"));
    let outcome = kernel.step(&Observations::default(), &StepInput {
        no_progress: false,
        worker_error_rate: 0.0,
    });
    if !outcome.governance.allowed || !outcome.plan_applied {
        return Err(String::from("Rust control kernel refused the initial mission plan"));
    }
    Ok((kernel, outcome.plan))
}

fn launch_node_runtime(
    paths: &RuntimePaths,
    binding: &LiveMissionBinding<'_>,
    plan: &genos_orchestrator::kernel_morphogenesis::MorphogenesisPlan,
) -> Result<RuntimeLaunchReceipt, String> {
    let payload = serde_json::json!({
        "mission": binding.objective,
        "missionId": binding.mission_id,
        "background": false,
        "autonomous_orchestration": true,
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
    let output = Command::new("node")
        .current_dir(&paths.root)
        .env("GENOS_DB_PATH", &paths.database)
        .arg("backend/bin/genos-orchestrate.cjs")
        .arg(payload.to_string())
        .output()
        .map_err(|error| format!("cannot start the Node mission runtime: {error}"))?;
    if !output.status.success() {
        return Err(format!("Node mission failed with {}: {}", output.status,
            String::from_utf8_lossy(&output.stderr).trim()));
    }
    Ok(RuntimeLaunchReceipt {
        executable: String::from("backend/bin/genos-orchestrate.cjs"),
        exit_code: output.status.code().unwrap_or(0),
        stdout_sha256: format!("{:x}", Sha256::digest(&output.stdout)),
    })
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
        return Err(format!("independent Rust verification failed: {}",
            String::from_utf8_lossy(&output.stderr).trim()));
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
    })
}

fn database_path(root: &Path) -> PathBuf {
    std::env::var_os("GENOS_DB_PATH").map(PathBuf::from)
        .unwrap_or_else(|| root.join("backend/genos.db"))
}

fn repository_root() -> Result<PathBuf, String> {
    let current = std::env::current_dir()
        .map_err(|error| format!("cannot resolve current directory: {error}"))?;
    current.ancestors()
        .find(|path| path.join("backend/bin/genos-orchestrate.cjs").is_file())
        .map(PathBuf::from)
        .ok_or_else(|| String::from("run genos inside a GenOS repository"))
}

use crate::args::RunCmd;
use genos_orchestrator::mission_protocols::{RunSpec, engine, process, source};
use serde::Deserialize;
use std::path::{Component, PathBuf};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Objective {
    goal: String,
    success_criteria: Vec<String>,
    method_contract: Method,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Method {
    version: u8,
    method_id: String,
    parameters: Parameters,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Parameters {
    input_path: String,
    #[serde(default, deserialize_with = "optional_integer")]
    expected_sum: Option<i64>,
}

fn optional_integer<'de, D: serde::Deserializer<'de>>(value: D) -> Result<Option<i64>, D::Error> {
    i64::deserialize(value).map(Some)
}

pub fn execute(command: &RunCmd) -> Result<(), String> {
    if command.llm_config.is_some() { return super::rust_llm_mission::execute(command); }
    execute_integer(command)
}

fn execute_integer(command: &RunCmd) -> Result<(), String> {
    validate_flags(command)?;
    let mission = mission_name(command)?;
    let objective = objective(command)?;
    let workspace = workspace(command)?;
    let executable = std::env::current_exe().map_err(|e| e.to_string())?;
    let spec = specification(command, (&objective, mission), &workspace)?;
    let report = engine::run(engine::NativeRequest {
        spec, executable, database: source::journal_path(&workspace)?,
    })?;
    println!("{}", serde_json::to_string(&report).map_err(|e| e.to_string())?);
    Ok(())
}

fn mission_name(command: &RunCmd) -> Result<&str, String> {
    command.mission.as_deref().or(command.mission_option.as_deref())
        .filter(|value| !value.trim().is_empty()).ok_or_else(|| "RUST_NATIVE_MISSION_REQUIRED".into())
}

fn validate_flags(command: &RunCmd) -> Result<(), String> {
    if command.executor != "rust" || command.completion_contract.is_some() {
        return Err("RUST_NATIVE_UNSUPPORTED_EXECUTOR_OR_COMPLETION_CONTRACT".into());
    }
    if command.monitor || command.simulation || command.prompt.is_some() {
        return Err("RUST_NATIVE_TUI_FLAGS_UNSUPPORTED".into());
    }
    validate_mode(command)?;
    if let Some(raw) = &command.success_criteria {
        let criteria: Vec<String> = serde_json::from_str(raw).map_err(|e| e.to_string())?;
        validate_criteria(&criteria)?;
    }
    Ok(())
}

fn validate_mode(command: &RunCmd) -> Result<(), String> {
    if command.mode != "trinity" || command.host != "127.0.0.1" || command.port != 4590 {
        return Err("RUST_NATIVE_MONITOR_OPTIONS_UNSUPPORTED".into());
    }
    if command.read_only_workspace_evidence {
        return Err("RUST_NATIVE_WORKSPACE_EVIDENCE_FLAG_UNSUPPORTED".into());
    }
    Ok(())
}

fn objective(command: &RunCmd) -> Result<Objective, String> {
    let raw = command.native_objectives.as_deref().ok_or("RUST_NATIVE_OBJECTIVES_REQUIRED")?;
    let mut values: Vec<Objective> = serde_json::from_str(raw).map_err(|e| format!("RUST_NATIVE_OBJECTIVE_INVALID: {e}"))?;
    if values.len() != 1 { return Err("RUST_NATIVE_REQUIRES_EXACTLY_ONE_OBJECTIVE".into()); }
    let value = values.remove(0);
    validate_objective(&value)?;
    Ok(value)
}

fn validate_objective(value: &Objective) -> Result<(), String> {
    if value.goal.trim().is_empty() || value.method_contract.version != 1 {
        return Err("RUST_NATIVE_GOAL_OR_VERSION_INVALID".into());
    }
    if value.method_contract.method_id != "integer_sum" {
        return Err("RUST_NATIVE_METHOD_NOT_INSTALLED".into());
    }
    validate_criteria(&value.success_criteria)?;
    let path = std::path::Path::new(&value.method_contract.parameters.input_path);
    if path.as_os_str().is_empty() || path.components().any(|part| !matches!(part, Component::Normal(_))) {
        return Err("RUST_NATIVE_INPUT_PATH_MUST_BE_CONFINED_RELATIVE".into());
    }
    Ok(())
}

fn validate_criteria(criteria: &[String]) -> Result<(), String> {
    if criteria != ["integer_sum_verified"] {
        return Err("RUST_NATIVE_SUCCESS_CRITERIA_UNSUPPORTED".into());
    }
    Ok(())
}

fn workspace(command: &RunCmd) -> Result<PathBuf, String> {
    let supplied = command.workspace_root.as_ref().ok_or("RUST_NATIVE_EXPLICIT_WORKSPACE_REQUIRED")?;
    let canonical = supplied.canonicalize().map_err(|e| format!("RUST_NATIVE_WORKSPACE_INVALID: {e}"))?;
    if !canonical.is_dir() { return Err("RUST_NATIVE_WORKSPACE_MUST_BE_DIRECTORY".into()); }
    Ok(canonical)
}

fn specification(command: &RunCmd, input: (&Objective, &str), workspace: &std::path::Path) -> Result<RunSpec, String> {
    let (objective, mission) = input;
    let mission_id = command.mission_id.as_deref().map(uuid::Uuid::parse_str)
        .transpose().map_err(|_| "RUST_NATIVE_MISSION_ID_MUST_BE_UUID")?
        .unwrap_or_else(uuid::Uuid::new_v4).to_string();
    let executable = std::env::current_exe().map_err(|e| e.to_string())?;
    Ok(RunSpec {
        mission_id, workspace: workspace.into(),
        objective: serde_json::to_string(&serde_json::json!({"mission":mission,"goal":objective.goal,
            "successCriteria":objective.success_criteria,"methodId":"integer_sum"})).map_err(|e| e.to_string())?,
        input_path: objective.method_contract.parameters.input_path.clone(),
        expected_sum: objective.method_contract.parameters.expected_sum,
        timeout_ms: command.timeout_ms, env_hash: process::executable_hash(&executable)?,
    })
}

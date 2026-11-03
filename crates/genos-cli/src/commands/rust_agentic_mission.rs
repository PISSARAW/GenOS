use crate::args::RunCmd;
use genos_orchestrator::mission_protocols::{agentic_engine,agentic_source,llm_source,process,source};

pub fn execute(command:&RunCmd) -> Result<(),String> {
    validate(command)?;
    let report=agentic_engine::run(request(command)?)?;
    println!("{}",serde_json::to_string(&report).map_err(error)?);
    if !report.artifact_contract_verified { return Err("RUST_AGENTIC_MISSION_UNRESOLVED: observations retained without completion".into()); }
    Ok(())
}

fn request(command:&RunCmd) -> Result<agentic_engine::NativeAgenticRequest,String> {
    let workspace=workspace(command)?;
    let path=command.agentic_config.as_ref().and_then(|path|path.to_str()).ok_or("RUST_AGENTIC_CONFIG_REQUIRED")?;
    let bundle=agentic_source::read(&workspace,path)?;
    let executable=std::env::current_exe().map_err(error)?;
    let spec=bundle.specification(identity(command,(&workspace,&executable))?)?;
    Ok(agentic_engine::NativeAgenticRequest { spec,executable,database:source::journal_path(&workspace)? })
}

fn identity(command:&RunCmd, files:(&std::path::Path,&std::path::Path)) -> Result<llm_source::MissionIdentity,String> {
    let mission=command.mission.as_deref().or(command.mission_option.as_deref())
        .filter(|value|!value.trim().is_empty()).ok_or("RUST_AGENTIC_MISSION_REQUIRED")?;
    let id=command.mission_id.as_deref().map(uuid::Uuid::parse_str).transpose().map_err(|_|"RUST_AGENTIC_MISSION_ID_MUST_BE_UUID")?;
    Ok(llm_source::MissionIdentity { mission_id:id.unwrap_or_else(uuid::Uuid::new_v4).to_string(),
        workspace:files.0.into(),mission:mission.into(),timeout_ms:command.timeout_ms,env_hash:process::executable_hash(files.1)? })
}

fn workspace(command:&RunCmd) -> Result<std::path::PathBuf,String> {
    let path=command.workspace_root.as_ref().ok_or("RUST_AGENTIC_EXPLICIT_WORKSPACE_REQUIRED")?;
    let canonical=path.canonicalize().map_err(error)?;
    if !canonical.is_dir() { return Err("RUST_AGENTIC_WORKSPACE_MUST_BE_DIRECTORY".into()); }
    Ok(canonical)
}

fn validate(command:&RunCmd) -> Result<(),String> {
    if command.executor!="rust" || command.llm_config.is_some() || command.native_objectives.is_some() {
        return Err("RUST_AGENTIC_EXPLICIT_EXECUTOR_AND_CONFIG_REQUIRED".into());
    }
    if command.completion_contract.is_some() || command.success_criteria.is_some() || command.read_only_workspace_evidence {
        return Err("RUST_AGENTIC_CONTRACT_MUST_BE_DECLARED_IN_CONFIG".into());
    }
    validate_mode(command)
}

fn validate_mode(command:&RunCmd) -> Result<(),String> {
    if command.monitor || command.simulation || command.prompt.is_some() {
        return Err("RUST_AGENTIC_TUI_OPTIONS_UNSUPPORTED".into());
    }
    if command.mode!="trinity" || command.host!="127.0.0.1" || command.port!=4590 {
        return Err("RUST_AGENTIC_MONITOR_OPTIONS_UNSUPPORTED".into());
    }
    Ok(())
}

fn error(error:impl std::fmt::Display) -> String { error.to_string() }

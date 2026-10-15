use crate::args::ElectricQuorumCmd;
use genos_orchestrator::electric_quorum_runtime::{
    ElectricQuorumRequest, ElectricVoterAuthority,
};
use genos_orchestrator::genos_store::BiologicalReceiptStore;
use genos_orchestrator::GenosEcosystem;
use serde::Deserialize;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;

const MAX_CONFIG_BYTES: u64 = 1_048_576;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct TrustedKeyFile {
    schema: String,
    voters: Vec<TrustedVoter>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct TrustedVoter {
    cell_id: Uuid,
    public_key_hex: String,
}

/// Run one signed local software quorum using caller-managed public-key trust.
pub fn execute(cmd: ElectricQuorumCmd) -> Result<(), String> {
    if !cmd.experimental {
        return Err("electric-quorum has no authenticated operator authority; pass --experimental to opt in".into());
    }
    let workspace = std::env::var_os("GENOS_STUDIO_ROOT")
        .map(PathBuf::from)
        .map(Ok)
        .unwrap_or_else(std::env::current_dir)
        .map_err(|error| format!("cannot resolve workspace root: {error}"))?;
    execute_in_workspace(cmd, &workspace)
}

fn execute_in_workspace(cmd: ElectricQuorumCmd, workspace: &Path) -> Result<(), String> {
    let request: ElectricQuorumRequest = read_json_file(&cmd.request)?;
    let authority = load_authority(&cmd.trusted_keys)?;
    let (journal, lock) = mission_paths(workspace, cmd.mission_id)?;
    let _lock = genos_orchestrator::process_file_lock::ProcessFileLock::acquire(lock)?;
    let store = BiologicalReceiptStore::open(journal);
    let mut ecosystem = GenosEcosystem::new("electric-quorum-cli");
    ecosystem.set_mission_id(cmd.mission_id);
    ecosystem.restore_population(&store)?;
    if ecosystem.receipt_tick != cmd.tick {
        return Err(format!("requested tick {} does not match restored mission tick {}", cmd.tick, ecosystem.receipt_tick));
    }
    let receipt = ecosystem.discharge_electric_under_quorum_durable(request, &store, &authority)?;
    let output = serde_json::json!({
        "execution_mode": "experimental",
        "quorum_kind": "local_software_quorum",
        "trusted_keys_source": "caller_provided_configuration",
        "operator_authority": "unverified_cli_caller",
        "distributed_consensus": false,
        "receipt": receipt,
    });
    println!("{}", serde_json::to_string(&output).map_err(|error| error.to_string())?);
    Ok(())
}

fn load_authority(path: &Path) -> Result<ElectricVoterAuthority, String> {
    let config: TrustedKeyFile = read_json_file(path)?;
    if config.schema != "genos.electric-voter-trust/v1" {
        return Err("trusted-key configuration schema is unsupported".into());
    }
    let mut keys = HashMap::new();
    for voter in config.voters {
        if keys.insert(voter.cell_id, voter.public_key_hex).is_some() {
            return Err("trusted-key configuration contains a duplicate cell identity".into());
        }
    }
    ElectricVoterAuthority::from_trusted_public_keys(keys)
}

fn read_json_file<T: for<'de> Deserialize<'de>>(path: &Path) -> Result<T, String> {
    let metadata = fs::symlink_metadata(path)
        .map_err(|error| format!("cannot inspect JSON input: {error}"))?;
    if metadata.file_type().is_symlink() || !metadata.is_file() || metadata.len() > MAX_CONFIG_BYTES {
        return Err("JSON input must be a regular file no larger than 1 MiB".into());
    }
    let bytes = fs::read(path).map_err(|error| format!("cannot read JSON input: {error}"))?;
    serde_json::from_slice(&bytes).map_err(|error| format!("invalid JSON input: {error}"))
}

fn mission_paths(workspace: &Path, mission_id: Uuid) -> Result<(PathBuf, PathBuf), String> {
    let root = workspace.canonicalize()
        .map_err(|error| format!("cannot canonicalize workspace root: {error}"))?;
    let directory = ensure_journal_directory(&root)?;
    let journal = directory.join(format!("{mission_id}.jsonl"));
    validate_mission_file(&journal, &directory, "journal")?;
    let lock = directory.join(format!("{mission_id}.lock"));
    validate_mission_file(&lock, &directory, "lock")?;
    Ok((journal, lock))
}

fn ensure_journal_directory(root: &Path) -> Result<PathBuf, String> {
    let directory = root.join("biological-receipts");
    match fs::symlink_metadata(&directory) {
        Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_dir() => {
            return Err("receipt directory must be a real directory inside the workspace".into());
        }
        Ok(_) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            fs::create_dir(&directory).map_err(|create_error| create_error.to_string())?;
        }
        Err(error) => return Err(error.to_string()),
    }
    let directory = directory.canonicalize().map_err(|error| error.to_string())?;
    if !directory.starts_with(&root) {
        return Err("receipt directory resolves outside the workspace".into());
    }
    Ok(directory)
}

fn validate_mission_file(path: &Path, directory: &Path, label: &str) -> Result<(), String> {
    if let Ok(metadata) = fs::symlink_metadata(path) {
        if metadata.file_type().is_symlink() || !metadata.is_file()
            || !path.canonicalize().map_err(|error| error.to_string())?.starts_with(directory)
        {
            return Err(format!("mission {label} must be a regular file inside the workspace"));
        }
    }
    Ok(())
}

#[cfg(test)]
#[path = "electric_quorum_tests.rs"]
mod tests;

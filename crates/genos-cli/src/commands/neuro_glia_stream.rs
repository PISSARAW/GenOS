use crate::args::NeuroGliaStreamCmd;
use genos_orchestrator::genos_store::BiologicalReceiptStore;
use genos_orchestrator::mission_neuro_glia_receipt::NeuroGliaStreamEvent;
use genos_orchestrator::GenosEcosystem;
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;

const EVENT_TYPES: &[&str] = &[
    "BIOLOGICAL_EXECUTION_RECEIPT",
    "EMBODIED_ACTION",
    "INSTINCT_ACTION_EXECUTED",
    "INSTINCT_ACTION_REFUSED",
    "AUTONOMOUS_REPRODUCTION",
];
const MAX_PAYLOAD_BYTES: u64 = 1_048_576;

/// Append one local experimental event to a mission-scoped neuro-glia stream.
pub fn execute(cmd: NeuroGliaStreamCmd) -> Result<(), String> {
    if !cmd.experimental {
        return Err("neuro-glia-stream has no authenticated mission authority; pass --experimental to opt in".into());
    }
    validate_command(&cmd)?;
    let workspace = std::env::var_os("GENOS_STUDIO_ROOT")
        .map(PathBuf::from)
        .map(Ok)
        .unwrap_or_else(std::env::current_dir)
        .map_err(|error| format!("cannot resolve workspace root: {error}"))?;
    execute_in_workspace(cmd, &workspace)
}

fn validate_command(cmd: &NeuroGliaStreamCmd) -> Result<(), String> {
    if !EVENT_TYPES.contains(&cmd.event_type.as_str()) {
        return Err("event_type must be a supported mission neuro-glia event".into());
    }
    if cmd.idempotency_key.trim().is_empty() || cmd.idempotency_key.len() > 200 {
        return Err("idempotency_key must contain between 1 and 200 bytes".into());
    }
    Ok(())
}

fn execute_in_workspace(cmd: NeuroGliaStreamCmd, workspace: &Path) -> Result<(), String> {
    let (journal_path, lock_path) = mission_paths(workspace, cmd.mission_id)?;
    let _lock = genos_orchestrator::process_file_lock::ProcessFileLock::acquire(lock_path)?;
    let payload = read_payload(&cmd.payload)?;
    let store = BiologicalReceiptStore::open(&journal_path);
    let mut ecosystem = restored_ecosystem(cmd.mission_id, &store)?;
    let entry = ecosystem.record_neuro_glia_stream_event(&store, NeuroGliaStreamEvent {
        idempotency_key: cmd.idempotency_key,
        event_type: cmd.event_type,
        payload,
        tick: cmd.tick,
    })?;
    let output = serde_json::json!({
        "success": true,
        "execution_mode": "experimental",
        "mission_authority": "unverified_cli_claim",
        "entry": entry,
    });
    println!("{output}");
    Ok(())
}

fn read_payload(path: &Path) -> Result<Value, String> {
    let metadata = fs::metadata(path).map_err(|error| format!("cannot inspect event payload: {error}"))?;
    if metadata.len() > MAX_PAYLOAD_BYTES {
        return Err("event payload exceeds 1048576 bytes".into());
    }
    let bytes = fs::read(path).map_err(|error| format!("cannot read event payload: {error}"))?;
    let value: Value = serde_json::from_slice(&bytes)
        .map_err(|error| format!("event payload must be valid JSON: {error}"))?;
    if value.is_null() {
        return Err("event payload must not be null".into());
    }
    Ok(value)
}

fn restored_ecosystem(
    mission_id: Uuid,
    store: &BiologicalReceiptStore,
) -> Result<GenosEcosystem, String> {
    let entries = store.read_all()?;
    let has_stream = entries.iter().any(|entry| {
        entry["schema"] == "genos.mission-neuro-glia-event/v1"
            && entry["mission_id"] == mission_id.to_string()
    });
    let has_population = entries.iter().any(|entry| {
        entry["schema"] == "genos.population-state/v1"
            && entry["mission_id"] == mission_id.to_string()
    });
    let mut ecosystem = GenosEcosystem::new("neuro-glia-stream-cli");
    ecosystem.set_mission_id(mission_id);
    if has_stream {
        ecosystem.replay_neuro_glia_event_stream(store)?;
    } else if has_population {
        ecosystem.restore_population(store)?;
    }
    Ok(ecosystem)
}

fn mission_paths(workspace: &Path, mission_id: Uuid) -> Result<(PathBuf, PathBuf), String> {
    let workspace = workspace.canonicalize()
        .map_err(|error| format!("cannot canonicalize workspace root: {error}"))?;
    let journal_dir = ensure_receipt_directory(&workspace)?;
    let journal_path = journal_dir.join(format!("{mission_id}.jsonl"));
    if let Ok(metadata) = fs::symlink_metadata(&journal_path) {
        if metadata.file_type().is_symlink() || !metadata.is_file()
            || !journal_path.canonicalize().map_err(|error| error.to_string())?.starts_with(&journal_dir)
        {
            return Err("mission receipt journal must be a regular file inside the workspace".into());
        }
    }
    Ok((journal_path, journal_dir.join(format!("{mission_id}.lock"))))
}

fn ensure_receipt_directory(workspace: &Path) -> Result<PathBuf, String> {
    let path = workspace.join("biological-receipts");
    match fs::symlink_metadata(&path) {
        Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_dir() => {
            return Err("receipt directory must be a real directory inside the workspace".into());
        }
        Ok(_) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            fs::create_dir(&path).map_err(|create_error| format!("cannot create receipt directory: {create_error}"))?;
        }
        Err(error) => return Err(format!("cannot inspect receipt directory: {error}")),
    }
    let journal_dir = path.canonicalize()
        .map_err(|error| format!("cannot canonicalize receipt directory: {error}"))?;
    if !journal_dir.starts_with(workspace) {
        return Err("receipt directory resolves outside the workspace".into());
    }
    Ok(journal_dir)
}

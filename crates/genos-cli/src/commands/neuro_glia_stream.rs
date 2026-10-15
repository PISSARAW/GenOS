use crate::args::NeuroGliaStreamCmd;
use genos_orchestrator::genos_store::BiologicalReceiptStore;
use genos_orchestrator::mission_neuro_glia_receipt::NeuroGliaStreamEvent;
use genos_orchestrator::mission_neuro_glia_receipt::NeuroGliaSourceProof;
use genos_orchestrator::neuro_glia_authenticated_stream::AuthenticatedNeuroGliaRequest;
use genos_orchestrator::neuro_glia_authority::{BackendAuthorizationProof, NeuroGliaProducerAuthority};
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
const MAX_BACKEND_PROOF_BYTES: u64 = 16_384;

/// Append one local experimental event to a mission-scoped neuro-glia stream.
pub fn execute(cmd: NeuroGliaStreamCmd) -> Result<(), String> {
    if !cmd.experimental {
        return Err("neuro-glia-stream has no authenticated mission authority; pass --experimental to opt in".into());
    }
    validate_command(&cmd)?;
    let trust_json = std::env::var("GENOS_NEURO_GLIA_TRUST_JSON")
        .map_err(|_| "GENOS_NEURO_GLIA_TRUST_JSON host bootstrap trust is required".to_string())?;
    let authority = NeuroGliaProducerAuthority::from_bootstrap_json(&trust_json)?;
    let workspace = std::env::var_os("GENOS_STUDIO_ROOT")
        .map(PathBuf::from)
        .map(Ok)
        .unwrap_or_else(std::env::current_dir)
        .map_err(|error| format!("cannot resolve workspace root: {error}"))?;
    execute_in_workspace(cmd, &workspace, &authority)
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

fn execute_in_workspace(
    cmd: NeuroGliaStreamCmd,
    workspace: &Path,
    authority: &NeuroGliaProducerAuthority,
) -> Result<(), String> {
    let (journal_path, lock_path) = mission_paths(workspace, cmd.mission_id)?;
    let _lock = genos_orchestrator::process_file_lock::ProcessFileLock::acquire(lock_path)?;
    let store = BiologicalReceiptStore::open(&journal_path);
    let (payload, backend_authorization) = read_event_inputs(&cmd, &store)?;
    let mut ecosystem = restore_command_ecosystem(&cmd, &store, authority)?;
    let event = build_stream_event(cmd, payload, backend_authorization)?;
    let entry = ecosystem.record_authenticated_neuro_glia_stream_event(&store, AuthenticatedNeuroGliaRequest {
        authority,
        event,
    })?;
    let output = serde_json::json!({
        "success": true,
        "execution_mode": "experimental",
        "mission_authority": "host_pinned_ed25519_producer",
        "entry": entry,
    });
    println!("{output}");
    Ok(())
}

fn read_event_inputs(
    cmd: &NeuroGliaStreamCmd,
    store: &BiologicalReceiptStore,
) -> Result<(Value, Option<BackendAuthorizationProof>), String> {
    let payload = read_payload(&cmd.payload)?;
    let authorization = read_backend_proof(cmd.backend_proof.as_deref())?;
    if cmd.require_backend_authorization && authorization.is_none() {
        return Err("backend principal and scope authorization proof is required".into());
    }
    if cmd.require_backend_authorization { require_authorized_history(store)?; }
    Ok((payload, authorization))
}

fn restore_command_ecosystem(
    cmd: &NeuroGliaStreamCmd,
    store: &BiologicalReceiptStore,
    authority: &NeuroGliaProducerAuthority,
) -> Result<GenosEcosystem, String> {
    restored_ecosystem(cmd.mission_id, store, authority)
}

fn build_stream_event(
    cmd: NeuroGliaStreamCmd,
    payload: Value,
    backend_authorization: Option<BackendAuthorizationProof>,
) -> Result<NeuroGliaStreamEvent, String> {
    let payload_sha256 = genos_orchestrator::neuro_glia_authority::payload_digest(
        &cmd.event_type, &cmd.idempotency_key, &payload,
    )?;
    Ok(NeuroGliaStreamEvent {
        event_id: backend_authorization.as_ref().map(|proof| proof.event_id).unwrap_or_else(Uuid::new_v4),
        idempotency_key: cmd.idempotency_key,
        event_type: cmd.event_type,
        payload,
        tick: cmd.tick,
        source: Some(NeuroGliaSourceProof {
            producer_id: cmd.producer_id,
            payload_sha256,
            signature_hex: cmd.signature_hex,
        }),
        backend_authorization,
    })
}

fn require_authorized_history(store: &BiologicalReceiptStore) -> Result<(), String> {
    for entry in store.read_all()? {
        if entry["schema"] == "genos.mission-neuro-glia-event/v1"
            && !entry["source"]["backend_authorization"].is_object()
        {
            return Err("backend-authorized neuro-glia stream contains an event without principal/scope proof".into());
        }
    }
    Ok(())
}

fn read_backend_proof(path: Option<&Path>) -> Result<Option<BackendAuthorizationProof>, String> {
    let Some(path) = path else { return Ok(None); };
    let metadata = fs::metadata(path).map_err(|error| format!("cannot inspect backend authorization proof: {error}"))?;
    if metadata.len() > MAX_BACKEND_PROOF_BYTES {
        return Err("backend authorization proof exceeds 16384 bytes".into());
    }
    let bytes = fs::read(path).map_err(|error| format!("cannot read backend authorization proof: {error}"))?;
    serde_json::from_slice(&bytes).map(Some)
        .map_err(|error| format!("backend authorization proof is invalid: {error}"))
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
    authority: &NeuroGliaProducerAuthority,
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
        ecosystem.replay_authenticated_neuro_glia_event_stream(store, authority)?;
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

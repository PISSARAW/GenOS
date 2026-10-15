use crate::args::SensoryIngestCmd;
use genos_orchestrator::animal_sensory_runtime::SyntheticAnimalSignal;
use genos_orchestrator::genos_store::BiologicalReceiptStore;
use genos_orchestrator::sensory_receipt_runtime::persist_synthetic_sensory_receipt;
use genos_orchestrator::GenosEcosystem;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct SensoryInput {
    signal: SyntheticAnimalSignal,
}

/// Process and durably record one mission-scoped synthetic sensory input.
pub fn execute(cmd: SensoryIngestCmd) -> Result<(), String> {
    let workspace_root = std::env::var_os("GENOS_STUDIO_ROOT")
        .map(PathBuf::from)
        .map(Ok)
        .unwrap_or_else(std::env::current_dir)
        .map_err(|error| format!("cannot resolve workspace root: {error}"))?;
    execute_in_workspace(cmd, &workspace_root)
}

fn execute_in_workspace(cmd: SensoryIngestCmd, workspace: &Path) -> Result<(), String> {
    require_experimental(cmd.experimental)?;
    let mission_id = Uuid::parse_str(&cmd.mission_id)
        .map_err(|error| format!("mission_id must be a UUID: {error}"))?;
    validate_replay_key(&cmd.replay_key)?;
    let (journal_path, lock_path) = mission_paths(workspace, mission_id)?;
    let _lock = super::biological_lock::MissionLock::acquire(lock_path)?;
    let source = build_source(&cmd.input, &cmd.replay_key, mission_id)?;
    persist_and_print(journal_path, mission_id, source)
}

fn require_experimental(experimental: bool) -> Result<(), String> {
    if experimental {
        Ok(())
    } else {
        Err("sensory-ingest has no authenticated mission authority; pass --experimental to opt in".into())
    }
}

fn build_source(input_path: &Path, replay_key: &str, mission_id: Uuid) -> Result<serde_json::Value, String> {
    let input_bytes = fs::read(input_path)
        .map_err(|error| format!("cannot read sensory input: {error}"))?;
    let input: SensoryInput = serde_json::from_slice(&input_bytes)
        .map_err(|error| format!("invalid typed sensory input: {error}"))?;

    let mut ecosystem = GenosEcosystem::new("synthetic-sensory-cli");
    ecosystem.set_mission_id(mission_id);
    let runtime_receipt = ecosystem.ingest_synthetic_animal_signal(input.signal)?;
    let mut source = serde_json::to_value(runtime_receipt)
        .map_err(|error| format!("cannot serialize sensory receipt: {error}"))?;
    source["event_id"] = serde_json::json!(stable_event_id(mission_id, replay_key));
    source["execution_mode"] = serde_json::json!("experimental");
    source["mission_authority"] = serde_json::json!("unverified_cli_claim");
    Ok(source)
}

fn persist_and_print(
    journal_path: PathBuf,
    mission_id: Uuid,
    source: serde_json::Value,
) -> Result<(), String> {
    let receipt = persist_synthetic_sensory_receipt(&BiologicalReceiptStore::open(journal_path), mission_id, &source)?;
    let output = serde_json::to_string(&receipt)
        .map_err(|error| format!("cannot render sensory receipt: {error}"))?;
    println!("{output}");
    Ok(())
}

fn mission_paths(workspace: &Path, mission_id: Uuid) -> Result<(PathBuf, PathBuf), String> {
    let workspace = workspace.canonicalize()
        .map_err(|error| format!("cannot canonicalize workspace root: {error}"))?;
    let journal_dir = ensure_workspace_directory(&workspace.join("biological-receipts"), &workspace)?;
    let journal_path = journal_dir.join(format!("{mission_id}.jsonl"));
    if let Ok(metadata) = fs::symlink_metadata(&journal_path) {
        if metadata.file_type().is_symlink() || !metadata.is_file() {
            return Err("mission receipt journal must be a regular file inside the workspace".into());
        }
        let canonical_file = journal_path.canonicalize()
            .map_err(|error| format!("cannot canonicalize mission journal: {error}"))?;
        if !canonical_file.starts_with(&journal_dir) {
            return Err("mission receipt journal resolves outside the workspace".into());
        }
    }
    Ok((journal_path, journal_dir.join(format!("{mission_id}.lock"))))
}

fn ensure_workspace_directory(path: &Path, workspace: &Path) -> Result<PathBuf, String> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_dir() => {
            return Err("receipt directory must be a real directory inside the workspace".into());
        }
        Ok(_) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            fs::create_dir(path)
                .map_err(|create_error| format!("cannot create confined receipt directory: {create_error}"))?;
        }
        Err(error) => return Err(format!("cannot inspect receipt directory: {error}")),
    }
    let canonical = path.canonicalize()
        .map_err(|error| format!("cannot canonicalize receipt directory: {error}"))?;
    if !canonical.starts_with(workspace) {
        return Err("receipt directory resolves outside the workspace".into());
    }
    Ok(canonical)
}

fn validate_replay_key(key: &str) -> Result<(), String> {
    if key.trim().is_empty() || key.len() > 256 {
        return Err("replay_key must contain between 1 and 256 bytes".into());
    }
    Ok(())
}

fn stable_event_id(mission_id: Uuid, replay_key: &str) -> Uuid {
    let material = format!("genos.synthetic-sensory/v1:{mission_id}:{replay_key}");
    let digest = Sha256::digest(material.as_bytes());
    let mut bytes = [0_u8; 16];
    bytes.copy_from_slice(&digest[..16]);
    bytes[6] = (bytes[6] & 0x0f) | 0x50;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    Uuid::from_bytes(bytes)
}

#[cfg(test)]
mod tests {
    use super::{execute_in_workspace, mission_paths, SensoryInput};
    use crate::args::SensoryIngestCmd;
    use genos_orchestrator::genos_store::BiologicalReceiptStore;
    use genos_orchestrator::sensory_receipt_runtime::read_synthetic_sensory_receipts;
    use serde_json::json;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};
    use uuid::Uuid;

    fn scratch_path(suffix: &str) -> PathBuf {
        let nonce = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
        std::env::temp_dir().join(format!("genos-sensory-cli-{nonce}-{suffix}"))
    }

    fn input_path(signal: serde_json::Value) -> PathBuf {
        let path = scratch_path("input.json");
        std::fs::write(&path, json!({"signal": signal}).to_string()).unwrap();
        path
    }

    fn command(mission_id: &Uuid, input: PathBuf, replay_key: &str) -> SensoryIngestCmd {
        SensoryIngestCmd {
            mission_id: mission_id.to_string(), input, replay_key: replay_key.into(), experimental: true,
        }
    }

    fn workspace() -> PathBuf {
        let root = scratch_path("workspace");
        std::fs::create_dir_all(&root).unwrap();
        root
    }

    #[test]
    fn cli_ingest_is_mission_bound_durable_and_exactly_replayable() {
        let mission = Uuid::new_v4();
        let root = workspace();
        let journal = mission_paths(&root, mission).unwrap().0;
        let input = input_path(json!({"sensor":"passive_electroreception","ambient_uv":[0.2,0.5,0.9]}));
        execute_in_workspace(command(&mission, input.clone(), "request-42"), &root).unwrap();
        execute_in_workspace(command(&mission, input.clone(), "request-42"), &root).unwrap();

        let entries = BiologicalReceiptStore::open(&journal).read_all().unwrap();
        assert_eq!(entries.len(), 1, "an exact retry must reuse its durable receipt");
        let receipt = &entries[0];
        assert_eq!(receipt["mission_id"], mission.to_string());
        assert_eq!(receipt["origin"], "synthetic");
        assert_eq!(receipt["source_receipt"]["mission_authority"], "unverified_cli_claim");
        assert_eq!(receipt["source_receipt"]["execution_mode"], "experimental");
        assert_eq!(receipt["source_receipt"]["signal"]["sensor"], "passive_electroreception");
        assert!(receipt["source_digest"].as_str().is_some());

        let _ = std::fs::remove_file(input);
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn cli_ingest_rejects_cross_mission_and_divergent_replay() {
        let mission = Uuid::new_v4();
        let root = workspace();
        let journal = mission_paths(&root, mission).unwrap().0;
        let input = input_path(json!({"sensor":"passive_electroreception","ambient_uv":[0.2,0.5,0.9]}));
        execute_in_workspace(command(&mission, input.clone(), "request-42"), &root).unwrap();
        assert!(read_synthetic_sensory_receipts(&BiologicalReceiptStore::open(&journal), Uuid::new_v4())
            .unwrap().is_empty(), "a different mission must not see the stored receipt");

        let changed = input_path(json!({"sensor":"passive_electroreception","ambient_uv":[0.2,0.5,0.8]}));
        assert!(execute_in_workspace(command(&mission, changed.clone(), "request-42"), &root)
            .unwrap_err().contains("different receipt content"));

        let _ = std::fs::remove_file(input);
        let _ = std::fs::remove_file(changed);
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn cli_ingest_fails_closed_on_untyped_or_invalid_input() {
        let mission = Uuid::new_v4();
        let root = workspace();
        let journal = mission_paths(&root, mission).unwrap().0;
        let missing_sensor = input_path(json!({"sensor":"unknown"}));
        assert!(execute_in_workspace(command(&mission, missing_sensor.clone(), "request-1"), &root).is_err());
        assert!(!journal.exists());

        let malformed = scratch_path("malformed.json");
        std::fs::write(&malformed, "not-json").unwrap();
        assert!(execute_in_workspace(command(&mission, malformed.clone(), "request-2"), &root).is_err());
        assert!(!journal.exists());
        let _ = std::fs::remove_file(missing_sensor);
        let _ = std::fs::remove_file(malformed);
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn mission_lock_and_workspace_confinement_fail_closed() {
        let mission = Uuid::new_v4();
        let lock_root = workspace();
        let (journal, lock) = mission_paths(&lock_root, mission).unwrap();
        std::fs::write(&lock, "held by another process").unwrap();
        let input = input_path(json!({"sensor":"passive_electroreception","ambient_uv":[0.2]}));
        assert!(execute_in_workspace(command(&mission, input.clone(), "request-1"), &lock_root).is_ok(),
            "a stale sidecar file must not act as a permanent lock");
        assert!(journal.exists());

        let root = workspace();
        let outside = scratch_path("outside");
        std::fs::create_dir_all(&outside).unwrap();
        let linked = root.join("biological-receipts");
        #[cfg(unix)]
        let linked_ok = std::os::unix::fs::symlink(&outside, &linked).is_ok();
        #[cfg(windows)]
        let linked_ok = std::os::windows::fs::symlink_dir(&outside, &linked).is_ok();
        if !linked_ok {
            let _ = std::fs::remove_file(input);
            let _ = std::fs::remove_dir_all(lock_root);
            let _ = std::fs::remove_dir_all(root);
            let _ = std::fs::remove_dir_all(outside);
            return;
        }
        assert!(mission_paths(&root, mission).unwrap_err().contains("real directory inside the workspace"));
        assert!(!outside.join("biological-receipts").exists());
        let _ = std::fs::remove_file(input);
        let _ = std::fs::remove_dir_all(lock_root);
        let _ = std::fs::remove_dir_all(root);
        let _ = std::fs::remove_dir_all(outside);
    }

    #[test]
    fn command_requires_explicit_experimental_opt_in() {
        let mission = Uuid::new_v4();
        let root = workspace();
        let input = input_path(json!({"sensor":"passive_electroreception","ambient_uv":[0.2]}));
        let mut cmd = command(&mission, input.clone(), "request-1");
        cmd.experimental = false;
        assert!(execute_in_workspace(cmd, &root).unwrap_err().contains("no authenticated mission authority"));
        assert!(!root.join("biological-receipts").exists());
        let _ = std::fs::remove_file(input);
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn typed_input_rejects_unknown_fields_at_each_boundary() {
        let extra_envelope = serde_json::json!({
            "signal": {"sensor": "passive_electroreception", "ambient_uv": [0.2]},
            "unreviewed": true
        });
        assert!(serde_json::from_value::<SensoryInput>(extra_envelope).is_err());
        let extra_signal = serde_json::json!({
            "signal": {"sensor": "passive_electroreception", "ambient_uv": [0.2], "amibent_uv": [0.9]}
        });
        assert!(serde_json::from_value::<SensoryInput>(extra_signal).is_err());
    }
}

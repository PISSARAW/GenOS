use crate::args::SensoryIngestCmd;
use genos_orchestrator::animal_sensory_runtime::SyntheticAnimalSignal;
use genos_orchestrator::genos_store::BiologicalReceiptStore;
use genos_orchestrator::sensory_receipt_runtime::persist_synthetic_sensory_receipt;
use genos_orchestrator::sensory_authority::{stimulus_digest, SensoryProducerAuthority, SensoryProof};
use genos_orchestrator::GenosEcosystem;
use serde::Deserialize;
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;

const MAX_SENSORY_INPUT_BYTES: u64 = 1_048_576;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct SensoryInput {
    #[serde(default)] schema: Option<String>,
    #[serde(default)] producer_id: Option<Uuid>,
    #[serde(default)] signature_hex: Option<String>,
    #[serde(default)] tick: Option<u64>,
    signal: SyntheticAnimalSignal,
}

struct SourceBuildRequest<'a> {
    input_path: &'a Path,
    replay_key: &'a str,
    mission_id: Uuid,
    authority: Option<&'a SensoryProducerAuthority>,
}

/// Process and durably record one mission-scoped synthetic sensory input.
pub fn execute(cmd: SensoryIngestCmd) -> Result<(), String> {
    let workspace_root = std::env::var_os("GENOS_STUDIO_ROOT")
        .map(PathBuf::from)
        .map(Ok)
        .unwrap_or_else(std::env::current_dir)
        .map_err(|error| format!("cannot resolve workspace root: {error}"))?;
    let authority = load_authority()?;
    execute_in_workspace(cmd, &workspace_root, authority.as_ref())
}

fn execute_in_workspace(cmd: SensoryIngestCmd, workspace: &Path, authority: Option<&SensoryProducerAuthority>) -> Result<(), String> {
    require_experimental(cmd.experimental)?;
    let mission_id = Uuid::parse_str(&cmd.mission_id)
        .map_err(|error| format!("mission_id must be a UUID: {error}"))?;
    super::sensory_input::validate_replay_key(&cmd.replay_key)?;
    let (journal_path, lock_path) = mission_paths(workspace, mission_id)?;
    let _lock = super::biological_lock::MissionLock::acquire(lock_path)?;
    let source = build_source(SourceBuildRequest {
        input_path: &cmd.input,
        replay_key: &cmd.replay_key,
        mission_id,
        authority,
    })?;
    persist_and_print(journal_path, mission_id, source)
}

fn require_experimental(experimental: bool) -> Result<(), String> {
    if experimental {
        Ok(())
    } else {
        Err("sensory-ingest has no authenticated mission authority; pass --experimental to opt in".into())
    }
}

fn load_authority() -> Result<Option<SensoryProducerAuthority>, String> {
    match std::env::var("GENOS_SENSORY_TRUST_JSON") {
        Ok(trust) => SensoryProducerAuthority::from_bootstrap_json(&trust).map(Some),
        Err(std::env::VarError::NotPresent) => Ok(None),
        Err(error) => Err(format!("cannot read host sensory producer trust: {error}")),
    }
}

fn build_source(request: SourceBuildRequest<'_>) -> Result<serde_json::Value, String> {
    let input_bytes = super::sensory_input::read_bounded_input(
        request.input_path, MAX_SENSORY_INPUT_BYTES, "sensory",
    )?;
    let input: SensoryInput = serde_json::from_slice(&input_bytes)
        .map_err(|error| format!("invalid typed sensory input: {error}"))?;
    let verified_source = verify_input(&input, request.mission_id, request.authority)?;

    let mut ecosystem = GenosEcosystem::new("synthetic-sensory-cli");
    ecosystem.set_mission_id(request.mission_id);
    let runtime_receipt = ecosystem.ingest_synthetic_animal_signal(input.signal)?;
    let mut source = serde_json::to_value(runtime_receipt)
        .map_err(|error| format!("cannot serialize sensory receipt: {error}"))?;
    source["event_id"] = serde_json::json!(super::sensory_input::stable_event_id(request.mission_id, request.replay_key));
    source["execution_mode"] = serde_json::json!("experimental");
    source["mission_authority"] = serde_json::json!("unverified_cli_claim");
    let (producer_id, signature_hex, tick, stimulus_sha256, trust_key_sha256) = verified_source;
    source["producer_id"] = serde_json::json!(producer_id);
    source["producer_signature_hex"] = serde_json::json!(signature_hex);
    source["source_tick"] = serde_json::json!(tick);
    source["stimulus_sha256"] = serde_json::json!(stimulus_sha256);
    source["producer_trust_key_sha256"] = serde_json::json!(trust_key_sha256);
    source["source_authentication"] = serde_json::json!("host_pinned_ed25519");
    Ok(source)
}

fn verify_input(
    input: &SensoryInput,
    mission_id: Uuid,
    authority: Option<&SensoryProducerAuthority>,
) -> Result<(Uuid, String, u64, String, String), String> {
    if !has_signed_fields(input) {
        return Err("sensory-ingest requires a signed producer envelope".into());
    }
    let (schema, producer_id, signature_hex, tick, authority) = signed_input_fields(input, authority)?;
    if schema != "genos.signed-synthetic-sensory-input/v1" || tick == 0 {
        return Err("signed sensory input schema or tick is invalid".into());
    }
    let stimulus_sha256 = stimulus_digest(producer_id, tick, &input.signal)?;
    let trust_key_sha256 = authority.verify(SensoryProof {
        mission_id, tick, producer_id, stimulus_sha256: &stimulus_sha256, signature_hex,
    })?;
    Ok((producer_id, signature_hex.to_string(), tick, stimulus_sha256, trust_key_sha256))
}

fn has_signed_fields(input: &SensoryInput) -> bool {
    input.schema.is_some() || input.producer_id.is_some()
        || input.signature_hex.is_some() || input.tick.is_some()
}

fn signed_input_fields<'a>(
    input: &'a SensoryInput,
    authority: Option<&'a SensoryProducerAuthority>,
) -> Result<(&'a str, Uuid, &'a str, u64, &'a SensoryProducerAuthority), String> {
    let schema = input.schema.as_deref().ok_or("signed sensory input has no schema")?;
    let producer = input.producer_id.ok_or("signed sensory input has no producer identity")?;
    let signature = input.signature_hex.as_deref().ok_or("signed sensory input has no signature")?;
    let tick = input.tick.ok_or("signed sensory input has no tick")?;
    let trust = authority.ok_or("host sensory producer trust is not configured")?;
    Ok((schema, producer, signature, tick, trust))
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
    use ed25519_dalek::{Signer, SigningKey};
    use genos_orchestrator::sensory_authority::{signing_bytes, stimulus_digest, SensoryClaims, SensoryProducerAuthority};

    fn scratch_path(suffix: &str) -> PathBuf {
        let nonce = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
        std::env::temp_dir().join(format!("genos-sensory-cli-{nonce}-{suffix}"))
    }

    fn input_path(signal: serde_json::Value, mission: Uuid, key: &SigningKey) -> PathBuf {
        let path = scratch_path("input.json");
        let producer = Uuid::from_u128(11);
        let typed: super::SyntheticAnimalSignal = serde_json::from_value(signal).unwrap();
        let digest = stimulus_digest(producer, 1, &typed).unwrap();
        let signature = key.sign(&signing_bytes(SensoryClaims {
            mission_id: mission, tick: 1, producer_id: producer, stimulus_sha256: &digest,
        }).unwrap());
        std::fs::write(&path, json!({
            "schema": "genos.signed-synthetic-sensory-input/v1", "producer_id": producer,
            "signature_hex": signature.to_bytes().iter().map(|byte| format!("{byte:02x}")).collect::<String>(),
            "tick": 1, "signal": typed,
        }).to_string()).unwrap();
        path
    }

    fn trust() -> (SigningKey, SensoryProducerAuthority) {
        let key = SigningKey::from_bytes(&[7; 32]);
        let producer = Uuid::from_u128(11);
        let public_key_hex = key.verifying_key().as_bytes().iter().map(|byte| format!("{byte:02x}")).collect::<String>();
        let config = json!({"schema":"genos.synthetic-sensory-producer-trust/v1", "producers":[{"producer_id":producer,"public_key_hex":public_key_hex}]});
        (key, SensoryProducerAuthority::from_bootstrap_json(&config.to_string()).unwrap())
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
        let (key, authority) = trust();
        let root = workspace();
        let journal = mission_paths(&root, mission).unwrap().0;
        let input = input_path(json!({"sensor":"passive_electroreception","ambient_uv":[0.2,0.5,0.9]}), mission, &key);
        execute_in_workspace(command(&mission, input.clone(), "request-42"), &root, Some(&authority)).unwrap();
        execute_in_workspace(command(&mission, input.clone(), "request-42"), &root, Some(&authority)).unwrap();

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
        let (key, authority) = trust();
        let root = workspace();
        let journal = mission_paths(&root, mission).unwrap().0;
        let input = input_path(json!({"sensor":"passive_electroreception","ambient_uv":[0.2,0.5,0.9]}), mission, &key);
        execute_in_workspace(command(&mission, input.clone(), "request-42"), &root, Some(&authority)).unwrap();
        assert!(read_synthetic_sensory_receipts(&BiologicalReceiptStore::open(&journal), Uuid::new_v4())
            .unwrap().is_empty(), "a different mission must not see the stored receipt");

        let changed = input_path(json!({"sensor":"passive_electroreception","ambient_uv":[0.2,0.5,0.8]}), mission, &key);
        assert!(execute_in_workspace(command(&mission, changed.clone(), "request-42"), &root, Some(&authority))
            .unwrap_err().contains("different receipt content"));

        let _ = std::fs::remove_file(input);
        let _ = std::fs::remove_file(changed);
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn cli_ingest_fails_closed_on_untyped_or_invalid_input() {
        let mission = Uuid::new_v4();
        let (key, authority) = trust();
        let root = workspace();
        let journal = mission_paths(&root, mission).unwrap().0;
        let missing_sensor = input_path(json!({"sensor":"passive_electroreception","ambient_uv":[]}), mission, &key);
        assert!(execute_in_workspace(command(&mission, missing_sensor.clone(), "request-1"), &root, Some(&authority)).is_err());
        assert!(!journal.exists());

        let malformed = scratch_path("malformed.json");
        std::fs::write(&malformed, "not-json").unwrap();
        assert!(execute_in_workspace(command(&mission, malformed.clone(), "request-2"), &root, Some(&authority)).is_err());
        assert!(!journal.exists());
        let _ = std::fs::remove_file(missing_sensor);
        let _ = std::fs::remove_file(malformed);
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn mission_lock_and_workspace_confinement_fail_closed() {
        let mission = Uuid::new_v4();
        let (key, authority) = trust();
        let lock_root = workspace();
        let (journal, lock) = mission_paths(&lock_root, mission).unwrap();
        std::fs::write(&lock, "held by another process").unwrap();
        let input = input_path(json!({"sensor":"passive_electroreception","ambient_uv":[0.2]}), mission, &key);
        assert!(execute_in_workspace(command(&mission, input.clone(), "request-1"), &lock_root, Some(&authority)).is_ok(),
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
        let (key, authority) = trust();
        let root = workspace();
        let input = input_path(json!({"sensor":"passive_electroreception","ambient_uv":[0.2]}), mission, &key);
        let mut cmd = command(&mission, input.clone(), "request-1");
        cmd.experimental = false;
        assert!(execute_in_workspace(cmd, &root, Some(&authority)).unwrap_err().contains("no authenticated mission authority"));
        assert!(!root.join("biological-receipts").exists());
        let _ = std::fs::remove_file(input);
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn signed_ingest_refuses_legacy_input_and_missing_host_trust() {
        let mission = Uuid::new_v4();
        let root = workspace();
        let unsigned = scratch_path("unsigned.json");
        std::fs::write(&unsigned, json!({
            "signal": {"sensor":"passive_electroreception", "ambient_uv":[0.2]}
        }).to_string()).unwrap();
        let error = execute_in_workspace(command(&mission, unsigned.clone(), "legacy"), &root, None).unwrap_err();
        assert!(error.contains("signed producer envelope"));
        assert!(!root.join("biological-receipts").join(format!("{mission}.jsonl")).exists());

        let (key, _) = trust();
        let signed = input_path(json!({"sensor":"passive_electroreception","ambient_uv":[0.2]}), mission, &key);
        let error = execute_in_workspace(command(&mission, signed.clone(), "no-trust"), &root, None).unwrap_err();
        assert!(error.contains("host sensory producer trust is not configured"));
        assert!(!root.join("biological-receipts").join(format!("{mission}.jsonl")).exists());
        let _ = std::fs::remove_file(unsigned);
        let _ = std::fs::remove_file(signed);
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

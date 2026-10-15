use genos_orchestrator::genos_store::BiologicalReceiptStore;
use genos_orchestrator::process_file_lock::ProcessFileLock;
use genos_orchestrator::sensory_receipt_runtime::read_synthetic_sensory_receipts;
use std::path::PathBuf;
use std::process::{Child, Command};
use std::thread;
use std::time::Duration;
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;
use ed25519_dalek::{Signer, SigningKey};
use genos_orchestrator::sensory_authority::{signing_bytes, stimulus_digest, SensoryClaims};

fn scratch_path(name: &str) -> PathBuf {
    let nonce = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
    std::env::temp_dir().join(format!("genos-cli-sensory-{nonce}-{name}"))
}

fn producer_key() -> SigningKey { SigningKey::from_bytes(&[12; 32]) }

fn trust_json() -> String {
    let key = producer_key();
    let public_key_hex = key.verifying_key().as_bytes().iter().map(|byte| format!("{byte:02x}")).collect::<String>();
    serde_json::json!({"schema":"genos.synthetic-sensory-producer-trust/v1", "producers":[{
        "producer_id":Uuid::from_u128(123), "public_key_hex":public_key_hex
    }]}).to_string()
}

fn write_signal(ambient_uv: &[f64], mission: Uuid) -> PathBuf {
    write_signal_from(ambient_uv, mission, SignalProducer { id: Uuid::from_u128(123), key: producer_key() })
}

struct SignalProducer { id: Uuid, key: SigningKey }

fn write_signal_from(ambient_uv: &[f64], mission: Uuid, producer: SignalProducer) -> PathBuf {
    let path = scratch_path("input.json");
    let signal = serde_json::json!({
        "sensor": "passive_electroreception",
        "ambient_uv": ambient_uv,
    });
    let digest = stimulus_digest(producer.id, 1, &signal).unwrap();
    let signature = producer.key.sign(&signing_bytes(SensoryClaims {
        mission_id: mission, tick: 1, producer_id: producer.id, stimulus_sha256: &digest,
    }).unwrap());
    std::fs::write(&path, serde_json::json!({
        "schema":"genos.signed-synthetic-sensory-input/v1", "producer_id":producer.id,
        "signature_hex":signature.to_bytes().iter().map(|byte| format!("{byte:02x}")).collect::<String>(),
        "tick":1, "signal":signal,
    }).to_string()).unwrap();
    path
}

struct CliInvocation<'a> {
    mission: Uuid,
    input: &'a PathBuf,
    workspace: &'a PathBuf,
    experimental: bool,
    journal_override: Option<&'a PathBuf>,
}

fn spawn_ingest(invocation: CliInvocation<'_>) -> Child {
    let mission = invocation.mission.to_string();
    let mut command = Command::new(env!("CARGO_BIN_EXE_genos"));
    command
        .env("GENOS_STUDIO_ROOT", invocation.workspace)
        .env("GENOS_SENSORY_TRUST_JSON", trust_json())
        .args(["sensory-ingest", "--mission-id", mission.as_str()])
        .arg("--input")
        .arg(invocation.input)
        .args(["--replay-key", "test-replay-01"]);
    if invocation.experimental {
        command.arg("--experimental");
    }
    if let Some(journal) = invocation.journal_override {
        command.arg("--journal").arg(journal);
    }
    command.spawn().unwrap()
}

fn run_ingest(invocation: CliInvocation<'_>) -> std::process::Output {
    spawn_ingest(invocation).wait_with_output().unwrap()
}

#[test]
fn sensory_ingest_cli_persists_mission_bound_replay_receipt() {
    let mission = Uuid::new_v4();
    let workspace = scratch_path("workspace");
    std::fs::create_dir_all(&workspace).unwrap();
    let input = write_signal(&[0.2, 0.5, 0.9], mission);
    let rejected_workspace = scratch_path("rejected-workspace");
    std::fs::create_dir_all(&rejected_workspace).unwrap();
    let unknown_source = write_signal_from(&[0.2], mission, SignalProducer {
        id: Uuid::from_u128(999), key: SigningKey::from_bytes(&[44; 32]),
    });
    let unknown_result = run_ingest(CliInvocation {
        mission, input: &unknown_source, workspace: &rejected_workspace, experimental: true, journal_override: None,
    });
    assert!(!unknown_result.status.success());
    assert!(!rejected_workspace.join("biological-receipts").join(format!("{mission}.jsonl")).exists());
    let _ = std::fs::remove_file(unknown_source);

    let wrong_mission = Uuid::new_v4();
    let wrong_mission_result = run_ingest(CliInvocation {
        mission: wrong_mission, input: &input, workspace: &rejected_workspace, experimental: true, journal_override: None,
    });
    assert!(!wrong_mission_result.status.success());

    let tampered = scratch_path("tampered-input.json");
    let mut tampered_value: serde_json::Value = serde_json::from_slice(&std::fs::read(&input).unwrap()).unwrap();
    tampered_value["signal"]["ambient_uv"][0] = serde_json::json!(0.99);
    std::fs::write(&tampered, tampered_value.to_string()).unwrap();
    let tampered_result = run_ingest(CliInvocation {
        mission, input: &tampered, workspace: &rejected_workspace, experimental: true, journal_override: None,
    });
    assert!(!tampered_result.status.success());
    assert!(!rejected_workspace.join("biological-receipts").join(format!("{mission}.jsonl")).exists());
    let _ = std::fs::remove_file(tampered);
    let _ = std::fs::remove_dir_all(rejected_workspace);
    let unacknowledged = run_ingest(CliInvocation {
        mission, input: &input, workspace: &workspace, experimental: false, journal_override: None,
    });
    assert!(!unacknowledged.status.success());

    let arbitrary_journal = scratch_path("outside.jsonl");
    let unconfined = run_ingest(CliInvocation {
        mission, input: &input, workspace: &workspace, experimental: true,
        journal_override: Some(&arbitrary_journal),
    });
    assert!(!unconfined.status.success());
    assert!(!arbitrary_journal.exists());

    let journal_dir = workspace.join("biological-receipts");
    std::fs::create_dir_all(&journal_dir).unwrap();
    let lock = journal_dir.join(format!("{mission}.lock"));
    let held_lock = ProcessFileLock::acquire(&lock).unwrap();
    let mut blocked_cli = spawn_ingest(CliInvocation {
        mission, input: &input, workspace: &workspace, experimental: true, journal_override: None,
    });
    thread::sleep(Duration::from_millis(250));
    assert!(blocked_cli.try_wait().unwrap().is_none(), "CLI must wait while another process holds the mission lock");
    drop(held_lock);
    assert!(blocked_cli.wait().unwrap().success());
    let journal = journal_dir.join(format!("{mission}.jsonl"));
    assert!(journal.exists());
    assert!(run_ingest(CliInvocation {
        mission, input: &input, workspace: &workspace, experimental: true, journal_override: None,
    }).status.success());

    let store = BiologicalReceiptStore::open(&journal);
    let stored = store.read_all().unwrap();
    assert_eq!(stored.len(), 1);
    assert_eq!(stored[0]["mission_id"], mission.to_string());
    assert_eq!(stored[0]["origin"], "synthetic");
    assert!(stored[0]["source_digest"].as_str().is_some());
    assert_eq!(read_synthetic_sensory_receipts(&store, Uuid::new_v4()).unwrap().len(), 0);

    let changed = write_signal(&[0.2, 0.5, 0.8], mission);
    let rejected = run_ingest(CliInvocation {
        mission, input: &changed, workspace: &workspace, experimental: true, journal_override: None,
    });
    assert!(!rejected.status.success());

    let _ = std::fs::remove_file(input);
    let _ = std::fs::remove_file(changed);
    let _ = std::fs::remove_dir_all(workspace);
}

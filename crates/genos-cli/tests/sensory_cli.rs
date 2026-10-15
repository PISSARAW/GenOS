use genos_orchestrator::genos_store::BiologicalReceiptStore;
use genos_orchestrator::process_file_lock::ProcessFileLock;
use genos_orchestrator::sensory_receipt_runtime::read_synthetic_sensory_receipts;
use std::path::PathBuf;
use std::process::{Child, Command};
use std::thread;
use std::time::Duration;
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

fn scratch_path(name: &str) -> PathBuf {
    let nonce = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
    std::env::temp_dir().join(format!("genos-cli-sensory-{nonce}-{name}"))
}

fn write_signal(ambient_uv: &[f64]) -> PathBuf {
    let path = scratch_path("input.json");
    let signal = serde_json::json!({"signal": {
        "sensor": "passive_electroreception",
        "ambient_uv": ambient_uv,
    }});
    std::fs::write(&path, signal.to_string()).unwrap();
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
    let input = write_signal(&[0.2, 0.5, 0.9]);
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

    let changed = write_signal(&[0.2, 0.5, 0.8]);
    let rejected = run_ingest(CliInvocation {
        mission, input: &changed, workspace: &workspace, experimental: true, journal_override: None,
    });
    assert!(!rejected.status.success());

    let _ = std::fs::remove_file(input);
    let _ = std::fs::remove_file(changed);
    let _ = std::fs::remove_dir_all(workspace);
}

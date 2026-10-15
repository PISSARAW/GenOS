use genos_orchestrator::genos_store::BiologicalReceiptStore;
use serde_json::json;
use std::path::Path;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

fn scratch_root() -> std::path::PathBuf {
    let nonce = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
    Path::new(env!("CARGO_MANIFEST_DIR")).join(format!(".genos-neuro-glia-cli-{nonce}"))
}

struct EventCall<'a> {
    mission: Uuid,
    payload: &'a Path,
    key: &'a str,
    tick: u64,
}

fn run_event(root: &Path, call: EventCall<'_>) -> std::process::Output {
    Command::new(env!("CARGO_BIN_EXE_genos"))
        .args([
            "neuro-glia-stream", "--experimental",
            "--mission-id", &call.mission.to_string(),
            "--event-type", "BIOLOGICAL_EXECUTION_RECEIPT",
            "--payload", call.payload.to_str().unwrap(),
            "--idempotency-key", call.key,
            "--tick", &call.tick.to_string(),
        ])
        .env("GENOS_STUDIO_ROOT", root)
        .output()
        .unwrap()
}

#[test]
fn cli_writes_ordered_durable_events_and_reuses_exact_retry_after_restart() {
    let root = scratch_root();
    std::fs::create_dir_all(&root).unwrap();
    let mission = Uuid::new_v4();
    let first_payload = root.join("first.json");
    let second_payload = root.join("second.json");
    std::fs::write(&first_payload, json!({"completed": true, "cost": 1.0}).to_string()).unwrap();
    std::fs::write(&second_payload, json!({"completed": true, "cost": 2.0}).to_string()).unwrap();

    let first = run_event(&root, EventCall { mission, payload: &first_payload, key: "event-1", tick: 10 });
    assert!(first.status.success(), "first event failed: {}", String::from_utf8_lossy(&first.stderr));
    assert!(run_event(&root, EventCall { mission, payload: &second_payload, key: "event-2", tick: 11 }).status.success());
    let retry = run_event(&root, EventCall { mission, payload: &first_payload, key: "event-1", tick: 10 });
    assert!(retry.status.success(), "exact retry failed: {}", String::from_utf8_lossy(&retry.stderr));
    let journal = root.join("biological-receipts").join(format!("{mission}.jsonl"));
    let entries = BiologicalReceiptStore::open(&journal).read_all().unwrap();
    let stream = entries.iter().filter(|entry| entry["schema"] == "genos.mission-neuro-glia-event/v1").collect::<Vec<_>>();
    assert_eq!(stream.len(), 2, "retry must not append a second event");
    assert_eq!(stream.iter().map(|entry| entry["sequence"].as_u64().unwrap()).collect::<Vec<_>>(), [1, 2]);
    assert_eq!(stream.iter().map(|entry| entry["idempotency_key"].as_str().unwrap()).collect::<Vec<_>>(), ["event-1", "event-2"]);
    assert_eq!(stream[1]["response"]["missionId"], mission.to_string());
    assert_eq!(stream[1]["response"]["schema"], "genos.mission-neuro-glia-quorum/v1");
    assert_eq!(stream[1]["response"]["glial"]["microglialState"], "Sentinel");
    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn cli_requires_opt_in_and_rejects_unsupported_events_without_writing() {
    let root = scratch_root();
    std::fs::create_dir_all(&root).unwrap();
    let mission = Uuid::new_v4();
    let payload = root.join("payload.json");
    std::fs::write(&payload, json!({"completed": true}).to_string()).unwrap();
    let missing_opt_in = Command::new(env!("CARGO_BIN_EXE_genos"))
        .args(["neuro-glia-stream", "--mission-id", &mission.to_string(), "--event-type", "BIOLOGICAL_EXECUTION_RECEIPT", "--payload", payload.to_str().unwrap(), "--idempotency-key", "event-1", "--tick", "1"])
        .env("GENOS_STUDIO_ROOT", &root).output().unwrap();
    assert!(!missing_opt_in.status.success());
    let unsupported = Command::new(env!("CARGO_BIN_EXE_genos"))
        .args(["neuro-glia-stream", "--experimental", "--mission-id", &mission.to_string(), "--event-type", "UNRELATED_EVENT", "--payload", payload.to_str().unwrap(), "--idempotency-key", "event-1", "--tick", "1"])
        .env("GENOS_STUDIO_ROOT", &root).output().unwrap();
    assert!(!unsupported.status.success());
    assert!(!root.join("biological-receipts").exists());
    let _ = std::fs::remove_dir_all(root);
}

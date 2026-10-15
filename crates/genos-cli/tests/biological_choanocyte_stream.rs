use serde_json::{Value, json};
use std::path::Path;
use std::process::Command;
use uuid::Uuid;

#[test]
fn biological_command_persists_typed_stream_under_mission_and_producer_identity() {
    let root = std::env::current_dir().unwrap().join(format!(".genos-cli-choano-{}", Uuid::new_v4()));
    std::fs::create_dir_all(&root).unwrap();
    let stream_path = root.join("stream.json");
    let mission_id = Uuid::new_v4();
    let stream = json!({
        "schema": "genos.choanocyte-signal-stream/v1",
        "packets": [
            {"id":"signal-1","size_nm":150.0,"semantic_density":0.9,"content":"accepted","is_noise":false},
            {"id":"noise-1","size_nm":40.0,"semantic_density":0.1,"content":"noise","is_noise":true}
        ]
    });
    std::fs::write(&stream_path, stream.to_string()).unwrap();
    let output = Command::new(env!("CARGO_BIN_EXE_genos"))
        .args([
            "biological", "--tick", "--mission-id", &mission_id.to_string(),
            "--mission", "persisted choanocyte stream", "--choanocyte-stream",
            stream_path.to_str().unwrap(),
        ])
        .env("GENOS_STUDIO_ROOT", &root)
        .output().unwrap();
    assert!(output.status.success(), "{}; mission root: {}", String::from_utf8_lossy(&output.stderr), root.display());
    let response: Value = serde_json::from_slice(&output.stdout).unwrap();
    let receipt = response["receipts"].as_array().unwrap().iter()
        .find(|entry| entry["schema"] == "genos.choanocyte-stream-receipt/v2")
        .expect("Choanocyte receipt should be reported");
    assert_eq!(receipt["missionId"], mission_id.to_string());
    assert_eq!(receipt["producerId"], receipt["orchestratorId"]);
    assert!(receipt["producerId"].as_str().unwrap().parse::<Uuid>().is_ok());
    assert_eq!(receipt["cellId"], "orchestrator_choanocyte");
    assert_eq!(receipt["packetCount"], 2);
    let journal = root.join("biological-receipts").join(format!("{mission_id}.jsonl"));
    let batches: Vec<Value> = std::fs::read_to_string(journal).unwrap()
        .lines().map(|line| serde_json::from_str(line).unwrap()).collect();
    assert!(batches.iter().flat_map(|batch| batch["receipts"].as_array().unwrap()).any(|entry| {
        entry == receipt && entry["missionId"] == mission_id.to_string()
    }));
    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn biological_command_refuses_choanocyte_stream_without_persisted_tick() {
    let output = Command::new(env!("CARGO_BIN_EXE_genos"))
        .args(["biological", "--choanocyte-stream", "missing.json"])
        .output().unwrap();
    assert!(!output.status.success());
    assert!(String::from_utf8_lossy(&output.stderr).contains("--tick"));
}

#[test]
fn biological_choanocyte_replay_is_idempotent_across_processes_and_mission_scoped() {
    let root = std::env::current_dir().unwrap().join(format!(".genos-cli-choano-replay-{}", Uuid::new_v4()));
    std::fs::create_dir_all(&root).unwrap();
    let stream_path = root.join("stream.json");
    let mission_a = Uuid::new_v4();
    write_stream(&stream_path, "same-input");

    let first = run_stream_command(&root, mission_a, &stream_path);
    let replay = run_stream_command(&root, mission_a, &stream_path);
    assert_eq!(first, replay, "restart replay must return the original receipt");
    assert_eq!(mission_receipts(&root, mission_a).len(), 1);

    write_stream(&stream_path, "changed-input");
    let changed = run_stream_command(&root, mission_a, &stream_path);
    assert_ne!(changed["receiptId"], first["receiptId"]);
    assert_eq!(mission_receipts(&root, mission_a).len(), 2);

    write_stream(&stream_path, "same-input");
    let mission_b = Uuid::new_v4();
    let isolated = run_stream_command(&root, mission_b, &stream_path);
    assert_eq!(isolated["missionId"], mission_b.to_string());
    assert_ne!(isolated["idempotency_key"], first["idempotency_key"]);
    assert_eq!(mission_receipts(&root, mission_b).len(), 1);
    assert_eq!(mission_receipts(&root, mission_a).len(), 2);
    std::fs::remove_dir_all(root).unwrap();
}

fn run_stream_command(root: &Path, mission_id: Uuid, stream_path: &Path) -> Value {
    let output = Command::new(env!("CARGO_BIN_EXE_genos"))
        .args([
            "biological", "--tick", "--mission-id", &mission_id.to_string(),
            "--mission", "choanocyte replay", "--choanocyte-stream",
            stream_path.to_str().unwrap(),
        ])
        .env("GENOS_STUDIO_ROOT", root)
        .output()
        .unwrap();
    assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));
    let response: Value = serde_json::from_slice(&output.stdout).unwrap();
    response["receipts"].as_array().unwrap().iter()
        .find(|entry| entry["schema"] == "genos.choanocyte-stream-receipt/v2")
        .cloned()
        .expect("Choanocyte receipt should be reported")
}

fn write_stream(path: &Path, content: &str) {
    let stream = json!({
        "schema": "genos.choanocyte-signal-stream/v1",
        "packets": [{"id":"signal-1","size_nm":150.0,"semantic_density":0.9,"content":content,"is_noise":false}]
    });
    std::fs::write(path, stream.to_string()).unwrap();
}

fn mission_receipts(root: &Path, mission_id: Uuid) -> Vec<Value> {
    let path = root.join("biological-receipts").join(format!("{mission_id}.jsonl"));
    std::fs::read_to_string(path).unwrap().lines()
        .flat_map(|line| {
            let batch: Value = serde_json::from_str(line).unwrap();
            batch["receipts"].as_array().unwrap().clone()
        })
        .filter(|receipt| receipt["schema"] == "genos.choanocyte-stream-receipt/v2")
        .collect()
}

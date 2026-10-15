use serde_json::{Value, json};
use std::process::Command;
use uuid::Uuid;

#[test]
fn biological_command_persists_typed_stream_under_mission_and_producer_identity() {
    let root = std::env::temp_dir().join(format!("genos-cli-choano-{}", Uuid::new_v4()));
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

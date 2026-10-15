use serde_json::{Value, json};
use ed25519_dalek::{Signer, SigningKey};
use std::path::Path;
use std::process::Command;
use uuid::Uuid;

struct ProducerFixture {
    mission_id: Uuid,
    producer_id: Uuid,
    key: SigningKey,
}

#[test]
fn biological_command_persists_typed_stream_under_mission_and_producer_identity() {
    let root = std::env::current_dir().unwrap().join(format!(".genos-cli-choano-{}", Uuid::new_v4()));
    std::fs::create_dir_all(&root).unwrap();
    let stream_path = root.join("stream.json");
    let producer = ProducerFixture {
        mission_id: Uuid::new_v4(),
        producer_id: Uuid::new_v4(),
        key: SigningKey::from_bytes(&[41; 32]),
    };
    let stream = json!({
        "schema": "genos.choanocyte-signal-stream/v1",
        "producerId": producer.producer_id,
        "signatureHex": "unsigned",
        "packets": [
            {"id":"signal-1","size_nm":150.0,"semantic_density":0.9,"content":"accepted","is_noise":false},
            {"id":"noise-1","size_nm":40.0,"semantic_density":0.1,"content":"noise","is_noise":true}
        ]
    });
    let mut stream: Value = stream;
    let envelope: genos_orchestrator::choanocyte_receipt::MissionChoanocyteStream = serde_json::from_value(stream.clone()).unwrap();
    let digest = envelope.payload_digest().unwrap();
    let signing_bytes = genos_orchestrator::choanocyte_authority::signing_bytes(producer.mission_id, producer.producer_id, &digest).unwrap();
    stream["signatureHex"] = json!(hex(&producer.key.sign(&signing_bytes).to_bytes()));
    std::fs::write(&stream_path, stream.to_string()).unwrap();
    let output = Command::new(env!("CARGO_BIN_EXE_genos"))
        .args([
            "biological", "--tick", "--mission-id", &producer.mission_id.to_string(),
            "--mission", "persisted choanocyte stream", "--choanocyte-stream",
            stream_path.to_str().unwrap(), "--choanocyte-trust",
        ])
        .env("GENOS_STUDIO_ROOT", &root)
        .env("GENOS_CHOANOCYTE_TRUST_JSON", trust_json(&producer))
        .output().unwrap();
    assert!(output.status.success(), "{}; mission root: {}", String::from_utf8_lossy(&output.stderr), root.display());
    let response: Value = serde_json::from_slice(&output.stdout).unwrap();
    let receipt = response["receipts"].as_array().unwrap().iter()
        .find(|entry| entry["schema"] == "genos.choanocyte-stream-receipt/v2")
        .expect("Choanocyte receipt should be reported");
    assert_eq!(receipt["missionId"], producer.mission_id.to_string());
    assert_eq!(receipt["producerId"], producer.producer_id.to_string());
    assert_eq!(receipt["runtimeProducerId"], receipt["orchestratorId"]);
    assert!(receipt["producerTrustKeySha256"].as_str().unwrap().len() == 64);
    assert_eq!(receipt["cellId"], "orchestrator_choanocyte");
    assert_eq!(receipt["packetCount"], 2);
    let journal = root.join("biological-receipts").join(format!("{}.jsonl", producer.mission_id));
    let batches: Vec<Value> = std::fs::read_to_string(journal).unwrap()
        .lines().map(|line| serde_json::from_str(line).unwrap()).collect();
    assert!(batches.iter().flat_map(|batch| batch["receipts"].as_array().unwrap()).any(|entry| {
        entry == receipt && entry["missionId"] == producer.mission_id.to_string()
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
fn biological_command_refuses_signed_stream_without_host_bootstrap_trust() {
    let root = std::env::current_dir().unwrap().join(format!(".genos-cli-choano-untrusted-{}", Uuid::new_v4()));
    std::fs::create_dir_all(&root).unwrap();
    let stream_path = root.join("stream.json");
    let producer = ProducerFixture {
        mission_id: Uuid::new_v4(),
        producer_id: Uuid::new_v4(),
        key: SigningKey::from_bytes(&[43; 32]),
    };
    write_stream(&stream_path, &producer, "signed but untrusted");
    let output = Command::new(env!("CARGO_BIN_EXE_genos"))
        .args([
            "biological", "--tick", "--mission-id", &producer.mission_id.to_string(),
            "--mission", "untrusted choanocyte", "--choanocyte-stream",
            stream_path.to_str().unwrap(), "--choanocyte-trust",
        ])
        .env("GENOS_STUDIO_ROOT", &root)
        .env_remove("GENOS_CHOANOCYTE_TRUST_JSON")
        .output().unwrap();
    assert!(!output.status.success());
    assert!(String::from_utf8_lossy(&output.stderr).contains("host Choanocyte producer trust is not configured"));
    assert!(mission_receipts(&root, producer.mission_id).is_empty());
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn biological_choanocyte_replay_is_idempotent_across_processes_and_mission_scoped() {
    let root = std::env::current_dir().unwrap().join(format!(".genos-cli-choano-replay-{}", Uuid::new_v4()));
    std::fs::create_dir_all(&root).unwrap();
    let stream_path = root.join("stream.json");
    let producer = ProducerFixture {
        mission_id: Uuid::new_v4(),
        producer_id: Uuid::new_v4(),
        key: SigningKey::from_bytes(&[42; 32]),
    };
    write_stream(&stream_path, &producer, "same-input");

    let first = run_stream_command(&root, &stream_path, &producer);
    let replay = run_stream_command(&root, &stream_path, &producer);
    assert_eq!(first, replay, "restart replay must return the original receipt");
    assert_eq!(mission_receipts(&root, producer.mission_id).len(), 1);

    write_stream(&stream_path, &producer, "changed-input");
    let changed = run_stream_command(&root, &stream_path, &producer);
    assert_ne!(changed["receiptId"], first["receiptId"]);
    assert_eq!(mission_receipts(&root, producer.mission_id).len(), 2);

    let isolated_producer = ProducerFixture { mission_id: Uuid::new_v4(), ..producer_fixture_copy(&producer) };
    write_stream(&stream_path, &isolated_producer, "same-input");
    let isolated = run_stream_command(&root, &stream_path, &isolated_producer);
    assert_eq!(isolated["missionId"], isolated_producer.mission_id.to_string());
    assert_ne!(isolated["idempotency_key"], first["idempotency_key"]);
    assert_eq!(mission_receipts(&root, isolated_producer.mission_id).len(), 1);
    assert_eq!(mission_receipts(&root, producer.mission_id).len(), 2);
    std::fs::remove_dir_all(root).unwrap();
}

fn run_stream_command(root: &Path, stream_path: &Path, producer: &ProducerFixture) -> Value {
    let output = Command::new(env!("CARGO_BIN_EXE_genos"))
        .args([
            "biological", "--tick", "--mission-id", &producer.mission_id.to_string(),
            "--mission", "choanocyte replay", "--choanocyte-stream",
            stream_path.to_str().unwrap(), "--choanocyte-trust",
        ])
        .env("GENOS_STUDIO_ROOT", root)
        .env("GENOS_CHOANOCYTE_TRUST_JSON", trust_json(producer))
        .output()
        .unwrap();
    assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));
    let response: Value = serde_json::from_slice(&output.stdout).unwrap();
    response["receipts"].as_array().unwrap().iter()
        .find(|entry| entry["schema"] == "genos.choanocyte-stream-receipt/v2")
        .cloned()
        .expect("Choanocyte receipt should be reported")
}

fn write_stream(path: &Path, producer: &ProducerFixture, content: &str) {
    let mut stream = json!({
        "schema": "genos.choanocyte-signal-stream/v1",
        "producerId": producer.producer_id,
        "signatureHex": "pending",
        "packets": [{"id":"signal-1","size_nm":150.0,"semantic_density":0.9,"content":content,"is_noise":false}]
    });
    let envelope: genos_orchestrator::choanocyte_receipt::MissionChoanocyteStream = serde_json::from_value(stream.clone()).unwrap();
    let digest = envelope.payload_digest().unwrap();
    let bytes = genos_orchestrator::choanocyte_authority::signing_bytes(producer.mission_id, producer.producer_id, &digest).unwrap();
    stream["signatureHex"] = json!(hex(&producer.key.sign(&bytes).to_bytes()));
    std::fs::write(path, stream.to_string()).unwrap();
}

fn trust_json(producer: &ProducerFixture) -> String {
    json!({"schema":"genos.choanocyte-producer-trust/v1","producers":[{
        "producer_id":producer.producer_id,"public_key_hex":hex(&producer.key.verifying_key().to_bytes())
    }]}).to_string()
}

fn producer_fixture_copy(producer: &ProducerFixture) -> ProducerFixture {
    ProducerFixture {
        mission_id: producer.mission_id,
        producer_id: producer.producer_id,
        key: SigningKey::from_bytes(&producer.key.to_bytes()),
    }
}

fn hex(bytes: &[u8]) -> String { bytes.iter().map(|byte| format!("{byte:02x}")).collect() }

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

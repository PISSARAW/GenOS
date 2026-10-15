use ed25519_dalek::{Signer, SigningKey};
use genos_orchestrator::sensory_authority::{signing_bytes, stimulus_digest, SensoryClaims};
use genos_store::BiologicalReceiptStore;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::process::{Command, Output};
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

struct Producer {
    id: Uuid,
    key: SigningKey,
}

struct RunContext<'a> {
    workspace: &'a Path,
    mission: Uuid,
    trust_json: &'a str,
    replay_key: &'a str,
}

fn producer(id: u128, seed: u8) -> Producer {
    Producer { id: Uuid::from_u128(id), key: SigningKey::from_bytes(&[seed; 32]) }
}

fn scratch_path(name: &str) -> PathBuf {
    let nonce = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
    std::env::temp_dir().join(format!("genos-sensory-rotation-{nonce}-{name}"))
}

fn trust_json(producers: &[&Producer]) -> String {
    let entries: Vec<_> = producers.iter().map(|source| json!({
        "producer_id": source.id,
        "public_key_hex": hex(source.key.verifying_key().as_bytes()),
    })).collect();
    json!({
        "schema": "genos.synthetic-sensory-producer-trust/v1",
        "producers": entries,
    }).to_string()
}

fn signed_input(mission: Uuid, source: &Producer, tick: u64) -> PathBuf {
    let path = scratch_path("input.json");
    let signal = json!({
        "sensor": "vomeronasal",
        "signal": {
            "source_agent": "synthetic-source", "locus": "test/sensor",
            "pheromone_type": "Alarm", "concentration": 0.9,
            "half_life_secs": 60.0, "timestamp_epoch_ms": tick,
            "subliminal_payload": {}
        }
    });
    let digest = stimulus_digest(source.id, tick, &signal).unwrap();
    let signature = source.key.sign(&signing_bytes(SensoryClaims {
        mission_id: mission,
        tick,
        producer_id: source.id,
        stimulus_sha256: &digest,
    }).unwrap());
    std::fs::write(&path, json!({
        "schema": "genos.signed-synthetic-sensory-input/v1",
        "producer_id": source.id,
        "tick": tick,
        "signal": signal,
        "signature_hex": hex(&signature.to_bytes()),
    }).to_string()).unwrap();
    path
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn run_ingest(context: &RunContext<'_>, input: &Path) -> Output {
    let mission = context.mission.to_string();
    Command::new(env!("CARGO_BIN_EXE_genos"))
        .env("GENOS_STUDIO_ROOT", context.workspace)
        .env("GENOS_SENSORY_TRUST_JSON", context.trust_json)
        .args([
            "sensory-ingest", "--mission-id", mission.as_str(),
            "--replay-key", context.replay_key, "--experimental",
        ])
        .arg("--input").arg(input).output().unwrap()
}

fn run_tick(context: &RunContext<'_>) -> Output {
    let mission = context.mission.to_string();
    Command::new(env!("CARGO_BIN_EXE_genos"))
        .env("GENOS_STUDIO_ROOT", context.workspace)
        .env("GENOS_SENSORY_TRUST_JSON", context.trust_json)
        .args([
            "biological", "--tick", "--mission-id", mission.as_str(),
            "--mission", "sensory-trust-rotation",
        ])
        .output().unwrap()
}

fn receipts(workspace: &Path, mission: Uuid) -> Vec<Value> {
    BiologicalReceiptStore::open(workspace.join("biological-receipts")
        .join(format!("{mission}.jsonl"))).read_all().unwrap()
}

fn context<'a>(workspace: &'a Path, mission: Uuid, trust_json: &'a str, replay_key: &'a str) -> RunContext<'a> {
    RunContext { workspace, mission, trust_json, replay_key }
}

#[test]
fn sensory_producer_overlap_retires_a_and_keeps_b_consumable_after_restart() {
    let producer_a = producer(77, 9);
    let producer_b = producer(78, 10);
    let overlap_trust = trust_json(&[&producer_a, &producer_b]);
    let b_only_trust = trust_json(&[&producer_b]);
    let workspace = scratch_path("workspace");
    std::fs::create_dir_all(&workspace).unwrap();
    let mission_a = Uuid::new_v4();
    let mission_b = Uuid::new_v4();
    let input_a = signed_input(mission_a, &producer_a, 1);
    let input_b = signed_input(mission_b, &producer_b, 1);

    let overlap_a = context(&workspace, mission_a, &overlap_trust, "rotation-a-overlap");
    let overlap_b = context(&workspace, mission_b, &overlap_trust, "rotation-b-overlap");
    let accepted_a = run_ingest(&overlap_a, &input_a);
    assert!(accepted_a.status.success(), "A during overlap: {}", String::from_utf8_lossy(&accepted_a.stderr));
    let accepted_b = run_ingest(&overlap_b, &input_b);
    assert!(accepted_b.status.success(), "B during overlap: {}", String::from_utf8_lossy(&accepted_b.stderr));
    let overlap_receipt = serde_json::from_slice::<Value>(&accepted_b.stdout).unwrap();

    let retired_a = context(&workspace, mission_a, &b_only_trust, "rotation-a-retired");
    let rejected_a = run_ingest(&retired_a, &input_a);
    assert!(!rejected_a.status.success(), "retired A must not sign a new input");
    assert!(String::from_utf8_lossy(&rejected_a.stderr).contains("not host-trusted"), "{}", String::from_utf8_lossy(&rejected_a.stderr));
    assert_eq!(receipts(&workspace, mission_a).len(), 1, "rejected input must not persist");

    let active_b = context(&workspace, mission_b, &b_only_trust, "rotation-b-active");
    let second_b = signed_input(mission_b, &producer_b, 2);
    let accepted_new_b = run_ingest(&active_b, &second_b);
    assert!(accepted_new_b.status.success(), "B remains accepted after A retirement: {}", String::from_utf8_lossy(&accepted_new_b.stderr));
    let imported = serde_json::from_slice::<Value>(&accepted_new_b.stdout).unwrap();

    let first_tick = run_tick(&active_b);
    assert!(first_tick.status.success(), "first B tick: {}", String::from_utf8_lossy(&first_tick.stderr));
    let after_first = receipts(&workspace, mission_b);
    let paf_first = after_first.iter().find(|item| item["schema"] == "genos.instinct-paf-receipt/v1" && item["tick"] == 1).unwrap();
    assert_eq!(paf_first["sensory_source_refs"][0]["event_id"], overlap_receipt["event_id"]);

    // Each CLI invocation is a fresh process: the durable B input and tick must replay.
    let second_tick = run_tick(&active_b);
    assert!(second_tick.status.success(), "restart replay tick: {}", String::from_utf8_lossy(&second_tick.stderr));
    let after_restart = receipts(&workspace, mission_b);
    let paf_second = after_restart.iter().find(|item| item["schema"] == "genos.instinct-paf-receipt/v1" && item["tick"] == 2).unwrap();
    assert_eq!(paf_second["sensory_source_refs"][0]["event_id"], imported["event_id"]);
    assert_eq!(paf_second["sensory_source_refs"][0]["source_digest"], imported["source_digest"]);

    let final_tick = run_tick(&active_b);
    assert!(final_tick.status.success(), "post-replay tick: {}", String::from_utf8_lossy(&final_tick.stderr));
    let after_final = receipts(&workspace, mission_b);
    let paf_third = after_final.iter().find(|item| item["schema"] == "genos.instinct-paf-receipt/v1" && item["tick"] == 3).unwrap();
    assert!(paf_third["sensory_source_refs"].as_array().unwrap().is_empty(), "B receipt must be consumed once");
}

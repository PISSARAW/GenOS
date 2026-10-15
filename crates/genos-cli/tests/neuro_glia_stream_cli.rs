use genos_orchestrator::genos_store::BiologicalReceiptStore;
use genos_orchestrator::neuro_glia_authority::{
    BackendAuthorizationProof, NeuroGliaClaims, backend_signing_bytes, payload_digest, signing_bytes,
};
use ed25519_dalek::{Signer, SigningKey};
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
    event_type: &'a str,
    tick: u64,
    experimental: bool,
    producer: Uuid,
    trusted_producer: Uuid,
    signing_key: &'a SigningKey,
    signed_payload: Option<serde_json::Value>,
    signed_mission: Option<Uuid>,
    signed_tick: Option<u64>,
}

fn run_event(root: &Path, call: EventCall<'_>) -> std::process::Output {
    let payload: serde_json::Value = serde_json::from_slice(&std::fs::read(call.payload).unwrap()).unwrap();
    let payload_digest = genos_orchestrator::neuro_glia_authority::payload_digest(
        call.event_type, call.key, call.signed_payload.as_ref().unwrap_or(&payload),
    ).unwrap();
    let claims = genos_orchestrator::neuro_glia_authority::NeuroGliaClaims {
        mission_id: call.signed_mission.unwrap_or(call.mission),
        tick: call.signed_tick.unwrap_or(call.tick), producer_id: call.producer,
        payload_sha256: payload_digest,
    };
    let signature = call.signing_key.sign(&genos_orchestrator::neuro_glia_authority::signing_bytes(&claims).unwrap());
    let trust = serde_json::json!({"schema":"genos.neuro-glia-producer-trust/v1","producers":[{
        "producer_id":call.trusted_producer,"public_key_hex":hex(call.signing_key.verifying_key().as_bytes())
    }]});
    let mut args = vec!["neuro-glia-stream".to_string()];
    if call.experimental { args.push("--experimental".into()); }
    args.extend([
        "--mission-id".into(), call.mission.to_string(),
        "--event-type".into(), call.event_type.into(),
        "--payload".into(), call.payload.to_string_lossy().into_owned(),
        "--idempotency-key".into(), call.key.into(),
        "--tick".into(), call.tick.to_string(),
        "--producer-id".into(), call.producer.to_string(),
        "--signature-hex".into(), hex(&signature.to_bytes()),
    ]);
    Command::new(env!("CARGO_BIN_EXE_genos"))
        .args(args)
        .env("GENOS_STUDIO_ROOT", root)
        .env("GENOS_NEURO_GLIA_TRUST_JSON", trust.to_string())
        .output()
        .unwrap()
}

fn hex(bytes: &[u8]) -> String { bytes.iter().map(|byte| format!("{byte:02x}")).collect() }

struct BackendEventInput<'a> {
    root: &'a Path,
    payload_path: &'a Path,
    mission: Uuid,
    producer: Uuid,
    event_id: Uuid,
    key: &'a str,
    payload: serde_json::Value,
    producer_signer: &'a SigningKey,
    backend_signer: &'a SigningKey,
    tamper_scope_after_signing: bool,
}

fn run_backend_event(input: BackendEventInput<'_>) -> std::process::Output {
    let event_type = "BIOLOGICAL_EXECUTION_RECEIPT";
    let payload_sha256 = payload_digest(event_type, input.key, &input.payload).unwrap();
    let producer_claims = NeuroGliaClaims {
        mission_id: input.mission, tick: 5, producer_id: input.producer,
        payload_sha256: payload_sha256.clone(),
    };
    let producer_signature = input.producer_signer.sign(&signing_bytes(&producer_claims).unwrap());
    let mut proof = BackendAuthorizationProof {
        schema: "genos.neuro-glia-backend-authorization/v1".into(),
        authority_id: "backend-test".into(), principal_id: "member-7".into(),
        organization_id: "org-3".into(), project_id: "project-9".into(),
        mission_id: input.mission, producer_id: input.producer, event_id: input.event_id,
        event_type: event_type.into(), tick: 5, idempotency_key: input.key.into(),
        payload_sha256, signature_hex: String::new(),
    };
    proof.signature_hex = hex(&input.backend_signer.sign(&backend_signing_bytes(&proof).unwrap()).to_bytes());
    if input.tamper_scope_after_signing { proof.project_id = "attacker-project".into(); }
    std::fs::write(input.payload_path, input.payload.to_string()).unwrap();
    let proof_path = input.root.join("backend-proof.json");
    std::fs::write(&proof_path, serde_json::to_vec(&proof).unwrap()).unwrap();
    let trust = serde_json::json!({
        "schema":"genos.neuro-glia-producer-trust/v1",
        "producers":[{"producer_id":input.producer,"public_key_hex":hex(input.producer_signer.verifying_key().as_bytes())}],
        "backend_authorities":[{"authority_id":"backend-test","public_key_hex":hex(input.backend_signer.verifying_key().as_bytes())}],
    });
    Command::new(env!("CARGO_BIN_EXE_genos"))
        .args(["neuro-glia-stream", "--experimental", "--require-backend-authorization", "--mission-id", &input.mission.to_string(),
            "--event-type", event_type, "--payload", &input.payload_path.to_string_lossy(),
            "--tick", "5", "--idempotency-key", input.key, "--producer-id", &input.producer.to_string(),
            "--signature-hex", &hex(&producer_signature.to_bytes()), "--backend-proof", &proof_path.to_string_lossy()])
        .env("GENOS_STUDIO_ROOT", input.root)
        .env("GENOS_NEURO_GLIA_TRUST_JSON", trust.to_string())
        .output().unwrap()
}

#[test]
fn cli_writes_ordered_durable_events_and_reuses_exact_retry_after_restart() {
    let root = scratch_root();
    std::fs::create_dir_all(&root).unwrap();
    let mission = Uuid::new_v4();
    let producer = Uuid::new_v4();
    let signing_key = SigningKey::from_bytes(&[42; 32]);
    let first_payload = root.join("first.json");
    let second_payload = root.join("second.json");
    std::fs::write(&first_payload, json!({"completed": true, "cost": 1.0}).to_string()).unwrap();
    std::fs::write(&second_payload, json!({"completed": true, "cost": 2.0}).to_string()).unwrap();

    let first = run_event(&root, EventCall { mission, payload: &first_payload, key: "event-1", event_type: "BIOLOGICAL_EXECUTION_RECEIPT", tick: 10, experimental: true, producer, trusted_producer: producer, signing_key: &signing_key, signed_payload: None, signed_mission: None, signed_tick: None });
    assert!(first.status.success(), "first event failed: {}", String::from_utf8_lossy(&first.stderr));
    assert!(run_event(&root, EventCall { mission, payload: &second_payload, key: "event-2", event_type: "BIOLOGICAL_EXECUTION_RECEIPT", tick: 11, experimental: true, producer, trusted_producer: producer, signing_key: &signing_key, signed_payload: None, signed_mission: None, signed_tick: None }).status.success());
    let retry = run_event(&root, EventCall { mission, payload: &first_payload, key: "event-1", event_type: "BIOLOGICAL_EXECUTION_RECEIPT", tick: 10, experimental: true, producer, trusted_producer: producer, signing_key: &signing_key, signed_payload: None, signed_mission: None, signed_tick: None });
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
    assert_eq!(stream[0]["source"]["producer_id"], producer.to_string());
    assert_eq!(stream[1]["source"]["payload_sha256"].as_str().unwrap().len(), 64);
    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn cli_rejects_unknown_producer_and_modified_payload_without_journal_write() {
    let root = scratch_root();
    std::fs::create_dir_all(&root).unwrap();
    let mission = Uuid::new_v4();
    let producer = Uuid::new_v4();
    let signer = SigningKey::from_bytes(&[17; 32]);
    let payload = root.join("payload.json");
    std::fs::write(&payload, json!({"completed": true}).to_string()).unwrap();
    let unknown = run_event(&root, EventCall { mission, payload: &payload, key: "unknown", event_type: "BIOLOGICAL_EXECUTION_RECEIPT", tick: 1, experimental: true, producer, trusted_producer: Uuid::new_v4(), signing_key: &signer, signed_payload: None, signed_mission: None, signed_tick: None });
    assert!(!unknown.status.success());
    assert!(String::from_utf8_lossy(&unknown.stderr).contains("not host-trusted"));
    std::fs::write(&payload, json!({"completed": false}).to_string()).unwrap();
    let altered = run_event(&root, EventCall { mission, payload: &payload, key: "altered", event_type: "BIOLOGICAL_EXECUTION_RECEIPT", tick: 1, experimental: true, producer, trusted_producer: producer, signing_key: &signer, signed_payload: Some(json!({"completed": true})), signed_mission: None, signed_tick: None });
    assert!(!altered.status.success());
    assert!(String::from_utf8_lossy(&altered.stderr).contains("signature is invalid"));
    let wrong_tick = run_event(&root, EventCall { mission, payload: &payload, key: "wrong-tick", event_type: "BIOLOGICAL_EXECUTION_RECEIPT", tick: 2, experimental: true, producer, trusted_producer: producer, signing_key: &signer, signed_payload: None, signed_mission: None, signed_tick: Some(1) });
    assert!(!wrong_tick.status.success());
    assert!(String::from_utf8_lossy(&wrong_tick.stderr).contains("signature is invalid"));
    let wrong_mission = run_event(&root, EventCall { mission, payload: &payload, key: "wrong-mission", event_type: "BIOLOGICAL_EXECUTION_RECEIPT", tick: 1, experimental: true, producer, trusted_producer: producer, signing_key: &signer, signed_payload: None, signed_mission: Some(Uuid::new_v4()), signed_tick: None });
    assert!(!wrong_mission.status.success());
    assert!(String::from_utf8_lossy(&wrong_mission.stderr).contains("signature is invalid"));
    assert!(!root.join("biological-receipts").join(format!("{mission}.jsonl")).exists());
    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn cli_requires_opt_in_and_rejects_unsupported_events_without_writing() {
    let root = scratch_root();
    std::fs::create_dir_all(&root).unwrap();
    let mission = Uuid::new_v4();
    let payload = root.join("payload.json");
    std::fs::write(&payload, json!({"completed": true}).to_string()).unwrap();
    let producer = Uuid::new_v4();
    let signing_key = SigningKey::from_bytes(&[4; 32]);
    let missing_opt_in = run_event(&root, EventCall { mission, payload: &payload, key: "event-1", event_type: "BIOLOGICAL_EXECUTION_RECEIPT", tick: 1, experimental: false, producer, trusted_producer: producer, signing_key: &signing_key, signed_payload: None, signed_mission: None, signed_tick: None });
    assert!(!missing_opt_in.status.success());
    let unsupported = run_event(&root, EventCall { mission, payload: &payload, key: "event-2", event_type: "UNRELATED_EVENT", tick: 1, experimental: true, producer, trusted_producer: producer, signing_key: &signing_key, signed_payload: None, signed_mission: None, signed_tick: None });
    assert!(!unsupported.status.success());
    assert!(!root.join("biological-receipts").exists());
    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn backend_scope_authorization_is_verified_before_append() {
    let root = scratch_root();
    std::fs::create_dir_all(&root).unwrap();
    let mission = Uuid::new_v4();
    let producer = Uuid::new_v4();
    let event_id = Uuid::new_v4();
    let producer_signer = SigningKey::from_bytes(&[31; 32]);
    let backend_signer = SigningKey::from_bytes(&[73; 32]);
    let payload_path = root.join("payload.json");
    let args = || BackendEventInput {
        root: &root, payload_path: &payload_path, mission, producer, event_id,
        key: "backend-event-5", payload: json!({"outcome":"accepted"}),
        producer_signer: &producer_signer, backend_signer: &backend_signer,
        tamper_scope_after_signing: false,
    };
    let accepted = run_backend_event(args());
    assert!(accepted.status.success(), "valid backend authorization failed: {}", String::from_utf8_lossy(&accepted.stderr));
    let retry = run_backend_event(args());
    assert!(retry.status.success(), "exact backend-authorized retry failed: {}", String::from_utf8_lossy(&retry.stderr));
    let journal = root.join("biological-receipts").join(format!("{mission}.jsonl"));
    let before = BiologicalReceiptStore::open(&journal).read_all().unwrap();
    let event = before.iter().find(|entry| entry["schema"] == "genos.mission-neuro-glia-event/v1").unwrap();
    assert_eq!(event["source"]["backend_authorization"]["principalId"], "member-7");
    assert_eq!(event["source"]["backend_authorization"]["projectId"], "project-9");

    let invalid = run_backend_event(BackendEventInput {
        key: "altered-scope", tamper_scope_after_signing: true, ..args()
    });
    assert!(!invalid.status.success());
    assert!(String::from_utf8_lossy(&invalid.stderr).contains("backend authorization signature is invalid"));
    let after = BiologicalReceiptStore::open(&journal).read_all().unwrap();
    assert_eq!(after.iter().filter(|entry| entry["schema"] == "genos.mission-neuro-glia-event/v1").count(), 1,
        "altered principal/scope proof must fail before append");

    let _ = std::fs::remove_dir_all(root);
}

#[test]
fn backend_mode_rejects_legacy_history_before_append() {
    let root = scratch_root();
    std::fs::create_dir_all(&root).unwrap();
    let mission = Uuid::new_v4();
    let producer = Uuid::new_v4();
    let producer_signer = SigningKey::from_bytes(&[29; 32]);
    let backend_signer = SigningKey::from_bytes(&[61; 32]);
    let payload_path = root.join("payload.json");
    std::fs::write(&payload_path, json!({"outcome":"legacy"}).to_string()).unwrap();
    let legacy = run_event(&root, EventCall {
        mission, payload: &payload_path, key: "legacy-event", event_type: "BIOLOGICAL_EXECUTION_RECEIPT",
        tick: 4, experimental: true, producer, trusted_producer: producer,
        signing_key: &producer_signer, signed_payload: None, signed_mission: None, signed_tick: None,
    });
    assert!(legacy.status.success(), "local experimental stream setup failed: {}", String::from_utf8_lossy(&legacy.stderr));
    let denied = run_backend_event(BackendEventInput {
        root: &root, payload_path: &payload_path, mission, producer, event_id: Uuid::new_v4(),
        key: "backend-after-legacy", payload: json!({"outcome":"new"}),
        producer_signer: &producer_signer, backend_signer: &backend_signer,
        tamper_scope_after_signing: false,
    });
    assert!(!denied.status.success());
    assert!(String::from_utf8_lossy(&denied.stderr).contains("event without principal/scope proof"),
        "legacy history should be refused explicitly: {}", String::from_utf8_lossy(&denied.stderr));
    let journal = root.join("biological-receipts").join(format!("{mission}.jsonl"));
    let entries = BiologicalReceiptStore::open(&journal).read_all().unwrap();
    assert_eq!(entries.iter().filter(|entry| entry["schema"] == "genos.mission-neuro-glia-event/v1").count(), 1,
        "backend mode must not append after an unscoped legacy event");
    let _ = std::fs::remove_dir_all(root);
}

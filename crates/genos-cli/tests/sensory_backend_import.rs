use ed25519_dalek::{Signer, SigningKey};
use genos_orchestrator::animal_sensory_runtime::SyntheticAnimalSignal;
use genos_orchestrator::sensory_authority::{signing_bytes as producer_signing_bytes, stimulus_digest, SensoryClaims};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::fs;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};
use tempfile::TempDir;
use uuid::Uuid;

#[test]
fn backend_signed_tenant_receipt_imports_and_is_consumed_by_paf() {
    let root = TempDir::new_in(std::env::current_dir().unwrap()).unwrap();
    let organization = Uuid::new_v4();
    let project = Uuid::new_v4();
    let mission = Uuid::new_v4();
    let producer = Uuid::new_v4();
    let principal = "api-user-42";
    let producer_key = SigningKey::from_bytes(&[13; 32]);
    let backend_key = SigningKey::from_bytes(&[21; 32]);
    let signal_json = r#"{"sensor":"passive_electroreception","ambient_uv":[0.2,0.5,0.9]}"#;
    let signal: SyntheticAnimalSignal = serde_json::from_str(signal_json).unwrap();
    let stimulus = stimulus_digest(producer, 1, &signal).unwrap();
    let producer_signature = producer_key.sign(&producer_signing_bytes(SensoryClaims {
        mission_id: mission, tick: 1, producer_id: producer, stimulus_sha256: &stimulus,
    }).unwrap());
    let producer_signature_hex = hex(&producer_signature.to_bytes());
    let producer_fingerprint = format!("{:x}", Sha256::digest(producer_key.verifying_key().as_bytes()));
    let backend_verifying_key = backend_key.verifying_key();
    let public = backend_verifying_key.as_bytes();
    let key_id = hex(&Sha256::digest(public)[..16]);
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis() as u64;
    let claims = json!({
        "schema":"genos.authenticated-sensory-backend-authority/v1", "key_id":key_id,
        "organization_id":organization, "project_id":project, "principal_id":principal,
        "mission_id":mission, "producer_id":producer, "tick":1,
        "stimulus_sha256":stimulus, "producer_signature_hex":producer_signature_hex,
        "producer_trust_key_sha256":producer_fingerprint, "signal_json":signal_json,
        "payload_hash":"a".repeat(64), "issued_at_unix_ms":now,
        "expires_at_unix_ms":now + 20_000, "nonce":"test-nonce-1"
    });
    let backend_signature = backend_key.sign(&backend_signing_bytes(&claims));
    let tenant_dir = root.path().join("tenants").join(organization.to_string()).join(project.to_string()).join("sensory-authority");
    fs::create_dir_all(&tenant_dir).unwrap();
    let authority_file = tenant_dir.join("receipt.json");
    fs::write(&authority_file, json!({"claims":claims,"signature":hex(&backend_signature.to_bytes())}).to_string()).unwrap();
    let relative_authority = authority_file.strip_prefix(root.path()).unwrap();
    let sensory_trust = json!({"schema":"genos.synthetic-sensory-producer-trust/v1","producers":[{
        "producer_id":producer, "public_key_hex":hex(producer_key.verifying_key().as_bytes())
    }]}).to_string();
    let backend_trust = json!({key_id:hex(public)}).to_string();

    let trust = (sensory_trust.as_str(), backend_trust.as_str());
    let imported = cli(root.path(), [&"sensory-backend-import"[..], "--authority-file", relative_authority.to_str().unwrap()], trust);
    assert!(imported.status.success(), "{}", String::from_utf8_lossy(&imported.stderr));
    let imported_json: Value = serde_json::from_slice(&imported.stdout).unwrap();
    assert_eq!(imported_json["execution_mode"], "backend-authorized");
    assert_eq!(imported_json["authority_scope"]["organization_id"], organization.to_string());
    assert_eq!(imported_json["authority_scope"]["principal_id"], principal);

    let mission_text = mission.to_string();
    let tick = cli(root.path(), [&"biological"[..], "--tick", "--mission-id", mission_text.as_str(), "--mission", "backend sensory proof"],
        trust);
    assert!(tick.status.success(), "{}", String::from_utf8_lossy(&tick.stderr));
    let tick_json: Value = serde_json::from_slice(&tick.stdout).unwrap();
    let paf = tick_json["receipts"].as_array().unwrap().iter()
        .find(|receipt| receipt["schema"] == "genos.instinct-paf-receipt/v1").unwrap();
    let imported_digest = imported_json["receipt"]["source_digest"].as_str().unwrap();
    assert!(paf["sensory_source_refs"].as_array().unwrap().iter()
        .any(|source| source["source_digest"] == imported_digest));
}

fn cli<'a>(root: &std::path::Path, args: impl IntoIterator<Item = &'a str>, trust: (&str, &str)) -> std::process::Output {
    Command::new(env!("CARGO_BIN_EXE_genos"))
        .args(args).env("GENOS_STUDIO_ROOT", root)
        .env("GENOS_SENSORY_TRUST_JSON", trust.0)
        .env("GENOS_CLI_AUTHORITY_TRUST_JSON", trust.1)
        .output().unwrap()
}

fn backend_signing_bytes(claims: &Value) -> Vec<u8> {
    let mut values = vec!["schema", "key_id", "organization_id", "project_id", "principal_id", "mission_id", "producer_id"]
        .into_iter().map(|key| hex(claims[key].as_str().unwrap().as_bytes())).collect::<Vec<_>>();
    values.push(claims["tick"].as_u64().unwrap().to_string());
    for key in ["stimulus_sha256", "producer_signature_hex", "producer_trust_key_sha256", "signal_json", "payload_hash"] {
        values.push(hex(claims[key].as_str().unwrap().as_bytes()));
    }
    values.push(claims["issued_at_unix_ms"].as_u64().unwrap().to_string());
    values.push(claims["expires_at_unix_ms"].as_u64().unwrap().to_string());
    values.push(hex(claims["nonce"].as_str().unwrap().as_bytes()));
    format!("genos-sensory-backend-authority-v1\n{}", values.join("\n")).into_bytes()
}

fn hex(bytes: &[u8]) -> String { bytes.iter().map(|byte| format!("{byte:02x}")).collect() }

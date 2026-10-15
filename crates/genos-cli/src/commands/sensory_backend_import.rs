use crate::args::SensoryBackendImportCmd;
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use genos_orchestrator::animal_sensory_runtime::SyntheticAnimalSignal;
use genos_orchestrator::sensory_authority::{stimulus_digest, SensoryProducerAuthority, SensoryProof};
use genos_orchestrator::sensory_receipt_runtime::persist_synthetic_sensory_receipt;
use genos_store::BiologicalReceiptStore;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

const MAX_ENVELOPE_BYTES: usize = 65_536;
const MAX_TTL_MS: u64 = 30_000;

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Envelope { claims: Claims, signature: String }

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Claims {
    schema: String,
    key_id: String,
    organization_id: String,
    project_id: String,
    principal_id: String,
    mission_id: String,
    producer_id: String,
    tick: u64,
    stimulus_sha256: String,
    producer_signature_hex: String,
    producer_trust_key_sha256: String,
    signal_json: String,
    payload_hash: String,
    issued_at_unix_ms: u64,
    expires_at_unix_ms: u64,
    nonce: String,
}

struct VerifiedClaims {
    claims: Claims,
    signal: SyntheticAnimalSignal,
    signature: String,
}

pub fn execute(command: SensoryBackendImportCmd) -> Result<(), String> {
    let root = std::env::var_os("GENOS_STUDIO_ROOT").map(PathBuf::from)
        .unwrap_or(std::env::current_dir().map_err(|error| error.to_string())?);
    let envelope = read_envelope(&root, &command.authority_file)?;
    let verified = verify(envelope)?;
    let source = build_source(verified)?;
    let mission_id = parse_uuid(&source["mission_id"], "mission_id")?;
    let journal = root.join("biological-receipts").join(format!("{mission_id}.jsonl"));
    fs::create_dir_all(journal.parent().ok_or("journal parent is unavailable")?)
        .map_err(|error| format!("cannot create receipt journal: {error}"))?;
    let receipt = persist_synthetic_sensory_receipt(&BiologicalReceiptStore::open(journal), mission_id, &source)?;
    println!("{}", json!({ "success": true, "operation": "sensory_backend_import",
        "execution_mode": "backend-authorized", "mission_authority": "authenticated_backend_capability",
        "authority_scope": { "organization_id": source["authority_scope"]["organization_id"],
            "project_id": source["authority_scope"]["project_id"],
            "principal_id": source["authority_scope"]["principal_id"], "mission_id": mission_id },
        "receipt": receipt }));
    Ok(())
}

fn read_envelope(root: &Path, reference: &Path) -> Result<Envelope, String> {
    if reference.is_absolute() { return Err("sensory authority path must be relative to the workspace".into()); }
    let (canonical_root, canonical) = resolve_authority_path(root, reference)?;
    let bytes = fs::read(&canonical).map_err(|error| error.to_string())?;
    if bytes.len() > MAX_ENVELOPE_BYTES { return Err("sensory authority exceeds the size limit".into()); }
    let envelope: Envelope = serde_json::from_slice(&bytes).map_err(|error| format!("invalid sensory authority: {error}"))?;
    validate_tenant_path(&canonical_root, &canonical, &envelope.claims)?;
    Ok(envelope)
}

fn resolve_authority_path(root: &Path, reference: &Path) -> Result<(PathBuf, PathBuf), String> {
    let root = root.canonicalize().map_err(|error| format!("cannot resolve workspace: {error}"))?;
    let candidate = root.join(reference);
    let metadata = fs::symlink_metadata(&candidate).map_err(|error| format!("cannot inspect sensory authority: {error}"))?;
    if metadata.file_type().is_symlink() || !metadata.is_file() { return Err("sensory authority must be a regular file".into()); }
    let canonical = candidate.canonicalize().map_err(|error| error.to_string())?;
    if !canonical.starts_with(&root) { return Err("sensory authority path escaped the workspace".into()); }
    Ok((root, canonical))
}

fn validate_tenant_path(root: &Path, canonical: &Path, claims: &Claims) -> Result<(), String> {
    let expected = root.join("tenants").join(&claims.organization_id).join(&claims.project_id)
        .join("sensory-authority").join(canonical.file_name().ok_or("authority file name is missing")?);
    if canonical == expected { Ok(()) } else { Err("sensory authority is not stored under its signed tenant scope".into()) }
}

fn verify(envelope: Envelope) -> Result<VerifiedClaims, String> {
    let claims = envelope.claims;
    verify_backend_signer(&claims, &envelope.signature)?;
    validate_window(&claims)?;
    let signal: SyntheticAnimalSignal = serde_json::from_str(&claims.signal_json)
        .map_err(|error| format!("typed sensory signal is invalid: {error}"))?;
    signal.validate()?;
    verify_producer(&claims, &signal)?;
    Ok(VerifiedClaims { claims, signal, signature: envelope.signature })
}

fn verify_backend_signer(claims: &Claims, encoded_signature: &str) -> Result<(), String> {
    validate_claim_fields(claims)?;
    let key = pinned_key(&claims.key_id)?;
    let signature = decode_hex::<64>(encoded_signature)?;
    key.verify_strict(&signing_bytes(claims), &Signature::from_bytes(&signature))
        .map_err(|_| "sensory backend authority signature verification failed".to_string())
}

fn verify_producer(claims: &Claims, signal: &SyntheticAnimalSignal) -> Result<(), String> {
    let producer_id = parse_uuid_str(&claims.producer_id, "producer_id")?;
    let mission_id = parse_uuid_str(&claims.mission_id, "mission_id")?;
    let digest = stimulus_digest(producer_id, claims.tick, signal)?;
    if digest != claims.stimulus_sha256 { return Err("signed sensory stimulus digest does not match typed signal".into()); }
    let trust = sensory_trust()?;
    let key_digest = trust.verify(SensoryProof { mission_id, tick: claims.tick, producer_id,
        stimulus_sha256: &digest, signature_hex: &claims.producer_signature_hex })?;
    if key_digest != claims.producer_trust_key_sha256 { return Err("sensory producer key fingerprint mismatch".into()); }
    Ok(())
}

fn validate_claim_fields(claims: &Claims) -> Result<(), String> {
    if claims.schema != "genos.authenticated-sensory-backend-authority/v1" || !valid_claim_identity(claims)
        || !valid_claim_digests(claims) {
        return Err("sensory backend authority claims are invalid".into());
    }
    parse_uuid_str(&claims.organization_id, "organization_id")?;
    parse_uuid_str(&claims.project_id, "project_id")?;
    parse_uuid_str(&claims.mission_id, "mission_id")?;
    parse_uuid_str(&claims.producer_id, "producer_id")?;
    Ok(())
}

fn valid_claim_identity(claims: &Claims) -> bool {
    claims.tick > 0 && !claims.principal_id.trim().is_empty() && claims.principal_id.len() <= 256
        && !claims.nonce.is_empty() && claims.nonce.len() <= 128
}

fn valid_claim_digests(claims: &Claims) -> bool {
    is_hex(&claims.stimulus_sha256, 64) && is_hex(&claims.producer_signature_hex, 128)
        && is_hex(&claims.producer_trust_key_sha256, 64) && is_hex(&claims.payload_hash, 64)
}

fn validate_window(claims: &Claims) -> Result<(), String> {
    let now = SystemTime::now().duration_since(UNIX_EPOCH).map_err(|error| error.to_string())?.as_millis() as u64;
    if claims.issued_at_unix_ms > now.saturating_add(5_000) || claims.expires_at_unix_ms <= now
        || claims.expires_at_unix_ms <= claims.issued_at_unix_ms
        || claims.expires_at_unix_ms - claims.issued_at_unix_ms > MAX_TTL_MS {
        return Err("sensory backend authority is expired or has an invalid validity window".into());
    }
    Ok(())
}

fn sensory_trust() -> Result<SensoryProducerAuthority, String> {
    let value = std::env::var("GENOS_SENSORY_TRUST_JSON").map_err(|_| "sensory producer trust is unavailable".to_string())?;
    SensoryProducerAuthority::from_bootstrap_json(&value)
}

fn pinned_key(key_id: &str) -> Result<VerifyingKey, String> {
    let trust = std::env::var("GENOS_CLI_AUTHORITY_TRUST_JSON").map_err(|_| "backend sensory authority trust is unavailable".to_string())?;
    let keys: HashMap<String, String> = serde_json::from_str(&trust).map_err(|error| error.to_string())?;
    let bytes = decode_hex::<32>(keys.get(key_id).ok_or("sensory backend signer is not trusted")?)?;
    let fingerprint = Sha256::digest(bytes);
    let expected = fingerprint[..16].iter().map(|byte| format!("{byte:02x}")).collect::<String>();
    if expected != key_id { return Err("sensory backend authority key ID mismatch".into()); }
    VerifyingKey::from_bytes(&bytes).map_err(|error| error.to_string())
}

fn build_source(verified: VerifiedClaims) -> Result<Value, String> {
    let claims = verified.claims;
    let authority_signature = verified.signature;
    let mission_id = parse_uuid_str(&claims.mission_id, "mission_id")?;
    let producer_id = parse_uuid_str(&claims.producer_id, "producer_id")?;
    let mut ecosystem = genos_orchestrator::GenosEcosystem::new("backend-authenticated-synthetic-sensory");
    ecosystem.set_mission_id(mission_id);
    let mut source = serde_json::to_value(ecosystem.ingest_synthetic_animal_signal(verified.signal)?)
        .map_err(|error| error.to_string())?;
    source["mission_id"] = json!(mission_id);
    source["event_id"] = json!(format!("backend:{}:{}", claims.producer_id, claims.tick));
    source["execution_mode"] = json!("backend-authorized");
    source["mission_authority"] = json!("authenticated_backend_capability");
    source["producer_id"] = json!(producer_id);
    source["producer_signature_hex"] = json!(claims.producer_signature_hex);
    source["source_tick"] = json!(claims.tick);
    source["stimulus_sha256"] = json!(claims.stimulus_sha256);
    source["producer_trust_key_sha256"] = json!(claims.producer_trust_key_sha256);
    source["source_authentication"] = json!("host_pinned_ed25519");
    source["authority_scope"] = json!({ "organization_id": claims.organization_id.clone(),
        "project_id": claims.project_id.clone(), "principal_id": claims.principal_id.clone(),
        "mission_id": claims.mission_id.clone(), "payload_hash": claims.payload_hash.clone(),
        "key_id": claims.key_id.clone(), "issued_at_unix_ms": claims.issued_at_unix_ms,
        "expires_at_unix_ms": claims.expires_at_unix_ms, "nonce": claims.nonce.clone(),
        "signature": "verified_backend_signature" });
    source["backend_authority"] = json!({ "claims": claims, "signature": authority_signature });
    Ok(source)
}

fn signing_bytes(claims: &Claims) -> Vec<u8> {
    let values = [
        hex(claims.schema.as_bytes()), hex(claims.key_id.as_bytes()), hex(claims.organization_id.as_bytes()),
        hex(claims.project_id.as_bytes()), hex(claims.principal_id.as_bytes()), hex(claims.mission_id.as_bytes()),
        hex(claims.producer_id.as_bytes()), claims.tick.to_string(), hex(claims.stimulus_sha256.as_bytes()),
        hex(claims.producer_signature_hex.as_bytes()), hex(claims.producer_trust_key_sha256.as_bytes()),
        hex(claims.signal_json.as_bytes()), hex(claims.payload_hash.as_bytes()), claims.issued_at_unix_ms.to_string(),
        claims.expires_at_unix_ms.to_string(), hex(claims.nonce.as_bytes()),
    ];
    format!("genos-sensory-backend-authority-v1\n{}", values.join("\n")).into_bytes()
}

fn parse_uuid(value: &Value, field: &str) -> Result<Uuid, String> {
    value.as_str().ok_or_else(|| format!("{field} is missing"))?.parse().map_err(|_| format!("{field} is invalid"))
}
fn parse_uuid_str(value: &str, field: &str) -> Result<Uuid, String> { value.parse().map_err(|_| format!("{field} is invalid")) }
fn is_hex(value: &str, length: usize) -> bool { value.len() == length && value.bytes().all(|byte| byte.is_ascii_hexdigit()) }
fn decode_hex<const N: usize>(value: &str) -> Result<[u8; N], String> {
    if value.len() != N * 2 { return Err("invalid hexadecimal authority data".into()); }
    let mut bytes = [0; N];
    for (index, slot) in bytes.iter_mut().enumerate() {
        *slot = u8::from_str_radix(&value[index * 2..index * 2 + 2], 16).map_err(|_| "invalid hexadecimal authority data")?;
    }
    Ok(bytes)
}
fn hex(bytes: &[u8]) -> String { bytes.iter().map(|byte| format!("{byte:02x}")).collect() }

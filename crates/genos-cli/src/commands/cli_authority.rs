use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

const MAX_AUTHORITY_TTL_MS: u64 = 30_000;

#[derive(Deserialize)]
struct Envelope {
    claims: Claims,
    signature: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Claims {
    schema: String,
    key_id: String,
    organization_id: String,
    project_id: String,
    mission_id: String,
    rust_mission_id: String,
    cell_id: String,
    operation: String,
    detail: String,
    value: String,
    tick: u64,
    idempotency_key: String,
    issued_at_unix_ms: u64,
    expires_at_unix_ms: u64,
    nonce: String,
}

pub(crate) struct Expectation<'a> {
    pub authority_file: &'a Path,
    pub mission_id: Uuid,
    pub cell_id: Uuid,
    pub operation: &'a str,
    pub detail: &'a str,
    pub value: f64,
    pub tick: u64,
    pub idempotency_key: &'a str,
}

pub(crate) struct VerifiedAuthority {
    pub organization_id: String,
    pub project_id: String,
    pub mission_id: String,
}

pub(crate) fn verify(root: &Path, expected: Expectation<'_>) -> Result<VerifiedAuthority, String> {
    let envelope = read_envelope(root, expected.authority_file)?;
    let claims = envelope.claims;
    validate_scope(&claims, &expected)?;
    validate_time(&claims)?;
    let key = pinned_key(&claims.key_id)?;
    let signature = decode_hex::<64>(&envelope.signature)?;
    key.verify_strict(&signing_bytes(&claims), &Signature::from_bytes(&signature))
        .map_err(|_| "CLI authority signature verification failed".to_string())?;
    Ok(VerifiedAuthority { organization_id: claims.organization_id,
        project_id: claims.project_id, mission_id: claims.mission_id })
}

fn read_envelope(root: &Path, reference: &Path) -> Result<Envelope, String> {
    let (root, canonical) = resolve_authority_path(root, reference)?;
    let bytes = fs::read(&canonical).map_err(|error| format!("cannot read CLI authority: {error}"))?;
    if bytes.len() > 8_192 { return Err("CLI authority envelope exceeds the size limit".into()); }
    let envelope: Envelope = serde_json::from_slice(&bytes)
        .map_err(|error| format!("invalid CLI authority envelope: {error}"))?;
    validate_authority_path(&root, &canonical, &envelope.claims)?;
    Ok(envelope)
}

fn resolve_authority_path(root: &Path, reference: &Path) -> Result<(PathBuf, PathBuf), String> {
    if reference.is_absolute() { return Err("CLI authority file must be relative to the workspace".into()); }
    let root = root.canonicalize().map_err(|error| format!("cannot resolve workspace: {error}"))?;
    let candidate = root.join(reference);
    let metadata = fs::symlink_metadata(&candidate).map_err(|error| format!("cannot inspect CLI authority: {error}"))?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err("CLI authority must be a regular file inside the workspace".into());
    }
    let canonical = candidate.canonicalize().map_err(|error| format!("cannot resolve CLI authority: {error}"))?;
    if !canonical.starts_with(&root) { return Err("CLI authority path escaped the workspace".into()); }
    Ok((root, canonical))
}

fn validate_authority_path(root: &Path, canonical: &Path, claims: &Claims) -> Result<(), String> {
    parse_uuid(&claims.organization_id, "organization_id")?;
    parse_uuid(&claims.project_id, "project_id")?;
    let name = canonical.file_name().ok_or("CLI authority file name is missing")?;
    let expected = root.join("tenants").join(&claims.organization_id)
        .join(&claims.project_id).join("cli-authority").join(name);
    if canonical == expected { Ok(()) }
    else { Err("CLI authority file is not stored in its signed tenant/project scope".into()) }
}

fn validate_scope(claims: &Claims, expected: &Expectation<'_>) -> Result<(), String> {
    if claims.schema != "genos.cli-authority/v1" { return Err("unsupported CLI authority schema".into()); }
    parse_uuid(&claims.organization_id, "organization_id")?;
    parse_uuid(&claims.project_id, "project_id")?;
    parse_uuid(&claims.mission_id, "mission_id")?;
    if !binding_matches(claims, expected) || !valid_claim_fields(claims) {
        return Err("CLI authority scope does not match the requested operation".into());
    }
    Ok(())
}

fn binding_matches(claims: &Claims, expected: &Expectation<'_>) -> bool {
    claims.rust_mission_id == expected.mission_id.to_string()
        && claims.cell_id == expected.cell_id.to_string()
        && claims.operation == expected.operation
        && claims.detail == expected.detail
        && claims.tick == expected.tick
        && claims.idempotency_key == expected.idempotency_key
        && claims.value.parse::<f64>().ok() == Some(expected.value)
}

fn valid_claim_fields(claims: &Claims) -> bool {
    !claims.idempotency_key.is_empty() && claims.idempotency_key.len() <= 256 && !claims.nonce.is_empty()
}

fn validate_time(claims: &Claims) -> Result<(), String> {
    let now = SystemTime::now().duration_since(UNIX_EPOCH)
        .map_err(|error| format!("system clock is invalid: {error}"))?.as_millis() as u64;
    if claims.issued_at_unix_ms > now.saturating_add(5_000)
        || claims.expires_at_unix_ms <= now
        || claims.expires_at_unix_ms <= claims.issued_at_unix_ms
        || claims.expires_at_unix_ms - claims.issued_at_unix_ms > MAX_AUTHORITY_TTL_MS {
        return Err("CLI authority is expired or has an invalid validity window".into());
    }
    Ok(())
}

fn pinned_key(key_id: &str) -> Result<VerifyingKey, String> {
    let trust = std::env::var("GENOS_CLI_AUTHORITY_TRUST_JSON")
        .map_err(|_| "CLI authority trust configuration is unavailable".to_string())?;
    let keys: HashMap<String, String> = serde_json::from_str(&trust)
        .map_err(|error| format!("invalid CLI authority trust configuration: {error}"))?;
    let public_bytes = decode_hex::<32>(keys.get(key_id).ok_or("CLI authority signer is not trusted")?)?;
    let fingerprint = Sha256::digest(public_bytes);
    let expected_id = fingerprint[..16].iter().map(|byte| format!("{byte:02x}")).collect::<String>();
    if expected_id != key_id { return Err("CLI authority key ID does not match its public key".into()); }
    VerifyingKey::from_bytes(&public_bytes).map_err(|error| format!("invalid CLI authority public key: {error}"))
}

fn signing_bytes(claims: &Claims) -> Vec<u8> {
    let mut values = vec![
        hex(claims.schema.as_bytes()), hex(claims.key_id.as_bytes()),
        hex(claims.organization_id.as_bytes()), hex(claims.project_id.as_bytes()),
        hex(claims.mission_id.as_bytes()), hex(claims.rust_mission_id.as_bytes()),
        hex(claims.cell_id.as_bytes()), hex(claims.operation.as_bytes()), hex(claims.detail.as_bytes()),
        hex(claims.value.as_bytes()),
        hex(claims.idempotency_key.as_bytes()), claims.tick.to_string(),
        claims.issued_at_unix_ms.to_string(), claims.expires_at_unix_ms.to_string(),
        hex(claims.nonce.as_bytes()),
    ];
    let mut output = b"genos-cli-authority-v1\n".to_vec();
    output.extend(values.drain(..).collect::<Vec<_>>().join("\n").as_bytes());
    output
}

fn parse_uuid(value: &str, name: &str) -> Result<Uuid, String> {
    Uuid::parse_str(value).map_err(|error| format!("CLI authority {name} must be a UUID: {error}"))
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn decode_hex<const N: usize>(value: &str) -> Result<[u8; N], String> {
    if !value.is_ascii() || value.len() != N * 2 {
        return Err("CLI authority key or signature has an invalid length".into());
    }
    let mut output = [0u8; N];
    for (index, byte) in output.iter_mut().enumerate() {
        *byte = u8::from_str_radix(&value[index * 2..index * 2 + 2], 16)
            .map_err(|_| "CLI authority key or signature is not hexadecimal".to_string())?;
    }
    Ok(output)
}

pub(crate) fn workspace_root() -> Result<PathBuf, String> {
    std::env::var_os("GENOS_STUDIO_ROOT").map(PathBuf::from).map(Ok)
        .unwrap_or_else(std::env::current_dir)
        .map_err(|error| format!("cannot resolve workspace root: {error}"))
}

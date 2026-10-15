use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BackendAttestationStatus {
    Verified,
    Unprovenanced,
    SignerNotTrusted,
}

pub fn verify_backend_attestation(value: &Value) -> Result<(), String> {
    match verify_backend_attestation_status(value)? {
        BackendAttestationStatus::SignerNotTrusted => {
            let key_id = value.pointer("/attestation/key_id").and_then(Value::as_str).unwrap_or("unknown");
            Err(format!("Unknown backend fossil signer: {key_id}"))
        }
        BackendAttestationStatus::Verified | BackendAttestationStatus::Unprovenanced => Ok(()),
    }
}

pub fn verify_backend_attestation_status(value: &Value) -> Result<BackendAttestationStatus, String> {
    let source_event = value.get("source_event_id").and_then(Value::as_str);
    if source_event.is_none() {
        verify_legacy_source(value)?;
        return Ok(BackendAttestationStatus::Unprovenanced);
    }
    let attestation = value.get("attestation").ok_or("Backend fossil attestation is missing")?;
    verify_signed_record(value, attestation)
}

fn verify_legacy_source(value: &Value) -> Result<(), String> {
    if value.get("source_event_hash").and_then(Value::as_str).is_some() {
        return Err("Incomplete fossil source-event provenance".into());
    }
    Ok(())
}

fn verify_signed_record(value: &Value, attestation: &Value) -> Result<BackendAttestationStatus, String> {
    if attestation.get("version").and_then(Value::as_u64) != Some(1)
        || attestation.get("algorithm").and_then(Value::as_str) != Some("ed25519")
    {
        return Err("Unsupported backend fossil attestation".into());
    }
    let key_id = attestation.get("key_id").and_then(Value::as_str)
        .ok_or("Backend fossil attestation has no key id")?;
    let signature = attestation_signature(attestation)?;
    let Some(public_key) = trusted_public_key(key_id)? else {
        return Ok(BackendAttestationStatus::SignerNotTrusted);
    };
    public_key.verify(&attestation_material(value, attestation)?, &signature)
        .map_err(|_| "Backend fossil attestation signature is invalid or artifact scope was altered".to_string())?;
    Ok(BackendAttestationStatus::Verified)
}

fn trusted_public_key(key_id: &str) -> Result<Option<VerifyingKey>, String> {
    let configured = std::env::var("GENOS_FOSSIL_TRUSTED_PUBLIC_KEYS")
        .map_err(|_| "Operator fossil trust keys are not configured".to_string())?;
    let keys: Value = serde_json::from_str(&configured)
        .map_err(|_| "Operator fossil trust key configuration is invalid".to_string())?;
    let Some(encoded) = keys.get(key_id).and_then(Value::as_str) else {
        return Ok(None);
    };
    let bytes = decode_hex(encoded)?;
    let raw: [u8; 32] = bytes.try_into()
        .map_err(|_| "Trusted fossil public key must contain 32 bytes".to_string())?;
    let public_key = VerifyingKey::from_bytes(&raw)
        .map_err(|_| "Trusted fossil public key is invalid".to_string())?;
    if public_key_id(&public_key) != key_id {
        return Err("Configured fossil key id does not match its public key fingerprint".into());
    }
    Ok(Some(public_key))
}

fn public_key_id(public_key: &VerifyingKey) -> String {
    let mut encoded = Vec::with_capacity(44);
    encoded.extend_from_slice(&[0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00]);
    encoded.extend_from_slice(&public_key.to_bytes());
    Sha256::digest(encoded)[..16].iter().map(|byte| format!("{byte:02x}")).collect()
}

fn attestation_signature(attestation: &Value) -> Result<Signature, String> {
    let encoded = attestation.get("signature").and_then(Value::as_str)
        .ok_or("Backend fossil attestation has no signature")?;
    let bytes = decode_hex(encoded)?;
    Signature::from_slice(&bytes).map_err(|_| "Backend fossil signature has invalid length".into())
}

fn attestation_material(value: &Value, attestation: &Value) -> Result<Vec<u8>, String> {
    let material = json!({
        "version": 1,
        "algorithm": "ed25519",
        "key_id": required_string(attestation, "key_id")?,
        "fossil_id": required_string(value, "fossil_id")?,
        "source_event_id": required_string(value, "source_event_id")?,
        "source_event_hash": required_string(value, "source_event_hash")?,
        "extinct_lineage_id": required_string(value, "extinct_lineage_id")?,
        "organization_id": optional_scope(value, "organization_id")?,
        "project_id": optional_scope(value, "project_id")?,
        "payload_hash": required_string(value, "payload_hash")?
    });
    serde_json::to_vec(&material).map_err(|error| format!("Fossil attestation encoding failed: {error}"))
}

fn required_string<'a>(value: &'a Value, field: &str) -> Result<&'a str, String> {
    value.get(field).and_then(Value::as_str)
        .ok_or_else(|| format!("Fossil attestation field {field} is missing"))
}

fn optional_scope(value: &Value, field: &str) -> Result<Value, String> {
    match value.get(field) {
        None | Some(Value::Null) => Ok(Value::Null),
        Some(Value::String(scope)) => Ok(json!(scope)),
        Some(_) => Err(format!("Fossil attestation scope field {field} is invalid")),
    }
}

fn decode_hex(encoded: &str) -> Result<Vec<u8>, String> {
    if encoded.len() % 2 != 0 { return Err("Hexadecimal value has invalid length".into()); }
    encoded.as_bytes().chunks_exact(2).map(|pair| {
        let digit = |byte: u8| (byte as char).to_digit(16).map(|value| value as u8);
        let high = digit(pair[0]).ok_or("Hexadecimal value is invalid")?;
        let low = digit(pair[1]).ok_or("Hexadecimal value is invalid")?;
        Ok((high << 4) | low)
    }).collect()
}

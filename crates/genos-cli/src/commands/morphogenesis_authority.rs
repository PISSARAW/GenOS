use ed25519_dalek::{Signature, VerifyingKey};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

const SCHEMA: &str = "genos.morphogenesis-transition-authority/v1";
const MAX_TTL_MS: u64 = 30_000;

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Envelope {
    claims: Claims,
    signature: String,
}
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct Claims {
    schema: String,
    key_id: String,
    principal_id: String,
    organization_id: String,
    project_id: String,
    mission_id: String,
    plan_sha256: String,
    snapshot_id: String,
    snapshot_sha256: String,
    risk_millis: u16,
    degraded_mode: bool,
    issued_at_unix_ms: u64,
    expires_at_unix_ms: u64,
    nonce: String,
}

pub(crate) struct Expected<'a> {
    pub mission_id: &'a str,
    pub plan_sha256: &'a str,
    pub snapshot_id: &'a str,
    pub snapshot_sha256: &'a str,
    pub risk_millis: u16,
    pub degraded_mode: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Verified {
    pub key_id: String,
    pub principal_id: String,
    pub organization_id: String,
    pub project_id: String,
    pub mission_id: String,
    pub snapshot_id: String,
    pub snapshot_sha256: String,
    pub plan_sha256: String,
    pub expires_at_unix_ms: u64,
}

pub(crate) fn verify(envelope: Envelope, expected: Expected<'_>) -> Result<Verified, String> {
    let key = pinned_key(&envelope.claims.key_id)?;
    verify_with_key(envelope, expected, key)
}

fn verify_with_key(
    envelope: Envelope,
    expected: Expected<'_>,
    key: VerifyingKey,
) -> Result<Verified, String> {
    let claims = envelope.claims;
    validate(&claims, &expected)?;
    let signature = decode_hex::<64>(&envelope.signature)?;
    key.verify_strict(&signing_bytes(&claims), &Signature::from_bytes(&signature))
        .map_err(|_| "morphogenesis authority signature verification failed".to_string())?;
    Ok(Verified {
        key_id: claims.key_id,
        principal_id: claims.principal_id,
        organization_id: claims.organization_id,
        project_id: claims.project_id,
        mission_id: claims.mission_id,
        snapshot_id: claims.snapshot_id,
        snapshot_sha256: claims.snapshot_sha256,
        plan_sha256: claims.plan_sha256,
        expires_at_unix_ms: claims.expires_at_unix_ms,
    })
}

fn validate(claims: &Claims, expected: &Expected<'_>) -> Result<(), String> {
    if !valid_identity_claims(claims) || !valid_digest_claims(claims)
        || claims.risk_millis > 1_000 {
        return Err("morphogenesis authority claims are invalid".into());
    }
    if claims.mission_id != expected.mission_id || claims.plan_sha256 != expected.plan_sha256
        || claims.snapshot_id != expected.snapshot_id
        || claims.snapshot_sha256 != expected.snapshot_sha256
        || claims.risk_millis != expected.risk_millis
        || claims.degraded_mode != expected.degraded_mode {
        return Err("morphogenesis authority scope does not match the transition".into());
    }
    validate_time(claims)
}

fn valid_identity_claims(claims: &Claims) -> bool {
    claims.schema == SCHEMA && safe_id(&claims.principal_id)
        && safe_id(&claims.organization_id) && safe_id(&claims.project_id)
        && safe_id(&claims.mission_id) && safe_id(&claims.snapshot_id)
        && safe_id(&claims.nonce)
}

fn valid_digest_claims(claims: &Claims) -> bool {
    is_sha256(&claims.plan_sha256) && is_sha256(&claims.snapshot_sha256)
}

fn validate_time(claims: &Claims) -> Result<(), String> {
    let now = SystemTime::now().duration_since(UNIX_EPOCH)
        .map_err(|error| format!("system clock is invalid: {error}"))?.as_millis() as u64;
    if claims.issued_at_unix_ms > now.saturating_add(5_000)
        || claims.expires_at_unix_ms <= now
        || claims.expires_at_unix_ms <= claims.issued_at_unix_ms
        || claims.expires_at_unix_ms - claims.issued_at_unix_ms > MAX_TTL_MS {
        return Err("morphogenesis authority is expired or has an invalid validity window".into());
    }
    Ok(())
}

fn pinned_key(key_id: &str) -> Result<VerifyingKey, String> {
    let trust = std::env::var("GENOS_CLI_AUTHORITY_TRUST_JSON")
        .map_err(|_| "morphogenesis authority trust is unavailable".to_string())?;
    let keys: HashMap<String, String> = serde_json::from_str(&trust)
        .map_err(|error| format!("invalid morphogenesis authority trust: {error}"))?;
    let public_bytes = decode_hex::<32>(keys.get(key_id)
        .ok_or("morphogenesis authority signer is not trusted")?)?;
    let expected_id = Sha256::digest(public_bytes)[..16].iter()
        .map(|byte| format!("{byte:02x}")).collect::<String>();
    if expected_id != key_id { return Err("morphogenesis authority key ID mismatch".into()); }
    VerifyingKey::from_bytes(&public_bytes)
        .map_err(|error| format!("invalid morphogenesis authority public key: {error}"))
}

fn signing_bytes(claims: &Claims) -> Vec<u8> {
    let strings = [&claims.schema, &claims.key_id, &claims.principal_id,
        &claims.organization_id, &claims.project_id, &claims.mission_id,
        &claims.plan_sha256, &claims.snapshot_id, &claims.snapshot_sha256];
    let mut values = strings.iter().map(|value| hex(value.as_bytes())).collect::<Vec<_>>();
    values.extend([claims.risk_millis.to_string(), claims.degraded_mode.to_string(),
        claims.issued_at_unix_ms.to_string(), claims.expires_at_unix_ms.to_string(),
        hex(claims.nonce.as_bytes())]);
    format!("genos-morphogenesis-transition-authority-v1\n{}", values.join("\n")).into_bytes()
}

fn safe_id(value: &str) -> bool {
    !value.is_empty() && value.len() <= 200
        && value.bytes().all(|byte| byte.is_ascii_alphanumeric() || b"-_.:".contains(&byte))
}

fn is_sha256(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn decode_hex<const N: usize>(value: &str) -> Result<[u8; N], String> {
    if !value.is_ascii() || value.len() != N * 2 {
        return Err("morphogenesis authority key or signature has an invalid length".into());
    }
    let mut output = [0u8; N];
    for (index, byte) in output.iter_mut().enumerate() {
        *byte = u8::from_str_radix(&value[index * 2..index * 2 + 2], 16)
            .map_err(|_| "morphogenesis authority key or signature is not hexadecimal".to_string())?;
    }
    Ok(output)
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signer, SigningKey};

    fn signed(snapshot_id: &str) -> (Envelope, VerifyingKey) {
        let signing = SigningKey::from_bytes(&[7u8; 32]);
        let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis() as u64;
        let public = signing.verifying_key();
        let key_id = hex(&Sha256::digest(public.as_bytes())[..16]);
        let claims = Claims {
            schema: SCHEMA.into(), key_id, principal_id: "operator".into(),
            organization_id: "org".into(), project_id: "project".into(),
            mission_id: "mission".into(), plan_sha256: "a".repeat(64),
            snapshot_id: snapshot_id.into(), snapshot_sha256: "b".repeat(64),
            risk_millis: 200, degraded_mode: false, issued_at_unix_ms: now,
            expires_at_unix_ms: now + 20_000, nonce: "test-nonce".into(),
        };
        let signature = hex(&signing.sign(&signing_bytes(&claims)).to_bytes());
        (Envelope { claims, signature }, public)
    }

    fn expected<'a>(snapshot_id: &'a str) -> Expected<'a> {
        Expected { mission_id: "mission", plan_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            snapshot_id, snapshot_sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            risk_millis: 200, degraded_mode: false }
    }

    #[test]
    fn accepts_exact_ed25519_transition_binding() {
        let (envelope, key) = signed("snapshot-1");
        let verified = verify_with_key(envelope, expected("snapshot-1"), key).unwrap();
        assert_eq!(verified.snapshot_id, "snapshot-1");
        assert_eq!(verified.principal_id, "operator");
    }

    #[test]
    fn rejects_replayed_snapshot_binding() {
        let (envelope, key) = signed("snapshot-1");
        assert!(verify_with_key(envelope, expected("snapshot-2"), key).is_err());
    }
}

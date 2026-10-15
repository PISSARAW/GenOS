//! Host-pinned Ed25519 identity for synthetic sensory producers.

use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use uuid::Uuid;

const TRUST_SCHEMA: &str = "genos.synthetic-sensory-producer-trust/v1";
const CLAIMS_SCHEMA: &str = "genos.synthetic-sensory-claims/v1";

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct TrustConfig { schema: String, producers: Vec<TrustedProducer> }

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct TrustedProducer { producer_id: Uuid, public_key_hex: String }

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SensoryClaims<'a> {
    pub mission_id: Uuid,
    pub tick: u64,
    pub producer_id: Uuid,
    pub stimulus_sha256: &'a str,
}

/// Source keys injected by the host bootstrap configuration.
pub struct SensoryProducerAuthority { keys: HashMap<Uuid, VerifyingKey> }

pub struct SensoryProof<'a> {
    pub mission_id: Uuid,
    pub tick: u64,
    pub producer_id: Uuid,
    pub stimulus_sha256: &'a str,
    pub signature_hex: &'a str,
}

impl SensoryProducerAuthority {
    pub fn from_bootstrap_json(input: &str) -> Result<Self, String> {
        if input.len() > 65_536 { return Err("sensory producer trust exceeds the 64 KiB limit".into()); }
        let config: TrustConfig = serde_json::from_str(input)
            .map_err(|error| format!("sensory producer trust is invalid: {error}"))?;
        if config.schema != TRUST_SCHEMA || config.producers.is_empty() {
            return Err("sensory producer trust schema or entries are invalid".into());
        }
        let mut keys = HashMap::new();
        for producer in config.producers {
            let bytes = decode_hex(&producer.public_key_hex)?;
            let raw: [u8; 32] = bytes.try_into().map_err(|_| "sensory Ed25519 public key must contain 32 bytes")?;
            let key = VerifyingKey::from_bytes(&raw).map_err(|error| error.to_string())?;
            if keys.insert(producer.producer_id, key).is_some() {
                return Err("sensory producer trust contains a duplicate identity".into());
            }
        }
        Ok(Self { keys })
    }

    pub fn verify(&self, proof: SensoryProof<'_>) -> Result<String, String> {
        let key = self.keys.get(&proof.producer_id)
            .ok_or_else(|| "sensory producer identity is not host-trusted".to_string())?;
        let bytes = decode_hex(proof.signature_hex)?;
        let signature = Signature::from_slice(&bytes)
            .map_err(|_| "sensory producer signature has invalid length".to_string())?;
        key.verify(&signing_bytes(SensoryClaims {
            mission_id: proof.mission_id,
            tick: proof.tick,
            producer_id: proof.producer_id,
            stimulus_sha256: proof.stimulus_sha256,
        })?, &signature)
            .map_err(|_| "sensory producer signature is invalid".to_string())?;
        Ok(format!("{:x}", Sha256::digest(key.as_bytes())))
    }
}

pub fn stimulus_digest<T: Serialize>(producer_id: Uuid, tick: u64, signal: &T) -> Result<String, String> {
    let material = serde_json::json!({
        "schema": "genos.synthetic-sensory-stimulus/v1",
        "producerId": producer_id,
        "tick": tick,
        "signal": signal,
    });
    let encoded = serde_json::to_vec(&material).map_err(|error| error.to_string())?;
    Ok(format!("{:x}", Sha256::digest(encoded)))
}

pub fn signing_bytes(claims: SensoryClaims<'_>) -> Result<Vec<u8>, String> {
    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct VersionedClaims<'a> { schema: &'static str, #[serde(flatten)] claims: SensoryClaims<'a> }
    serde_json::to_vec(&VersionedClaims { schema: CLAIMS_SCHEMA, claims })
        .map_err(|error| error.to_string())
}

fn decode_hex(value: &str) -> Result<Vec<u8>, String> {
    if value.is_empty() || value.len() % 2 != 0 { return Err("sensory Ed25519 hex value is invalid".into()); }
    value.as_bytes().chunks_exact(2).map(|pair| {
        let high = (pair[0] as char).to_digit(16).ok_or("sensory Ed25519 hex value is invalid")?;
        let low = (pair[1] as char).to_digit(16).ok_or("sensory Ed25519 hex value is invalid")?;
        Ok(((high << 4) | low) as u8)
    }).collect()
}

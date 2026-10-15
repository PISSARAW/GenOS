//! Host-pinned identity and signature verification for external Choanocyte producers.

use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use uuid::Uuid;

const TRUST_SCHEMA: &str = "genos.choanocyte-producer-trust/v1";
const SIGNING_SCHEMA: &str = "genos.choanocyte-producer-payload/v1";

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct TrustConfig {
    schema: String,
    producers: Vec<TrustedProducer>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct TrustedProducer {
    producer_id: Uuid,
    public_key_hex: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SigningClaims<'a> {
    schema: &'static str,
    mission_id: Uuid,
    producer_id: Uuid,
    payload_sha256: &'a str,
}

/// Producer keys supplied by the host/bootstrap boundary, never by the stream.
pub struct ChoanocyteProducerAuthority {
    keys: HashMap<Uuid, VerifyingKey>,
}

pub(crate) struct ProducerProof<'a> {
    pub mission_id: Uuid,
    pub producer_id: Uuid,
    pub payload_sha256: &'a str,
    pub signature_hex: &'a str,
}

impl ChoanocyteProducerAuthority {
    /// Parse the trust document injected by the host bootstrap environment.
    pub fn from_bootstrap_json(input: &str) -> Result<Self, String> {
        if input.len() > 65_536 {
            return Err("Choanocyte producer trust exceeds the 64 KiB limit".into());
        }
        let config: TrustConfig = serde_json::from_str(input)
            .map_err(|error| format!("Choanocyte producer trust is invalid: {error}"))?;
        if config.schema != TRUST_SCHEMA || config.producers.is_empty() {
            return Err("Choanocyte producer trust schema or entries are invalid".into());
        }
        let mut keys = HashMap::new();
        for producer in config.producers {
            let key = decode_public_key(&producer.public_key_hex)?;
            if keys.insert(producer.producer_id, key).is_some() {
                return Err("Choanocyte producer trust contains a duplicate identity".into());
            }
        }
        Ok(Self { keys })
    }

    pub(crate) fn verify(&self, proof: ProducerProof<'_>) -> Result<String, String> {
        let key = self.keys.get(&proof.producer_id)
            .ok_or_else(|| "Choanocyte producer identity is not host-trusted".to_string())?;
        let signature = decode_hex(proof.signature_hex)?;
        let signature = Signature::from_slice(&signature)
            .map_err(|_| "Choanocyte producer signature has invalid length".to_string())?;
        let bytes = signing_bytes(proof.mission_id, proof.producer_id, proof.payload_sha256)?;
        key.verify(&bytes, &signature)
            .map_err(|_| "Choanocyte producer signature is invalid".to_string())?;
        Ok(format!("{:x}", Sha256::digest(key.as_bytes())))
    }
}

pub fn signing_bytes(
    mission_id: Uuid,
    producer_id: Uuid,
    payload_sha256: &str,
) -> Result<Vec<u8>, String> {
    serde_json::to_vec(&SigningClaims {
        schema: SIGNING_SCHEMA,
        mission_id,
        producer_id,
        payload_sha256,
    }).map_err(|error| error.to_string())
}

fn decode_public_key(encoded: &str) -> Result<VerifyingKey, String> {
    let decoded = decode_hex(encoded)?;
    let bytes: [u8; 32] = decoded.try_into()
        .map_err(|_| "Choanocyte Ed25519 public key must contain 32 bytes".to_string())?;
    VerifyingKey::from_bytes(&bytes).map_err(|error| error.to_string())
}

fn decode_hex(value: &str) -> Result<Vec<u8>, String> {
    if value.is_empty() || value.len() % 2 != 0 {
        return Err("Choanocyte Ed25519 hex value is invalid".into());
    }
    value.as_bytes().chunks_exact(2).map(|pair| {
        let high = (pair[0] as char).to_digit(16).ok_or("Choanocyte Ed25519 hex value is invalid")?;
        let low = (pair[1] as char).to_digit(16).ok_or("Choanocyte Ed25519 hex value is invalid")?;
        Ok(((high << 4) | low) as u8)
    }).collect()
}

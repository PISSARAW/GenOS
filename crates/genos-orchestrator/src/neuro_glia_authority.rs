//! Hôte de confiance pour les producteurs du flux neuro-glial.

use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use uuid::Uuid;

const TRUST_SCHEMA: &str = "genos.neuro-glia-producer-trust/v1";
const CLAIMS_SCHEMA: &str = "genos.neuro-glia-event-claims/v1";

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct TrustConfig {
    schema: String,
    producers: Vec<TrustedProducer>,
    #[serde(default)] backend_authorities: Vec<TrustedBackendAuthority>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct TrustedProducer { producer_id: Uuid, public_key_hex: String }

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct TrustedBackendAuthority { authority_id: String, public_key_hex: String }

#[derive(Clone)]
pub struct NeuroGliaClaims {
    pub mission_id: Uuid,
    pub tick: u64,
    pub producer_id: Uuid,
    pub payload_sha256: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SignedClaims<'a> {
    schema: &'static str,
    mission_id: Uuid,
    tick: u64,
    producer_id: Uuid,
    payload_sha256: &'a str,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BackendAuthorizationProof {
    pub schema: String,
    pub authority_id: String,
    pub principal_id: String,
    pub organization_id: String,
    pub project_id: String,
    pub mission_id: Uuid,
    pub producer_id: Uuid,
    pub event_id: Uuid,
    pub event_type: String,
    pub tick: u64,
    pub idempotency_key: String,
    pub payload_sha256: String,
    pub signature_hex: String,
}

pub struct BackendEventBinding {
    pub mission_id: Uuid,
    pub producer_id: Uuid,
    pub event_id: Uuid,
    pub event_type: String,
    pub tick: u64,
    pub idempotency_key: String,
    pub payload_sha256: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SignedBackendClaims<'a> {
    schema: &'static str,
    authority_id: &'a str,
    principal_id: &'a str,
    organization_id: &'a str,
    project_id: &'a str,
    mission_id: Uuid,
    producer_id: Uuid,
    event_id: Uuid,
    event_type: &'a str,
    tick: u64,
    idempotency_key: &'a str,
    payload_sha256: &'a str,
}

/// Clés publiques chargées depuis la configuration de bootstrap de l'hôte.
pub struct NeuroGliaProducerAuthority {
    keys: HashMap<Uuid, VerifyingKey>,
    backend_keys: HashMap<String, VerifyingKey>,
}

impl NeuroGliaProducerAuthority {
    pub fn from_bootstrap_json(input: &str) -> Result<Self, String> {
        if input.len() > 65_536 { return Err("neuro-glia producer trust exceeds the 64 KiB limit".into()); }
        let config: TrustConfig = serde_json::from_str(input)
            .map_err(|error| format!("neuro-glia producer trust is invalid: {error}"))?;
        if config.schema != TRUST_SCHEMA || config.producers.is_empty() {
            return Err("neuro-glia producer trust schema or entries are invalid".into());
        }
        let keys = producer_keys(config.producers)?;
        let backend_keys = backend_keys(config.backend_authorities)?;
        Ok(Self { keys, backend_keys })
    }

    pub fn verify(&self, claims: &NeuroGliaClaims, signature_hex: &str) -> Result<String, String> {
        let key = self.trusted_key(claims.producer_id)?;
        let signature = decode_signature(signature_hex)?;
        verify_signature(key, claims, &signature)?;
        Ok(format!("{:x}", Sha256::digest(key.as_bytes())))
    }

    fn trusted_key(&self, producer_id: Uuid) -> Result<&VerifyingKey, String> {
        self.keys.get(&producer_id)
            .ok_or_else(|| "neuro-glia producer identity is not host-trusted".to_string())
    }

    pub fn verify_event_entry(&self, entry: &Value, mission_id: Uuid) -> Result<(), String> {
        let (claims, signature) = event_claims(entry, mission_id)?;
        self.verify(&claims, &signature)?;
        if let Some(proof) = backend_proof(entry)? {
            self.verify_backend_authorization(&proof, entry_binding(entry, mission_id, &claims)?)?;
        }
        Ok(())
    }

    pub fn verify_backend_authorization(
        &self,
        proof: &BackendAuthorizationProof,
        binding: BackendEventBinding,
    ) -> Result<(), String> {
        if !backend_binding_matches(proof, &binding) || !backend_scope_present(proof) {
            return Err("neuro-glia backend authorization claims do not match event".into());
        }
        let key = self.backend_keys.get(&proof.authority_id)
            .ok_or("neuro-glia backend authority is not host-trusted")?;
        let signature = decode_signature(&proof.signature_hex)?;
        key.verify(&backend_signing_bytes(proof)?, &signature)
            .map_err(|_| "neuro-glia backend authorization signature is invalid".to_string())
    }
}

fn backend_binding_matches(proof: &BackendAuthorizationProof, binding: &BackendEventBinding) -> bool {
    proof.schema == "genos.neuro-glia-backend-authorization/v1"
        && proof.mission_id == binding.mission_id && proof.producer_id == binding.producer_id
        && proof.event_id == binding.event_id && proof.event_type == binding.event_type
        && proof.tick == binding.tick && proof.idempotency_key == binding.idempotency_key
        && proof.payload_sha256 == binding.payload_sha256
}

fn backend_scope_present(proof: &BackendAuthorizationProof) -> bool {
    !proof.principal_id.trim().is_empty() && !proof.organization_id.trim().is_empty()
        && !proof.project_id.trim().is_empty() && !proof.authority_id.trim().is_empty()
}

fn backend_proof(entry: &Value) -> Result<Option<BackendAuthorizationProof>, String> {
    let Some(value) = entry["source"].get("backend_authorization") else { return Ok(None); };
    serde_json::from_value(value.clone()).map(Some)
        .map_err(|error| format!("neuro-glia backend authorization is invalid: {error}"))
}

fn producer_keys(producers: Vec<TrustedProducer>) -> Result<HashMap<Uuid, VerifyingKey>, String> {
    let mut keys = HashMap::new();
    for producer in producers {
        let key = decode_public_key(&producer.public_key_hex, "producer")?;
        if keys.insert(producer.producer_id, key).is_some() {
            return Err("neuro-glia producer trust contains a duplicate identity".into());
        }
    }
    Ok(keys)
}

fn backend_keys(authorities: Vec<TrustedBackendAuthority>) -> Result<HashMap<String, VerifyingKey>, String> {
    let mut keys = HashMap::new();
    for authority in authorities {
        let key = decode_public_key(&authority.public_key_hex, "backend")?;
        if authority.authority_id.trim().is_empty()
            || keys.insert(authority.authority_id, key).is_some()
        {
            return Err("neuro-glia backend trust contains an empty or duplicate authority".into());
        }
    }
    Ok(keys)
}

fn decode_public_key(value: &str, kind: &str) -> Result<VerifyingKey, String> {
    let raw: [u8; 32] = decode_hex(value)?.try_into()
        .map_err(|_| format!("neuro-glia {kind} Ed25519 public key must contain 32 bytes"))?;
    VerifyingKey::from_bytes(&raw).map_err(|error| error.to_string())
}

fn entry_binding(
    entry: &Value,
    mission_id: Uuid,
    claims: &NeuroGliaClaims,
) -> Result<BackendEventBinding, String> {
    let event_id = entry["event_id"].as_str().ok_or("neuro-glia event id missing")?
        .parse().map_err(|error: uuid::Error| error.to_string())?;
    let event_type = entry["event_type"].as_str().ok_or("neuro-glia event type missing")?;
    let idempotency_key = entry["idempotency_key"].as_str().ok_or("neuro-glia idempotency key missing")?;
    Ok(BackendEventBinding { mission_id, producer_id: claims.producer_id, event_id,
        event_type: event_type.to_string(), tick: claims.tick, idempotency_key: idempotency_key.to_string(),
        payload_sha256: claims.payload_sha256.clone() })
}

pub fn backend_signing_bytes(proof: &BackendAuthorizationProof) -> Result<Vec<u8>, String> {
    serde_json::to_vec(&SignedBackendClaims {
        schema: "genos.neuro-glia-backend-authorization/v1",
        authority_id: &proof.authority_id,
        principal_id: &proof.principal_id,
        organization_id: &proof.organization_id,
        project_id: &proof.project_id,
        mission_id: proof.mission_id,
        producer_id: proof.producer_id,
        event_id: proof.event_id,
        event_type: &proof.event_type,
        tick: proof.tick,
        idempotency_key: &proof.idempotency_key,
        payload_sha256: &proof.payload_sha256,
    }).map_err(|error| error.to_string())
}

fn event_claims(entry: &Value, mission_id: Uuid) -> Result<(NeuroGliaClaims, String), String> {
    let source = entry.get("source").ok_or("neuro-glia event has no authenticated producer")?;
    let producer_id = source["producer_id"].as_str().ok_or("neuro-glia producer identity missing")?
        .parse::<Uuid>().map_err(|error| error.to_string())?;
    let tick = entry["tick"].as_u64().ok_or("neuro-glia event tick missing")?;
    let event_type = entry["event_type"].as_str().ok_or("neuro-glia event type missing")?;
    let idempotency_key = entry["idempotency_key"].as_str().ok_or("neuro-glia idempotency key missing")?;
    let payload_sha256 = payload_digest(event_type, idempotency_key, &entry["payload"])?;
    if source["payload_sha256"] != payload_sha256 {
        return Err("neuro-glia producer payload digest does not match stored event".into());
    }
    let signature = source["signature_hex"].as_str().ok_or("neuro-glia producer signature missing")?.to_string();
    Ok((NeuroGliaClaims { mission_id, tick, producer_id, payload_sha256 }, signature))
}

fn decode_signature(signature_hex: &str) -> Result<Signature, String> {
    Signature::from_slice(&decode_hex(signature_hex)?)
        .map_err(|_| "neuro-glia producer signature has invalid length".to_string())
}

fn verify_signature(
    key: &VerifyingKey,
    claims: &NeuroGliaClaims,
    signature: &Signature,
) -> Result<(), String> {
    key.verify(&signing_bytes(claims)?, signature)
        .map_err(|_| "neuro-glia producer signature is invalid".to_string())
}

pub fn payload_digest(event_type: &str, idempotency_key: &str, payload: &Value) -> Result<String, String> {
    let material = serde_json::json!({
        "schema": "genos.neuro-glia-event-payload/v1",
        "eventType": event_type,
        "idempotencyKey": idempotency_key,
        "payload": payload,
    });
    let encoded = serde_json::to_vec(&material).map_err(|error| error.to_string())?;
    Ok(format!("{:x}", Sha256::digest(encoded)))
}

pub fn signing_bytes(claims: &NeuroGliaClaims) -> Result<Vec<u8>, String> {
    serde_json::to_vec(&SignedClaims {
        schema: CLAIMS_SCHEMA,
        mission_id: claims.mission_id,
        tick: claims.tick,
        producer_id: claims.producer_id,
        payload_sha256: &claims.payload_sha256,
    })
        .map_err(|error| error.to_string())
}

fn decode_hex(value: &str) -> Result<Vec<u8>, String> {
    if value.is_empty() || value.len() % 2 != 0 { return Err("neuro-glia Ed25519 hex value is invalid".into()); }
    value.as_bytes().chunks_exact(2).map(|pair| {
        let high = (pair[0] as char).to_digit(16).ok_or("neuro-glia Ed25519 hex value is invalid")?;
        let low = (pair[1] as char).to_digit(16).ok_or("neuro-glia Ed25519 hex value is invalid")?;
        Ok(((high << 4) | low) as u8)
    }).collect()
}

//! Fail-closed bridge from verified synthetic receipts to one mission PAF tick.

use crate::animal_sensory_runtime::SyntheticAnimalSignal;
use crate::instincts::{SensorySourceRef, VerifiedSensoryStimulus};
use crate::sensory_receipt_runtime::read_verified_synthetic_sensory_envelopes;
use crate::sensory_authority::{stimulus_digest, SensoryProducerAuthority, SensoryProof};
use crate::GenosEcosystem;
use genos_biology::instinct::{Modality, SignStimulus};
use genos_store::BiologicalReceiptStore;
use ed25519_dalek::{Signature, VerifyingKey};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use serde_json::Value;

const PAF_RECEIPT_SCHEMA: &str = "genos.instinct-paf-receipt/v1";

struct ConsumptionContext<'a> {
    mission_id: uuid::Uuid,
    next_tick: u64,
    verified: &'a [Value],
}

struct SourceConsumption<'a> {
    tick: u64,
    available: &'a HashMap<&'a str, &'a str>,
    consumed: &'a mut HashMap<String, u64>,
}

/// Queues at most one unconsumed sensory receipt for the ecosystem's next tick.
pub fn prepare_next_synthetic_sensory_input(
    ecosystem: &mut GenosEcosystem,
    store: &BiologicalReceiptStore,
) -> Result<bool, String> {
    let mission_id = ecosystem.mission_id.ok_or("PAF sensory bridge requires a mission identity")?;
    let next_tick = ecosystem.receipt_tick.checked_add(1).ok_or("mission tick overflow")?;
    reject_foreign_mission_sensory_receipts(store, mission_id)?;
    let verified = read_verified_synthetic_sensory_envelopes(store, mission_id)?;
    let authority = sensory_authority_from_host()?;
    validate_signed_sources(&verified, mission_id, authority.as_ref())?;
    let consumed = consumed_source_ids(store, ConsumptionContext { mission_id, next_tick, verified: &verified })?;
    let pending = verified.iter().find(|receipt| {
        receipt["event_id"].as_str().is_some_and(|event_id| !consumed.contains_key(event_id))
    });
    let Some(receipt) = pending else { return Ok(false); };
    queue_verified_receipt(ecosystem, receipt)?;
    Ok(true)
}

fn sensory_authority_from_host() -> Result<Option<SensoryProducerAuthority>, String> {
    match std::env::var("GENOS_SENSORY_TRUST_JSON") {
        Ok(value) => SensoryProducerAuthority::from_bootstrap_json(&value).map(Some),
        Err(std::env::VarError::NotPresent) => Ok(None),
        Err(error) => Err(format!("cannot read host sensory producer trust: {error}")),
    }
}

fn validate_signed_sources(receipts: &[Value], mission_id: uuid::Uuid, authority: Option<&SensoryProducerAuthority>) -> Result<(), String> {
    for receipt in receipts {
        let source = &receipt["source_receipt"];
        verify_authenticated_source(source, mission_id, authority)?;
    }
    Ok(())
}

fn verify_authenticated_source(source: &Value, mission_id: uuid::Uuid, authority: Option<&SensoryProducerAuthority>) -> Result<(), String> {
    if source["source_authentication"] != "host_pinned_ed25519" {
        return Err("PAF refuses a sensory receipt without authenticated producer provenance".into());
    }
    verify_signed_source(source, mission_id, authority)
}

fn verify_signed_source(source: &Value, mission_id: uuid::Uuid, authority: Option<&SensoryProducerAuthority>) -> Result<(), String> {
    let trust = authority.ok_or("host sensory producer trust is not configured for PAF replay")?;
    let (producer_id, tick, digest, signature) = signed_source_claims(source)?;
    let key_digest = trust.verify(SensoryProof {
        mission_id,
        tick,
        producer_id,
        stimulus_sha256: &digest,
        signature_hex: signature,
    })?;
    if source["producer_trust_key_sha256"].as_str() != Some(key_digest.as_str()) {
        return Err("signed sensory source trust key fingerprint mismatch".into());
    }
    Ok(())
}

fn signed_source_claims(source: &Value) -> Result<(uuid::Uuid, u64, String, &str), String> {
    let producer_id = source["producer_id"].as_str().ok_or("signed sensory source has no producer identity")?
        .parse().map_err(|_| "signed sensory source producer identity is invalid")?;
    let tick = source["source_tick"].as_u64().filter(|tick| *tick > 0)
        .ok_or("signed sensory source tick is invalid")?;
    let digest = stimulus_digest(producer_id, tick, &source["signal"])?;
    if source["stimulus_sha256"].as_str() != Some(digest.as_str()) {
        return Err("signed sensory stimulus digest mismatch".into());
    }
    let signature = source["producer_signature_hex"].as_str()
        .ok_or("signed sensory source has no signature")?;
    Ok((producer_id, tick, digest, signature))
}

fn queue_verified_receipt(ecosystem: &mut GenosEcosystem, receipt: &Value) -> Result<(), String> {
    let source = &receipt["source_receipt"];
    validate_experimental_source(source, receipt["mission_id"].as_str().ok_or("sensory receipt mission is missing")?)?;
    let signal: SyntheticAnimalSignal = serde_json::from_value(source["signal"].clone())
        .map_err(|error| format!("sensory receipt signal is invalid: {error}"))?;
    signal.validate()?;
    let event_id = receipt["event_id"].as_str().ok_or("sensory receipt has no event id")?;
    let source_digest = receipt["source_digest"].as_str().ok_or("sensory receipt has no digest")?;
    ecosystem.set_verified_sensory_stimuli(vec![VerifiedSensoryStimulus {
        source_ref: SensorySourceRef { event_id: event_id.into(), source_digest: source_digest.into() },
        stimulus: stimulus_from_signal(&signal),
    }]);
    Ok(())
}

fn reject_foreign_mission_sensory_receipts(
    store: &BiologicalReceiptStore,
    mission_id: uuid::Uuid,
) -> Result<(), String> {
    for receipt in store.read_all()?.iter().filter(|item| item["schema"] == "genos.synthetic-sensory-receipt/v1") {
        if receipt["mission_id"] != mission_id.to_string() {
            return Err("sensory receipt mission does not match the biological tick".into());
        }
    }
    Ok(())
}

fn consumed_source_ids(
    store: &BiologicalReceiptStore,
    context: ConsumptionContext<'_>,
) -> Result<HashMap<String, u64>, String> {
    let available: HashMap<_, _> = context.verified.iter().filter_map(|receipt| {
        Some((receipt["event_id"].as_str()?, receipt["source_digest"].as_str()?))
    }).collect();
    let mut consumed = HashMap::new();
    for receipt in store.read_all()?.iter().filter(|item| item["schema"] == PAF_RECEIPT_SCHEMA) {
        let tick = validate_existing_paf(receipt, &context)?;
        add_consumed_sources(receipt, SourceConsumption {
            tick,
            available: &available,
            consumed: &mut consumed,
        })?;
    }
    Ok(consumed)
}

fn validate_existing_paf(receipt: &Value, context: &ConsumptionContext<'_>) -> Result<u64, String> {
    if receipt["mission_id"] != context.mission_id.to_string() { return Err("PAF receipt mission does not match its journal".into()); }
    let tick = receipt["tick"].as_u64().ok_or("PAF receipt has no valid tick")?;
    if tick == 0 || tick >= context.next_tick { return Err("PAF receipt tick is incoherent with the next mission tick".into()); }
    Ok(tick)
}

fn add_consumed_sources(receipt: &Value, context: SourceConsumption<'_>) -> Result<(), String> {
    let Some(references) = receipt.get("sensory_source_refs") else { return Ok(()); };
    for source in references.as_array().ok_or("PAF receipt sensory sources are invalid")? {
        let event_id = source["event_id"].as_str().ok_or("PAF source reference has no event id")?;
        let digest = context.available.get(event_id).ok_or("PAF source reference has no verified mission receipt")?;
        if source["source_digest"].as_str() != Some(*digest) {
            return Err("PAF source digest does not match its verified mission receipt".into());
        }
        if let Some(previous_tick) = context.consumed.get(event_id) {
            if *previous_tick != context.tick { return Err("sensory receipt was consumed by more than one PAF tick".into()); }
        } else {
            context.consumed.insert(event_id.to_string(), context.tick);
        }
    }
    Ok(())
}

fn validate_experimental_source(source: &Value, mission: &str) -> Result<(), String> {
    if is_backend_authorized(source) {
        return verify_backend_authority(source, mission);
    }
    if is_experimental_source(source) {
        return Ok(());
    }
    Err("PAF bridge accepts only explicitly experimental or backend-authorized synthetic receipts".into())
}

fn is_backend_authorized(source: &Value) -> bool {
    source["execution_mode"] == "backend-authorized"
        && source["mission_authority"] == "authenticated_backend_capability"
}

fn is_experimental_source(source: &Value) -> bool {
    source["execution_mode"] == "experimental" && source["mission_authority"] == "unverified_cli_claim"
}

fn verify_backend_authority(source: &Value, mission: &str) -> Result<(), String> {
    let envelope = &source["backend_authority"];
    let claims = &envelope["claims"];
    validate_backend_authority_claims(source, claims, mission)?;
    verify_backend_authority_signature(envelope, claims)
}

fn validate_backend_authority_claims(source: &Value, claims: &Value, mission: &str) -> Result<(), String> {
    if !backend_identity_matches(source, claims, mission)?
        || !backend_provenance_matches(source, claims)? {
        return Err("backend sensory authority claims do not match the durable source receipt".into());
    }
    validate_backend_authority_scope(source, claims)?;
    Ok(())
}

fn verify_backend_authority_signature(envelope: &Value, claims: &Value) -> Result<(), String> {
    let key_id = claim_text(claims, "key_id")?;
    let key = backend_authority_key(key_id)?;
    let signature_hex = envelope["signature"].as_str().ok_or("backend sensory authority signature is missing")?;
    let signature = decode_backend_signature(signature_hex)?;
    key.verify_strict(&backend_signing_bytes(claims)?, &Signature::from_bytes(&signature))
        .map_err(|_| "backend sensory authority signature verification failed".to_string())
}

fn backend_identity_matches(source: &Value, claims: &Value, mission: &str) -> Result<bool, String> {
    Ok(claim_text(claims, "schema")? == "genos.authenticated-sensory-backend-authority/v1"
        && claim_text(claims, "mission_id")? == mission
        && claim_text(claims, "producer_id")? == source["producer_id"].as_str().unwrap_or_default()
        && claims["tick"].as_u64() == source["source_tick"].as_u64())
}

fn backend_provenance_matches(source: &Value, claims: &Value) -> Result<bool, String> {
    let signal: Value = serde_json::from_str(claim_text(claims, "signal_json")?).map_err(|error| error.to_string())?;
    Ok(claim_text(claims, "stimulus_sha256")? == source["stimulus_sha256"].as_str().unwrap_or_default()
        && claim_text(claims, "producer_signature_hex")? == source["producer_signature_hex"].as_str().unwrap_or_default()
        && claim_text(claims, "producer_trust_key_sha256")? == source["producer_trust_key_sha256"].as_str().unwrap_or_default()
        && signal == source["signal"])
}

fn claim_text<'a>(claims: &'a Value, key: &str) -> Result<&'a str, String> {
    claims[key].as_str().ok_or_else(|| format!("backend sensory authority has no {key}"))
}

fn validate_backend_authority_scope(source: &Value, claims: &Value) -> Result<(), String> {
    let scope = &source["authority_scope"];
    for field in ["organization_id", "project_id", "principal_id", "mission_id", "payload_hash", "key_id"] {
        if scope[field] != claims[field] { return Err(format!("backend sensory authority scope mismatches {field}")); }
    }
    let issued = claims["issued_at_unix_ms"].as_u64().ok_or("backend sensory authority issue time is invalid")?;
    let expires = claims["expires_at_unix_ms"].as_u64().ok_or("backend sensory authority expiry is invalid")?;
    if expires <= issued || expires - issued > 30_000 || claims["nonce"].as_str().is_none() {
        return Err("backend sensory authority validity claims are invalid".into());
    }
    Ok(())
}

fn backend_authority_key(key_id: &str) -> Result<VerifyingKey, String> {
    let trust = std::env::var("GENOS_CLI_AUTHORITY_TRUST_JSON")
        .map_err(|_| "backend sensory authority trust is unavailable".to_string())?;
    let keys: HashMap<String, String> = serde_json::from_str(&trust).map_err(|error| error.to_string())?;
    let bytes = decode_backend_hex::<32>(keys.get(key_id).ok_or("backend sensory signer is not trusted")?)?;
    let fingerprint = Sha256::digest(bytes);
    let actual_id = fingerprint[..16].iter().map(|byte| format!("{byte:02x}")).collect::<String>();
    if actual_id != key_id { return Err("backend sensory authority key ID mismatch".into()); }
    VerifyingKey::from_bytes(&bytes).map_err(|error| error.to_string())
}

fn backend_signing_bytes(claims: &Value) -> Result<Vec<u8>, String> {
    let mut values = backend_signing_identity_fields(claims)?;
    values.extend(backend_signing_provenance_fields(claims)?);
    values.extend(backend_signing_validity_fields(claims)?);
    Ok(format!("genos-sensory-backend-authority-v1\n{}", values.join("\n")).into_bytes())
}

fn backend_signing_identity_fields(claims: &Value) -> Result<Vec<String>, String> {
    ["schema", "key_id", "organization_id", "project_id", "principal_id", "mission_id", "producer_id"]
        .iter().map(|key| encoded_claim_text(claims, key)).collect()
}

fn backend_signing_provenance_fields(claims: &Value) -> Result<Vec<String>, String> {
    let mut values = vec![claims["tick"].as_u64().ok_or("backend sensory tick is invalid")?.to_string()];
    values.extend(["stimulus_sha256", "producer_signature_hex", "producer_trust_key_sha256", "signal_json"]
        .iter().map(|key| encoded_claim_text(claims, key)).collect::<Result<Vec<_>, _>>()?);
    Ok(values)
}

fn backend_signing_validity_fields(claims: &Value) -> Result<Vec<String>, String> {
    Ok(vec![
        encoded_claim_text(claims, "payload_hash")?,
        claims["issued_at_unix_ms"].as_u64().ok_or("backend issue time is invalid")?.to_string(),
        claims["expires_at_unix_ms"].as_u64().ok_or("backend expiry is invalid")?.to_string(),
        encoded_claim_text(claims, "nonce")?,
    ])
}

fn encoded_claim_text(claims: &Value, key: &str) -> Result<String, String> {
    claim_text(claims, key).map(|value| backend_hex(value.as_bytes()))
}

fn decode_backend_signature(value: &str) -> Result<[u8; 64], String> { decode_backend_hex(value) }
fn decode_backend_hex<const N: usize>(value: &str) -> Result<[u8; N], String> {
    if value.len() != N * 2 { return Err("backend sensory authority hex value is invalid".into()); }
    let mut output = [0u8; N];
    for (index, byte) in output.iter_mut().enumerate() {
        *byte = u8::from_str_radix(&value[index * 2..index * 2 + 2], 16).map_err(|_| "backend sensory authority hex value is invalid")?;
    }
    Ok(output)
}
fn backend_hex(bytes: &[u8]) -> String { bytes.iter().map(|byte| format!("{byte:02x}")).collect() }

fn stimulus_from_signal(signal: &SyntheticAnimalSignal) -> SignStimulus {
    match signal {
        SyntheticAnimalSignal::Vomeronasal { signal } if signal.pheromone_type == genos_biology::sensory::PheromoneType::Alarm => {
            SignStimulus::new(Modality::Error, "threat_detected", signal.concentration)
        }
        SyntheticAnimalSignal::Vomeronasal { signal } => {
            SignStimulus::new(Modality::Pheromone, "vomeronasal_observation", signal.concentration)
        }
        SyntheticAnimalSignal::Compass { .. } => SignStimulus::new(Modality::Magnetic, "compass_observation", 1.0),
        SyntheticAnimalSignal::ActiveElectroreception { .. } | SyntheticAnimalSignal::PassiveElectroreception { .. } => {
            SignStimulus::new(Modality::Magnetic, "electroreception_observation", 1.0)
        }
        SyntheticAnimalSignal::ThermalFusion { .. } => SignStimulus::new(Modality::Thermal, "thermal_observation", 1.0),
        SyntheticAnimalSignal::Echolocation { .. } => SignStimulus::new(Modality::Acoustic, "echolocation_observation", 1.0),
    }
}

#[cfg(test)]
mod tests {
    use super::{SourceConsumption, add_consumed_sources};
    use serde_json::json;
    use std::collections::HashMap;

    #[test]
    fn multiple_paf_receipts_can_share_a_source_only_within_one_tick() {
        let available = HashMap::from([("event-1", "digest-1")]);
        let receipt = json!({"sensory_source_refs": [{
            "event_id": "event-1", "source_digest": "digest-1"
        }]});
        let mut consumed = HashMap::new();

        add_consumed_sources(&receipt, SourceConsumption {
            tick: 3, available: &available, consumed: &mut consumed,
        }).unwrap();
        add_consumed_sources(&receipt, SourceConsumption {
            tick: 3, available: &available, consumed: &mut consumed,
        }).unwrap();
        assert_eq!(consumed.get("event-1"), Some(&3));

        let reused = add_consumed_sources(&receipt, SourceConsumption {
            tick: 4, available: &available, consumed: &mut consumed,
        }).unwrap_err();
        assert!(reused.contains("more than one PAF tick"));
    }
}

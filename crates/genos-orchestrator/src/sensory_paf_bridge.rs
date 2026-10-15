//! Fail-closed bridge from verified synthetic receipts to one mission PAF tick.

use crate::animal_sensory_runtime::SyntheticAnimalSignal;
use crate::instincts::{SensorySourceRef, VerifiedSensoryStimulus};
use crate::sensory_receipt_runtime::read_verified_synthetic_sensory_envelopes;
use crate::sensory_authority::{stimulus_digest, SensoryProducerAuthority, SensoryProof};
use crate::GenosEcosystem;
use genos_biology::instinct::{Modality, SignStimulus};
use genos_store::BiologicalReceiptStore;
use serde_json::Value;
use std::collections::HashMap;

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
    validate_experimental_source(source)?;
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

fn validate_experimental_source(source: &Value) -> Result<(), String> {
    if source["execution_mode"] != "experimental" || source["mission_authority"] != "unverified_cli_claim" {
        return Err("PAF bridge accepts only explicitly experimental synthetic receipts".into());
    }
    Ok(())
}

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

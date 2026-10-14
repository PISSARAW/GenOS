//! Persistance rejouable des réponses gliales événementielles de mission.

use crate::GenosEcosystem;
use genos_store::BiologicalReceiptStore;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use uuid::Uuid;

const RECEIPT_SCHEMA: &str = "genos.mission-neuro-glia-receipt/v1";
const SNAPSHOT_SCHEMA: &str = "genos.population-state/v1";
const RESPONSE_EVENT: &str = "MISSION_NEURO_GLIA_QUORUM_RESPONSE";

/// Entrée explicite pour générer une réponse événementielle durable.
pub struct DurableNeuroGliaEvent {
    pub event_type: String,
    pub payload: Value,
    pub tick: u64,
}

impl GenosEcosystem {
    /// Enregistre l'événement, puis persiste sa réponse et la population dans un append.
    pub fn record_event_with_durable_neuro_glia_response(
        &mut self,
        store: &BiologicalReceiptStore,
        request: DurableNeuroGliaEvent,
    ) -> Result<Value, String> {
        let mission_id = self.mission_id.ok_or("mission identity is required")?;
        let source_event_id = self.record_event(&request.event_type, request.payload);
        let response = self.events.read_stream(0).into_iter()
            .find(|event| event.event_type == RESPONSE_EVENT
                && event.payload["sourceEventId"] == source_event_id.to_string())
            .map(|event| event.payload)
            .ok_or_else(|| "source event did not produce a glial response".to_string())?;
        validate_response(&response, mission_id, source_event_id)?;
        let snapshot = self.population_state_receipt(request.tick)?;
        let receipt = response_receipt(mission_id, source_event_id, ResponseMaterial {
            response: &response,
            snapshot: &snapshot,
        })?;
        append_response(store, &snapshot, &receipt)?;
        Ok(receipt)
    }

    /// Relit et valide la dernière réponse persistée pour la mission.
    pub fn replay_neuro_glia_response(
        &mut self,
        store: &BiologicalReceiptStore,
    ) -> Result<Value, String> {
        let receipt = latest_receipt(&store.read_all()?, self.mission_id)?;
        validate_receipt_snapshot(store, &receipt)?;
        self.restore_population(store)?;
        Ok(receipt["response"].clone())
    }
}

fn validate_response(response: &Value, mission: Uuid, source_id: Uuid) -> Result<(), String> {
    if response["schema"] != "genos.mission-neuro-glia-quorum/v1"
        || response["missionId"] != mission.to_string()
        || response["sourceEventId"] != source_id.to_string()
    {
        return Err("glial response identity does not match source mission event".into());
    }
    Ok(())
}

struct ResponseMaterial<'a> {
    response: &'a Value,
    snapshot: &'a Value,
}

fn response_receipt(
    mission: Uuid,
    source_id: Uuid,
    material: ResponseMaterial<'_>,
) -> Result<Value, String> {
    let ResponseMaterial { response, snapshot } = material;
    validate_snapshot(snapshot, mission)?;
    let active_cells = snapshot["active_cells"].as_array()
        .ok_or("population snapshot active cells missing")?;
    let identities: Vec<Value> = active_cells.iter().map(|cell| json!({
        "cell_id": cell["cell_id"],
        "genome_id": cell["genome_id"],
    })).collect();
    Ok(json!({
        "schema": RECEIPT_SCHEMA,
        "mission_id": mission,
        "source_event_id": source_id,
        "source_event_type": response["sourceEventType"],
        "idempotency_key": format!("{mission}:{source_id}"),
        "response_digest": digest(response)?,
        "population_snapshot_digest": digest(snapshot)?,
        "population_identities": identities,
        "response": response,
    }))
}

fn append_response(
    store: &BiologicalReceiptStore,
    snapshot: &Value,
    receipt: &Value,
) -> Result<(), String> {
    let existing = store.find_idempotent_receipt(
        RECEIPT_SCHEMA,
        receipt["idempotency_key"].as_str().ok_or("response idempotency key missing")?,
    )?;
    if let Some(existing) = existing {
        if existing == *receipt {
            return Ok(());
        }
        return Err("glial response idempotency key conflicts with stored receipt".into());
    }
    store.append_receipts(&[snapshot.clone(), receipt.clone()])
}

fn latest_receipt(entries: &[Value], mission: Option<Uuid>) -> Result<Value, String> {
    let mission = mission.ok_or("mission identity is required for glial response replay")?;
    let receipt = entries.iter().rev()
        .find(|item| item["schema"] == RECEIPT_SCHEMA
            && item["mission_id"] == mission.to_string())
        .ok_or("durable glial response receipt missing")?;
    let source_id = receipt["source_event_id"].as_str()
        .ok_or("glial response source identity missing")?.parse::<Uuid>()
        .map_err(|error| error.to_string())?;
    validate_response(&receipt["response"], mission, source_id)?;
    if receipt["source_event_type"] != receipt["response"]["sourceEventType"]
        || receipt["response_digest"] != digest(&receipt["response"])?
    {
        return Err("durable glial response digest or event type mismatch".into());
    }
    Ok(receipt.clone())
}

fn validate_receipt_snapshot(
    store: &BiologicalReceiptStore,
    receipt: &Value,
) -> Result<(), String> {
    let mission = receipt["mission_id"].as_str().ok_or("receipt mission missing")?
        .parse::<Uuid>().map_err(|error| error.to_string())?;
    let entries = store.read_all()?;
    let snapshot = entries.iter().rev()
        .find(|item| item["schema"] == SNAPSHOT_SCHEMA
            && item["mission_id"] == mission.to_string()
            && receipt["population_snapshot_digest"] == digest(item).unwrap_or_default())
        .ok_or("glial response population snapshot missing or changed")?;
    validate_snapshot(snapshot, mission)?;
    if receipt["population_identities"] != json!(population_identities(snapshot)?) {
        return Err("glial response population identities do not match snapshot".into());
    }
    Ok(())
}

fn validate_snapshot(snapshot: &Value, mission: Uuid) -> Result<(), String> {
    if snapshot["schema"] != SNAPSHOT_SCHEMA || snapshot["mission_id"] != mission.to_string()
        || snapshot["tick"].as_u64().is_none()
    {
        return Err("population snapshot mission or tick mismatch".into());
    }
    Ok(())
}

fn population_identities(snapshot: &Value) -> Result<Vec<Value>, String> {
    snapshot["active_cells"].as_array().map(|cells| cells.iter().map(|cell| json!({
        "cell_id": cell["cell_id"], "genome_id": cell["genome_id"],
    })).collect()).ok_or_else(|| "population snapshot active cells missing".into())
}

fn digest(value: &Value) -> Result<String, String> {
    let encoded = serde_json::to_vec(value).map_err(|error| error.to_string())?;
    Ok(format!("{:x}", Sha256::digest(encoded)))
}

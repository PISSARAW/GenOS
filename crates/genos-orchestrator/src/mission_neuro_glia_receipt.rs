//! Persistance rejouable des réponses gliales événementielles de mission.

use crate::GenosEcosystem;
use genos_store::BiologicalReceiptStore;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use uuid::Uuid;

const RECEIPT_SCHEMA: &str = "genos.mission-neuro-glia-receipt/v1";
const SNAPSHOT_SCHEMA: &str = "genos.population-state/v1";
const RESPONSE_EVENT: &str = "MISSION_NEURO_GLIA_QUORUM_RESPONSE";
const STREAM_SCHEMA: &str = "genos.mission-neuro-glia-event/v1";
const STREAM_GENESIS: &str = "genos-neuro-glia-stream-genesis/v1";

/// Entrée explicite pour générer une réponse événementielle durable.
pub struct DurableNeuroGliaEvent {
    pub event_type: String,
    pub payload: Value,
    pub tick: u64,
}

/// Événement du flux mission, dont la clé permet une reprise idempotente.
pub struct NeuroGliaStreamEvent {
    pub idempotency_key: String,
    pub event_type: String,
    pub payload: Value,
    pub tick: u64,
}

impl GenosEcosystem {
    /// Enregistre une étape du flux durable et ordonné de la mission.
    pub fn record_neuro_glia_stream_event(
        &mut self,
        store: &BiologicalReceiptStore,
        request: NeuroGliaStreamEvent,
    ) -> Result<Value, String> {
        let mission = self.mission_id.ok_or("mission identity is required")?;
        match resolve_stream_position(store, mission, &request)? {
            StreamStart::Existing(entry) => Ok(entry),
            StreamStart::Append(position) => persist_stream_event(
                self,
                store,
                StreamWrite { request, position },
            ),
        }
    }

    /// Valide le flux complet de la mission, puis restaure le dernier état persisté.
    pub fn replay_neuro_glia_event_stream(
        &mut self,
        store: &BiologicalReceiptStore,
    ) -> Result<Vec<Value>, String> {
        let mission = self.mission_id.ok_or("mission identity is required")?;
        let entries = store.read_all()?;
        let stream = verified_stream(&entries, mission)?;
        let latest = stream.last().ok_or("durable glial event stream is empty")?;
        let response_receipt = latest_response_receipt(&entries, latest)?;
        validate_receipt_snapshot(store, &response_receipt)?;
        self.restore_population(store)?;
        Ok(stream)
    }

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

enum StreamStart {
    Existing(Value),
    Append(StreamPosition),
}

struct StreamPosition {
    mission: Uuid,
    sequence: u64,
    previous_digest: String,
}

struct StreamWrite {
    request: NeuroGliaStreamEvent,
    position: StreamPosition,
}

fn resolve_stream_position(
    store: &BiologicalReceiptStore,
    mission: Uuid,
    request: &NeuroGliaStreamEvent,
) -> Result<StreamStart, String> {
    validate_stream_request(request)?;
    let entries = store.read_all()?;
    let stream = verified_stream(&entries, mission)?;
    if let Some(existing) = idempotent_stream_entry(&stream, request)? {
        return Ok(StreamStart::Existing(existing));
    }
    let previous_digest = stream.last()
        .and_then(|value| value["digest"].as_str())
        .unwrap_or(STREAM_GENESIS)
        .to_string();
    Ok(StreamStart::Append(StreamPosition {
        mission,
        sequence: stream.len() as u64 + 1,
        previous_digest,
    }))
}

fn persist_stream_event(
    ecosystem: &mut GenosEcosystem,
    store: &BiologicalReceiptStore,
    write: StreamWrite,
) -> Result<Value, String> {
    let StreamWrite { request, position } = write;
    let source_id = ecosystem.record_event(&request.event_type, request.payload.clone());
    let response = find_response(ecosystem, source_id)?;
    validate_response(&response, position.mission, source_id)?;
    let snapshot = ecosystem.population_state_receipt(request.tick)?;
    let response_receipt = response_receipt(
        position.mission,
        source_id,
        ResponseMaterial { response: &response, snapshot: &snapshot },
    )?;
    let entry = stream_entry(StreamMaterial {
        mission: position.mission,
        sequence: position.sequence,
        request: &request,
        source_id,
        response: &response,
        snapshot: &snapshot,
        previous_digest: &position.previous_digest,
    })?;
    store.append_receipts(&[snapshot, response_receipt, entry.clone()])?;
    Ok(entry)
}

fn validate_stream_request(request: &NeuroGliaStreamEvent) -> Result<(), String> {
    if request.idempotency_key.trim().is_empty()
        || request.idempotency_key.len() > 200
        || request.event_type.trim().is_empty()
    {
        return Err("glial stream requires a bounded idempotency key and event type".into());
    }
    Ok(())
}

fn find_response(ecosystem: &GenosEcosystem, source_id: Uuid) -> Result<Value, String> {
    ecosystem.events.read_stream(0).into_iter()
        .find(|event| event.event_type == RESPONSE_EVENT
            && event.payload["sourceEventId"] == source_id.to_string())
        .map(|event| event.payload)
        .ok_or_else(|| "source event did not produce a glial response".to_string())
}

fn verified_stream(entries: &[Value], mission: Uuid) -> Result<Vec<Value>, String> {
    let mut stream = Vec::new();
    let mut previous = STREAM_GENESIS.to_string();
    for entry in entries.iter().filter(|item| {
        item["schema"] == STREAM_SCHEMA && item["mission_id"] == mission.to_string()
    }) {
        let expected_sequence = stream.len() as u64 + 1;
        if entry["sequence"].as_u64() != Some(expected_sequence)
            || entry["previous_digest"] != previous
            || entry["digest"] != stream_digest(entry)?
        {
            return Err(format!("neuro-glia stream integrity failure at sequence {expected_sequence}"));
        }
        validate_stream_entry(entry, mission)?;
        previous = entry["digest"].as_str().ok_or("stream digest missing")?.to_string();
        stream.push(entry.clone());
    }
    Ok(stream)
}

fn validate_stream_entry(entry: &Value, mission: Uuid) -> Result<(), String> {
    let source_id = entry["source_event_id"].as_str().ok_or("stream source event missing")?
        .parse::<Uuid>().map_err(|error| error.to_string())?;
    validate_response(&entry["response"], mission, source_id)?;
    if entry["event_type"] != entry["response"]["sourceEventType"]
        || entry["payload"].is_null()
        || entry["response_digest"] != digest(&entry["response"])?
        || entry["idempotency_key"].as_str().is_none_or(str::is_empty)
    {
        return Err("neuro-glia stream response, event, or idempotency data mismatch".into());
    }
    Ok(())
}

fn idempotent_stream_entry(
    stream: &[Value],
    request: &NeuroGliaStreamEvent,
) -> Result<Option<Value>, String> {
    let existing = stream.iter().find(|entry| entry["idempotency_key"] == request.idempotency_key);
    let Some(existing) = existing else { return Ok(None); };
    if existing["event_type"] == request.event_type
        && existing["payload"] == request.payload
        && existing["tick"].as_u64() == Some(request.tick)
    {
        return Ok(Some(existing.clone()));
    }
    Err("neuro-glia stream idempotency key conflicts with stored event".into())
}

struct StreamMaterial<'a> {
    mission: Uuid,
    sequence: u64,
    request: &'a NeuroGliaStreamEvent,
    source_id: Uuid,
    response: &'a Value,
    snapshot: &'a Value,
    previous_digest: &'a str,
}

fn stream_entry(material: StreamMaterial<'_>) -> Result<Value, String> {
    let StreamMaterial { mission, sequence, request, source_id, response, snapshot, previous_digest } = material;
    let mut entry = json!({
        "schema": STREAM_SCHEMA,
        "mission_id": mission,
        "sequence": sequence,
        "idempotency_key": request.idempotency_key,
        "event_type": request.event_type,
        "payload": request.payload,
        "tick": request.tick,
        "source_event_id": source_id,
        "response": response,
        "response_digest": digest(response)?,
        "population_snapshot_digest": digest(snapshot)?,
        "previous_digest": previous_digest,
    });
    let event_digest = stream_digest(&entry)?;
    entry["digest"] = json!(event_digest);
    Ok(entry)
}

fn stream_digest(entry: &Value) -> Result<String, String> {
    let mut material = entry.clone();
    material.as_object_mut().ok_or("stream entry must be an object")?.remove("digest");
    digest(&material)
}

fn latest_response_receipt(entries: &[Value], stream_entry: &Value) -> Result<Value, String> {
    let receipt = entries.iter().rev().find(|item| {
        item["schema"] == RECEIPT_SCHEMA
            && item["mission_id"] == stream_entry["mission_id"]
            && item["source_event_id"] == stream_entry["source_event_id"]
    }).ok_or_else(|| "glial stream response receipt missing".to_string())?;
    if receipt["response"] != stream_entry["response"]
        || receipt["response_digest"] != stream_entry["response_digest"]
        || receipt["population_snapshot_digest"] != stream_entry["population_snapshot_digest"]
    {
        return Err("glial stream entry disagrees with its durable response receipt".into());
    }
    Ok(receipt.clone())
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

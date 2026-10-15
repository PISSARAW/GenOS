//! Vérification structurelle du journal de réponses neuro-gliales.

use crate::mission_neuro_glia_receipt::digest;
pub(crate) use crate::mission_neuro_glia_receipt::validate_response;
use serde_json::Value;
use uuid::Uuid;

pub(crate) const STREAM_SCHEMA: &str = "genos.mission-neuro-glia-event/v1";
pub(crate) const STREAM_GENESIS: &str = "genos-neuro-glia-stream-genesis/v1";

pub(crate) fn stream_digest(entry: &Value) -> Result<String, String> {
    let mut material = entry.clone();
    material.as_object_mut().ok_or("stream entry must be an object")?.remove("digest");
    digest(&material)
}
pub(crate) fn verified_stream(entries: &[Value], mission: Uuid) -> Result<Vec<Value>, String> {
    let mut stream = Vec::new();
    let mut previous = STREAM_GENESIS.to_string();
    for entry in entries.iter().filter(|item| is_mission_stream_entry(item, mission)) {
        let expected = stream.len() as u64 + 1;
        previous = validate_position(entry, expected, &previous)?;
        validate_entry(entry, mission)?;
        stream.push(entry.clone());
    }
    Ok(stream)
}

fn is_mission_stream_entry(entry: &Value, mission: Uuid) -> bool {
    entry["schema"] == STREAM_SCHEMA && entry["mission_id"] == mission.to_string()
}

fn validate_position(entry: &Value, sequence: u64, previous: &str) -> Result<String, String> {
    let digest = stream_digest(entry)?;
    if entry["sequence"].as_u64() != Some(sequence)
        || entry["previous_digest"] != previous
        || entry["digest"] != digest
    { return Err(format!("neuro-glia stream integrity failure at sequence {sequence}")); }
    entry["digest"].as_str().map(str::to_string).ok_or_else(|| "stream digest missing".into())
}

fn validate_entry(entry: &Value, mission: Uuid) -> Result<(), String> {
    let source_id = entry["source_event_id"].as_str().ok_or("stream source event missing")?
        .parse::<Uuid>().map_err(|error| error.to_string())?;
    validate_response(&entry["response"], mission, source_id)?;
    validate_event_receipt(entry)
}

fn validate_event_receipt(entry: &Value) -> Result<(), String> {
    let response_digest = digest(&entry["response"])?;
    if entry["event_type"] != entry["response"]["sourceEventType"]
        || entry["payload"].is_null()
        || entry["response_digest"] != response_digest
        || entry["idempotency_key"].as_str().is_none_or(str::is_empty)
    { return Err("neuro-glia stream response, event, or idempotency data mismatch".into()); }
    validate_source_shape(entry.get("source"))
}

fn validate_source_shape(source: Option<&Value>) -> Result<(), String> {
    let Some(source) = source else { return Ok(()); };
    if source.is_null() { return Ok(()); }
    if source["producer_id"].as_str().and_then(|value| value.parse::<Uuid>().ok()).is_none()
        || source["payload_sha256"].as_str().is_none_or(str::is_empty)
        || source["signature_hex"].as_str().is_none_or(str::is_empty)
    { return Err("neuro-glia producer proof is malformed".into()); }
    Ok(())
}

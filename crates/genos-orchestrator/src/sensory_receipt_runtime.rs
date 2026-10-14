//! Mission-bound persistence and verification for synthetic sensory receipts.

use genos_store::BiologicalReceiptStore;
use serde_json::Value;
use sha2::{Digest, Sha256};
use uuid::Uuid;

const RECEIPT_SCHEMA: &str = "genos.synthetic-sensory-receipt/v1";
const SOURCE_SCHEMA: &str = "genos.synthetic-animal-receipt/v1";

/// Persists a synthetic sensory measurement with a digest and mission identity.
pub fn persist_synthetic_sensory_receipt(
    store: &BiologicalReceiptStore,
    mission_id: Uuid,
    source_receipt: &Value,
) -> Result<Value, String> {
    validate_source_receipt(source_receipt)?;
    let event_id = source_receipt["event_id"]
        .as_str()
        .ok_or_else(|| "Synthetic sensory receipt has no event id".to_string())?;
    let idempotency_key = format!("{mission_id}:{event_id}");
    let receipt = serde_json::json!({
        "schema": RECEIPT_SCHEMA,
        "mission_id": mission_id,
        "event_id": event_id,
        "idempotency_key": idempotency_key,
        "origin": "synthetic",
        "source_digest": digest(mission_id, source_receipt)?,
        "source_receipt": source_receipt,
    });
    store.append_idempotent_receipt(&receipt)
}

/// Reads this mission's sensory receipts and verifies each source digest.
pub fn read_synthetic_sensory_receipts(
    store: &BiologicalReceiptStore,
    mission_id: Uuid,
) -> Result<Vec<Value>, String> {
    store.read_all()?.into_iter()
        .filter(|receipt| receipt["schema"] == RECEIPT_SCHEMA && receipt["mission_id"] == mission_id.to_string())
        .map(|receipt| verify_receipt(receipt, mission_id))
        .collect()
}

fn validate_source_receipt(source: &Value) -> Result<(), String> {
    if source["schema"] != SOURCE_SCHEMA || source["origin"] != "synthetic" {
        return Err("Only typed synthetic sensory receipts can be persisted here".into());
    }
    if source["event_id"].as_str().is_none() {
        return Err("Synthetic sensory receipt has no event id".into());
    }
    Ok(())
}

fn verify_receipt(receipt: Value, mission_id: Uuid) -> Result<Value, String> {
    if receipt["origin"] != "synthetic" {
        return Err("Sensory receipt origin is not synthetic".into());
    }
    if receipt["mission_id"] != mission_id.to_string() {
        return Err("Sensory receipt mission does not match requested mission".into());
    }
    let source = &receipt["source_receipt"];
    validate_source_receipt(source)?;
    let event_id = source["event_id"].as_str().unwrap_or_default();
    if receipt["event_id"] != event_id
        || receipt["idempotency_key"] != format!("{mission_id}:{event_id}")
    {
        return Err("Sensory receipt identity does not match its source".into());
    }
    if receipt["source_digest"].as_str() != Some(digest(mission_id, source)?.as_str()) {
        return Err("Synthetic sensory receipt digest mismatch".into());
    }
    Ok(source.clone())
}

fn digest(mission_id: Uuid, value: &Value) -> Result<String, String> {
    let material = serde_json::json!({ "mission_id": mission_id, "source_receipt": value });
    let encoded = serde_json::to_vec(&material).map_err(|error| error.to_string())?;
    Ok(format!("{:x}", Sha256::digest(encoded)))
}

#[cfg(test)]
mod tests {
    use super::{digest, verify_receipt, RECEIPT_SCHEMA};
    use serde_json::json;
    use uuid::Uuid;

    #[test]
    fn digest_mismatch_is_rejected() {
        let mission_id = Uuid::new_v4();
        let receipt = json!({
            "schema": RECEIPT_SCHEMA,
            "origin": "synthetic",
            "mission_id": mission_id,
            "event_id": "event",
            "idempotency_key": format!("{mission_id}:event"),
            "source_digest": "wrong",
            "source_receipt": {
                "schema": "genos.synthetic-animal-receipt/v1",
                "origin": "synthetic",
                "event_id": "event",
            }
        });
        assert!(verify_receipt(receipt, mission_id).unwrap_err().contains("digest mismatch"));
    }

    #[test]
    fn digest_is_bound_to_mission_identity() {
        let source = json!({
            "schema": "genos.synthetic-animal-receipt/v1",
            "origin": "synthetic",
            "event_id": "event",
        });
        let first = Uuid::parse_str("00000000-0000-0000-0000-000000000001").unwrap();
        let second = Uuid::parse_str("00000000-0000-0000-0000-000000000002").unwrap();
        assert_ne!(digest(first, &source).unwrap(), digest(second, &source).unwrap());
    }
}

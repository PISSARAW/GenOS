use genos_orchestrator::genos_store::BiologicalReceiptStore;
use genos_orchestrator::sensory_receipt_runtime::read_verified_synthetic_sensory_envelopes;
use uuid::Uuid;

pub(super) fn existing_replay(
    store: &BiologicalReceiptStore,
    mission_id: Uuid,
    source: &serde_json::Value,
) -> Result<Option<serde_json::Value>, String> {
    let event_id = source["event_id"]
        .as_str()
        .ok_or("sensory source has no event id")?;
    let existing = read_verified_synthetic_sensory_envelopes(store, mission_id)?
        .into_iter()
        .find(|receipt| receipt["event_id"] == event_id);
    if let Some(receipt) = existing {
        if stable_source(&receipt["source_receipt"]) != stable_source(source) {
            return Err("Idempotency key already exists with different receipt content".into());
        }
        return Ok(Some(receipt));
    }
    Ok(None)
}

fn stable_source(source: &serde_json::Value) -> serde_json::Value {
    let mut stable = source.clone();
    if let Some(provenance) = stable
        .get_mut("provenance")
        .and_then(|value| value.as_object_mut())
    {
        provenance.remove("capture_id");
        provenance.remove("observed_at_epoch_ms");
    }
    stable
}

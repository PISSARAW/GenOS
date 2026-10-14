//! Mission-bound durable receipts for perspective-selected Iridophore output.

use crate::GenosEcosystem;
use genos_biology::ObserverPerspective;
use genos_store::BiologicalReceiptStore;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use uuid::Uuid;

const RECEIPT_SCHEMA: &str = "genos.iridophore-render-receipt/v2";

impl GenosEcosystem {
    /// Render for one observer perspective and persist the exact selected output.
    pub fn render_polymorphic_and_persist(
        &mut self,
        raw_data: &str,
        perspective: &ObserverPerspective,
        store: &BiologicalReceiptStore,
    ) -> Result<Value, String> {
        let mission_id = self
            .mission_id
            .ok_or_else(|| "Iridophore render receipt requires a mission id".to_string())?;
        let rendered = self.render_polymorphic(raw_data, perspective);
        let perspective_value = serde_json::to_value(perspective).map_err(|error| error.to_string())?;
        let render_sha256 = render_digest(&perspective_value, &rendered)?;
        let rendered_bytes = rendered.len();
        let idempotency_key = format!("{mission_id}:{render_sha256}");
        let receipt = json!({
            "schema": RECEIPT_SCHEMA,
            "missionId": mission_id,
            "cellId": self.iridophore.id,
            "perspective": perspective_value,
            "rendered": rendered,
            "renderedBytes": rendered_bytes,
            "renderSha256": render_sha256,
            "idempotency_key": idempotency_key,
            "camouflageIsCryptographic": false,
        });
        let persisted = store.append_idempotent_receipt(&receipt)?;
        verify_receipt(&persisted, mission_id)?;
        Ok(persisted)
    }
}

/// Recover verified render outputs for one mission after reopening the journal.
pub fn read_iridophore_receipts(
    store: &BiologicalReceiptStore,
    mission_id: Uuid,
) -> Result<Vec<Value>, String> {
    store.read_all()?.into_iter()
        .filter(|receipt| receipt["schema"] == RECEIPT_SCHEMA && receipt["missionId"] == mission_id.to_string())
        .map(|receipt| {
            verify_receipt(&receipt, mission_id)?;
            Ok(receipt)
        })
        .collect()
}

fn verify_receipt(receipt: &Value, mission_id: Uuid) -> Result<(), String> {
    if receipt["schema"] != RECEIPT_SCHEMA || receipt["missionId"] != mission_id.to_string() {
        return Err("Iridophore receipt mission or schema mismatch".into());
    }
    let perspective = &receipt["perspective"];
    let rendered = receipt["rendered"].as_str()
        .ok_or_else(|| "Iridophore receipt has no rendered output".to_string())?;
    if receipt["renderedBytes"].as_u64() != Some(rendered.len() as u64) {
        return Err("Iridophore rendered output length mismatch".into());
    }
    let digest = render_digest(perspective, rendered)?;
    if receipt["renderSha256"].as_str() != Some(digest.as_str()) {
        return Err("Iridophore rendered output digest mismatch".into());
    }
    if receipt["idempotency_key"] != format!("{mission_id}:{digest}") {
        return Err("Iridophore receipt idempotency identity mismatch".into());
    }
    Ok(())
}

fn render_digest(perspective: &Value, rendered: &str) -> Result<String, String> {
    let material = json!({ "perspective": perspective, "rendered": rendered });
    let encoded = serde_json::to_vec(&material).map_err(|error| error.to_string())?;
    Ok(format!("{:x}", Sha256::digest(encoded)))
}

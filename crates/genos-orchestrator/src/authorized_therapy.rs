use crate::GenosEcosystem;
use genos_biology::therapy::{SystemicTherapy, apply_systemic_therapy_to_cell};
use genos_store::BiologicalReceiptStore;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use uuid::Uuid;

#[derive(Clone, Serialize, Deserialize)]
pub struct TherapyAuthorization {
    pub authorization_id: Uuid,
    pub mission_id: Uuid,
    pub cell_id: Uuid,
    pub genome_id: Uuid,
    pub genome_fingerprint: String,
    pub cell_state_digest: String,
    pub source_receipt_id: Uuid,
    pub therapy_json: String,
    pub approver_id: String,
    pub expires_at_unix_ms: u64,
    pub signature: String,
}

impl TherapyAuthorization {
    pub fn expected_signature(&self, secret: &str) -> String {
        let fields = [
            "genos.therapy-authorization/v1".into(),
            self.authorization_id.to_string(),
            self.mission_id.to_string(),
            self.cell_id.to_string(),
            self.genome_id.to_string(),
            self.genome_fingerprint.clone(),
            self.cell_state_digest.clone(),
            self.source_receipt_id.to_string(),
            self.therapy_json.clone(),
            self.approver_id.clone(),
            self.expires_at_unix_ms.to_string(),
        ];
        crate::durable_receipts::hmac_sha256(secret.as_bytes(), fields.join("\0").as_bytes())
    }

    fn verify_signature(&self) -> Result<(), String> {
        let secret = std::env::var("GENOS_THERAPY_AUTH_SECRET")
            .map_err(|_| "therapy authority unavailable")?;
        if secret.trim().is_empty() {
            return Err("therapy authority unavailable".into());
        }
        let expected = self.expected_signature(&secret);
        let mismatch = expected
            .bytes()
            .zip(self.signature.bytes())
            .fold(0u8, |v, (a, b)| v | (a ^ b));
        if self.signature.len() != expected.len()
            || mismatch != 0
            || self.approver_id.trim().is_empty()
        {
            return Err("therapy authorization invalid".into());
        }
        Ok(())
    }
}

impl GenosEcosystem {
    pub fn apply_authorized_therapy(
        &mut self,
        auth: &TherapyAuthorization,
        store: &BiologicalReceiptStore,
    ) -> Result<Value, String> {
        auth.verify_signature()?;
        let entries = store.read_all()?;
        if let Some(receipt) = previous_application(&entries, auth)? {
            return Ok(receipt);
        }
        self.validate_therapy_target(auth, &entries)?;
        let therapy: SystemicTherapy =
            serde_json::from_str(&auth.therapy_json).map_err(|e| e.to_string())?;
        let mut cell = self.orchestrator.active_cells[&auth.cell_id].clone();
        let outcome = apply_systemic_therapy_to_cell(&therapy, &mut cell);
        let administered = outcome.status == genos_biology::therapy::TherapyStatus::Applied;
        let next_tick = self.receipt_tick + 1;
        let population = self.therapy_population(auth.cell_id, &cell, next_tick)?;
        let receipt = json!({
            "schema": "genos.clinical-application/v1", "receipt_id": Uuid::new_v4(),
            "authorization": auth, "mission_id": auth.mission_id, "cell_id": auth.cell_id,
            "genome_id": auth.genome_id, "genome_fingerprint": auth.genome_fingerprint,
            "status": outcome.status, "treatment_administered": administered,
            "outcome": outcome, "cell_state_after": cell,
            "tick": next_tick, "population_json": population.to_string()
        });
        store.append_receipts(&[receipt.clone(), population])?;
        self.orchestrator.active_cells.insert(auth.cell_id, cell);
        self.receipt_tick = next_tick;
        Ok(receipt)
    }

    fn therapy_population(
        &self,
        cell_id: Uuid,
        cell: &genos_cell::AgentCell,
        tick: u64,
    ) -> Result<Value, String> {
        let mut population = self.population_state_receipt(tick)?;
        let item = population["active_cells"]
            .as_array_mut()
            .ok_or("population missing")?
            .iter_mut()
            .find(|item| item["cell_id"] == cell_id.to_string())
            .ok_or("cell missing")?;
        item["cell_state"] = serde_json::to_value(cell).map_err(|e| e.to_string())?;
        item["cell_state_json"] = Value::String(item["cell_state"].to_string());
        Ok(population)
    }

    fn validate_therapy_freshness(&self, auth: &TherapyAuthorization) -> Result<(), String> {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|e| e.to_string())?
            .as_millis();
        if u128::from(auth.expires_at_unix_ms) <= now || self.mission_id != Some(auth.mission_id) {
            return Err("therapy authorization expired or wrong mission".into());
        }
        Ok(())
    }

    fn validate_therapy_target(
        &self,
        auth: &TherapyAuthorization,
        entries: &[Value],
    ) -> Result<(), String> {
        self.validate_therapy_freshness(auth)?;
        let cell = self
            .orchestrator
            .active_cells
            .get(&auth.cell_id)
            .ok_or("therapy cell not found")?;
        let genome = self
            .orchestrator
            .genomes
            .get(&auth.genome_id)
            .ok_or("therapy genome not found")?;
        if cell.genome_id != Some(auth.genome_id)
            || genome.fingerprint()?.content_hash != auth.genome_fingerprint
        {
            return Err("therapy genome mismatch".into());
        }
        let encoded = serde_json::to_value(cell)
            .map_err(|e| e.to_string())?
            .to_string();
        if format!("{:x}", Sha256::digest(encoded.as_bytes())) != auth.cell_state_digest {
            return Err("therapy cell state changed".into());
        }
        let source = entries.iter().find(|entry| {
            entry["receipt_id"] == auth.source_receipt_id.to_string()
                && entry["mission_id"] == auth.mission_id.to_string()
        });
        if !source.is_some_and(|entry| source_receipt_matches_target(entry, auth)) {
            return Err("therapy source receipt missing or target state mismatch".into());
        }
        Ok(())
    }
}

fn source_receipt_matches_target(receipt: &Value, auth: &TherapyAuthorization) -> bool {
    let population = match receipt["schema"].as_str() {
        Some("genos.population-state/v1") => Some(receipt.clone()),
        Some("genos.biological-execution-receipt/v1") => receipt["population_json"]
            .as_str()
            .and_then(|snapshot| serde_json::from_str(snapshot).ok()),
        _ => None,
    };
    population
        .as_ref()
        .and_then(|snapshot| snapshot["active_cells"].as_array())
        .into_iter()
        .flatten()
        .any(|item| {
            if item["cell_id"] != auth.cell_id.to_string()
                || item["genome_id"] != auth.genome_id.to_string()
                || item["genome_fingerprint"] != auth.genome_fingerprint
            {
                return false;
            }
            serde_json::to_string(&item["cell_state"])
                .ok()
                .is_some_and(|state| format!("{:x}", Sha256::digest(state.as_bytes())) == auth.cell_state_digest)
        })
}

fn previous_application(
    entries: &[Value],
    auth: &TherapyAuthorization,
) -> Result<Option<Value>, String> {
    let previous = entries.iter().find(|entry| {
        entry["schema"] == "genos.clinical-application/v1"
            && entry["authorization"]["authorization_id"] == auth.authorization_id.to_string()
    });
    let Some(previous) = previous else {
        return Ok(None);
    };
    if previous["authorization"] != serde_json::to_value(auth).map_err(|e| e.to_string())? {
        return Err("therapy authorization id conflict".into());
    }
    Ok(Some(previous.clone()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn authorization(cell_state: &Value) -> TherapyAuthorization {
        TherapyAuthorization {
            authorization_id: Uuid::nil(),
            mission_id: Uuid::nil(),
            cell_id: Uuid::from_u128(1),
            genome_id: Uuid::from_u128(2),
            genome_fingerprint: "genome-fingerprint".into(),
            cell_state_digest: format!("{:x}", Sha256::digest(cell_state.to_string().as_bytes())),
            source_receipt_id: Uuid::from_u128(3),
            therapy_json: "null".into(),
            approver_id: "test".into(),
            expires_at_unix_ms: 1,
            signature: String::new(),
        }
    }

    #[test]
    fn clinical_source_receipt_must_prove_the_authorized_target_state() {
        let cell_state = serde_json::json!({ "clinical": { "markers": { "load": 0.75 } } });
        let auth = authorization(&cell_state);
        let snapshot = serde_json::json!({
            "schema": "genos.population-state/v1",
            "active_cells": [{
                "cell_id": auth.cell_id,
                "genome_id": auth.genome_id,
                "genome_fingerprint": auth.genome_fingerprint,
                "cell_state": cell_state
            }]
        });
        assert!(source_receipt_matches_target(&snapshot, &auth));

        let mut unrelated = snapshot;
        unrelated["active_cells"] = serde_json::json!([]);
        assert!(!source_receipt_matches_target(&unrelated, &auth));
    }
}

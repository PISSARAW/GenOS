use crate::GenosEcosystem;
use genos_store::BiologicalReceiptStore;
use genos_biology::therapy::{SystemicTherapy, apply_systemic_therapy_to_cell};
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
        let fields = ["genos.therapy-authorization/v1".into(), self.authorization_id.to_string(),
            self.mission_id.to_string(), self.cell_id.to_string(), self.genome_id.to_string(),
            self.genome_fingerprint.clone(), self.cell_state_digest.clone(), self.source_receipt_id.to_string(),
            self.therapy_json.clone(), self.approver_id.clone(), self.expires_at_unix_ms.to_string()];
        crate::durable_receipts::hmac_sha256(secret.as_bytes(), fields.join("\0").as_bytes())
    }

    fn verify_signature(&self) -> Result<(), String> {
        let secret = std::env::var("GENOS_THERAPY_AUTH_SECRET").map_err(|_| "therapy authority unavailable")?;
        if secret.trim().is_empty() { return Err("therapy authority unavailable".into()); }
        let expected = self.expected_signature(&secret);
        let mismatch = expected.bytes().zip(self.signature.bytes()).fold(0u8, |v,(a,b)| v | (a ^ b));
        if self.signature.len() != expected.len() || mismatch != 0 || self.approver_id.trim().is_empty() {
            return Err("therapy authorization invalid".into());
        }
        Ok(())
    }
}

impl GenosEcosystem {
    pub fn apply_authorized_therapy(&mut self, auth: &TherapyAuthorization, store: &BiologicalReceiptStore) -> Result<Value, String> {
        auth.verify_signature()?;
        let entries = store.read_all()?;
        if let Some(receipt) = previous_application(&entries, auth)? { return Ok(receipt); }
        self.validate_therapy_target(auth, &entries)?;
        let therapy: SystemicTherapy = serde_json::from_str(&auth.therapy_json).map_err(|e| e.to_string())?;
        let mut cell = self.orchestrator.active_cells[&auth.cell_id].clone();
        let outcome = apply_systemic_therapy_to_cell(&therapy, &mut cell);
        if outcome.message.starts_with("Traitement refus") { return Err(outcome.message); }
        let next_tick = self.receipt_tick + 1;
        let population = self.therapy_population(auth.cell_id, &cell, next_tick)?;
        let receipt = json!({
            "schema": "genos.clinical-application/v1", "receipt_id": Uuid::new_v4(),
            "authorization": auth, "mission_id": auth.mission_id, "cell_id": auth.cell_id,
            "genome_id": auth.genome_id, "genome_fingerprint": auth.genome_fingerprint,
            "status": "applied", "outcome": outcome, "cell_state_after": cell,
            "tick": next_tick, "population_json": population.to_string()
        });
        store.append_receipts(&[receipt.clone(), population])?;
        self.orchestrator.active_cells.insert(auth.cell_id, cell);
        self.receipt_tick = next_tick;
        Ok(receipt)
    }

    fn therapy_population(&self, cell_id: Uuid, cell: &genos_cell::AgentCell, tick: u64) -> Result<Value, String> {
        let mut population = self.population_state_receipt(tick)?;
        let item = population["active_cells"].as_array_mut().ok_or("population missing")?.iter_mut()
            .find(|item| item["cell_id"] == cell_id.to_string()).ok_or("cell missing")?;
        item["cell_state"] = serde_json::to_value(cell).map_err(|e| e.to_string())?;
        item["cell_state_json"] = Value::String(item["cell_state"].to_string());
        Ok(population)
    }

    fn validate_therapy_target(&self, auth: &TherapyAuthorization, entries: &[Value]) -> Result<(), String> {
        let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|e| e.to_string())?.as_millis();
        if u128::from(auth.expires_at_unix_ms) <= now || self.mission_id != Some(auth.mission_id) {
            return Err("therapy authorization expired or wrong mission".into());
        }
        let cell = self.orchestrator.active_cells.get(&auth.cell_id).ok_or("therapy cell not found")?;
        let genome = self.orchestrator.genomes.get(&auth.genome_id).ok_or("therapy genome not found")?;
        if cell.genome_id != Some(auth.genome_id) || genome.fingerprint()?.content_hash != auth.genome_fingerprint {
            return Err("therapy genome mismatch".into());
        }
        let encoded = serde_json::to_value(cell).map_err(|e| e.to_string())?.to_string();
        if format!("{:x}",Sha256::digest(encoded.as_bytes())) != auth.cell_state_digest {
            return Err("therapy cell state changed".into());
        }
        if !entries.iter().any(|entry| entry["receipt_id"] == auth.source_receipt_id.to_string()
            && entry["mission_id"] == auth.mission_id.to_string()) { return Err("therapy source receipt missing".into()); }
        Ok(())
    }
}

fn previous_application(entries: &[Value], auth: &TherapyAuthorization) -> Result<Option<Value>, String> {
    let previous = entries.iter().find(|entry| entry["schema"] == "genos.clinical-application/v1"
        && entry["authorization"]["authorization_id"] == auth.authorization_id.to_string());
    let Some(previous) = previous else { return Ok(None); };
    if previous["authorization"] != serde_json::to_value(auth).map_err(|e| e.to_string())? {
        return Err("therapy authorization id conflict".into());
    }
    Ok(Some(previous.clone()))
}

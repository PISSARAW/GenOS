//! Durable receipt boundary for mission ticks.

use crate::GenosEcosystem;
use crate::planner::Goal;
use crate::tick::TickReport;
use genos_store::BiologicalReceiptStore;

#[cfg(feature = "api")]
use reqwest::blocking::Client;
#[cfg(feature = "api")]
use serde_json::{Value, json};
#[cfg(feature = "api")]
use sha2::{Digest, Sha256};
#[cfg(feature = "api")]
use std::time::{Duration, SystemTime, UNIX_EPOCH};

#[cfg(feature = "api")]
struct BackendReceiptConfig {
    endpoint: String,
    token: String,
    organization_id: String,
    project_id: String,
    signing_secret: String,
}

#[cfg(feature = "api")]
struct ReceiptAuthContext<'a> {
    timestamp: &'a str,
    nonce: &'a str,
}

#[cfg(feature = "api")]
impl BackendReceiptConfig {
    fn from_env() -> Result<Option<Self>, String> {
        let names = [
            "GENOS_BACKEND_URL", "GENOS_RUST_RECEIPT_TOKEN", "GENOS_RUST_RECEIPT_ORG_ID",
            "GENOS_RUST_RECEIPT_PROJECT_ID", "GENOS_RUST_RECEIPT_SECRET",
        ];
        let values: Vec<_> = names.iter().map(|name| std::env::var(name).ok()).collect();
        if values.iter().all(Option::is_none) { return Ok(None); }
        if values.iter().any(|value| value.as_deref().unwrap_or_default().trim().is_empty()) {
            return Err("Rust receipt upload requires GENOS_BACKEND_URL, token, org, project, and signing secret.".into());
        }
        let value = |index: usize| values[index].as_ref().unwrap().trim().to_string();
        let base = value(0).trim_end_matches('/').to_string();
        let endpoint = if base.ends_with("/api/rust/biological-receipts") {
            base
        } else {
            format!("{base}/api/rust/biological-receipts")
        };
        Ok(Some(Self {
            endpoint, token: value(1), organization_id: value(2), project_id: value(3), signing_secret: value(4),
        }))
    }
}

/// Tick persistence failure retains the report because execution already ran.
#[derive(Debug)]
pub struct TickPersistenceError {
    pub report: TickReport,
    pub message: String,
}

impl GenosEcosystem {
    /// Run one tick and durably append its biological receipts before returning.
    pub fn tick_and_persist(
        &mut self,
        goal: &Goal,
        store: &BiologicalReceiptStore,
    ) -> Result<TickReport, TickPersistenceError> {
        self.tick_and_persist_with_receipts(goal, store)
            .map(|(report, _)| report)
    }

    /// Persist a tick and return the exact receipt batch that was journaled.
    /// The population snapshot gets a fresh id because a restarted CLI process
    /// can begin at the same local event count for a still-running mission.
    pub fn tick_and_persist_with_receipts(
        &mut self,
        goal: &Goal,
        store: &BiologicalReceiptStore,
    ) -> Result<(TickReport, Vec<serde_json::Value>), TickPersistenceError> {
        let report = self.tick(goal);
        let mut receipts = report
            .biological_receipts
            .iter()
            .map(serde_json::to_value)
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| TickPersistenceError {
                report: report.clone(),
                message: error.to_string(),
            })?;
        let mut population = self
            .population_state_receipt(report.tick)
            .map_err(|message| TickPersistenceError {
                report: report.clone(),
                message,
            })?;
        population["receipt_id"] = serde_json::Value::String(uuid::Uuid::new_v4().to_string());
        receipts.push(population);
        store.append_receipts(&receipts)
            .map_err(|message| TickPersistenceError { report: report.clone(), message })?;
        #[cfg(feature = "api")]
        if let Some(config) = BackendReceiptConfig::from_env()
            .map_err(|message| TickPersistenceError { report: report.clone(), message })?
        {
            flush_receipts_to_backend(store, &config)
                .map_err(|message| TickPersistenceError { report: report.clone(), message })?;
        }
        Ok((report, receipts))
    }
}

#[cfg(feature = "api")]
fn flush_receipts_to_backend(store: &BiologicalReceiptStore, config: &BackendReceiptConfig) -> Result<(), String> {
    let receipts = store.read_all()?;
    let client = Client::builder().timeout(Duration::from_secs(15)).build().map_err(|error| error.to_string())?;
    for receipt in receipts.into_iter().filter(|item| item["schema"] == "genos.biological-execution-receipt/v1") {
        let timestamp = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs().to_string();
        let nonce = uuid::Uuid::new_v4().to_string();
        let auth = ReceiptAuthContext { timestamp: &timestamp, nonce: &nonce };
        let signature = sign_receipt(&receipt, &config.signing_secret, &auth)?;
        client.post(&config.endpoint)
            .bearer_auth(&config.token)
            .header("x-organization-id", &config.organization_id)
            .header("x-project-id", &config.project_id)
            .header("x-genos-receipt-origin", "genos-rust-orchestrator")
            .header("x-genos-receipt-timestamp", &timestamp)
            .header("x-genos-receipt-nonce", &nonce)
            .header("x-genos-receipt-signature", signature)
            .json(&json!({ "receipt": receipt }))
            .send().map_err(|error| error.to_string())?
            .error_for_status().map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[cfg(feature = "api")]
fn sign_receipt(receipt: &Value, secret: &str, auth: &ReceiptAuthContext<'_>) -> Result<String, String> {
    let fields = [
        text_field(receipt, "schema"), text_field(receipt, "receipt_id"), text_field(receipt, "mission_id"),
        text_field(receipt, "cell_id"), text_field(receipt, "genome_id"), text_field(receipt, "genome_fingerprint"),
        text_field(receipt, "tick"), text_field(receipt, "execution_scope"), text_field(receipt, "operation"),
        text_field(receipt, "metabolic_register"), cost_bits(receipt)?, text_field(receipt, "cost_unit"),
        text_field(receipt, "consumed"), text_field(receipt, "completed"), text_field(receipt, "observed_at_unix_ms"),
    ];
    let mut message = vec!["genos-rust-orchestrator", auth.timestamp, auth.nonce];
    message.extend(fields.iter().map(String::as_str));
    Ok(hmac_sha256(secret.as_bytes(), message.join("\0").as_bytes()))
}

#[cfg(feature = "api")]
fn text_field(receipt: &Value, field: &str) -> String {
    receipt.get(field).filter(|value| !value.is_null()).map(Value::to_string)
        .map(|text| text.trim_matches('"').to_string()).unwrap_or_default()
}

#[cfg(feature = "api")]
fn cost_bits(receipt: &Value) -> Result<String, String> {
    receipt.get("cost").and_then(Value::as_f64)
        .map(|value| value.to_bits().to_string()).ok_or_else(|| "Receipt cost is not numeric.".to_string())
}

#[cfg(feature = "api")]
fn hmac_sha256(secret: &[u8], message: &[u8]) -> String {
    let mut key = if secret.len() > 64 { Sha256::digest(secret).to_vec() } else { secret.to_vec() };
    key.resize(64, 0);
    let mut inner = Vec::with_capacity(64 + message.len());
    let mut outer = Vec::with_capacity(96);
    for byte in &key { inner.push(byte ^ 0x36); outer.push(byte ^ 0x5c); }
    inner.extend_from_slice(message);
    outer.extend_from_slice(&Sha256::digest(inner));
    format!("{:x}", Sha256::digest(outer))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::genos_cell::AgentCell;

    #[test]
    fn persisted_tick_contains_population_snapshot_for_restart_recovery() {
        let path =
            std::env::temp_dir().join(format!("genos-population-{}.jsonl", uuid::Uuid::new_v4()));
        let store = BiologicalReceiptStore::open(&path);
        let mut ecosystem = GenosEcosystem::new("durable-population");
        let mission_id = uuid::Uuid::new_v4();
        ecosystem.set_mission_id(mission_id);
        let root_cell = ecosystem.orchestrator.orchestrator_id;
        let root_genome = ecosystem.seed_germline(root_cell, "DURABLE_ROOT").unwrap();
        let root_fingerprint = ecosystem.orchestrator.genomes[&root_genome]
            .fingerprint()
            .unwrap()
            .content_hash;
        ecosystem
            .orchestrator
            .create_tissue("Arena", "Exec")
            .unwrap();
        let cell = ecosystem
            .orchestrator
            .add_worker("Arena", AgentCell::new("cell", "w", "Soma"))
            .unwrap();
        ecosystem.seed_germline(cell, "DURABLE_POPULATION").unwrap();
        ecosystem.feed(100.0);

        let report = ecosystem.tick_and_persist(&Goal::Explore, &store).unwrap();
        assert!(
            !report.biological_receipts.is_empty(),
            "the real tick must emit at least one execution receipt"
        );
        let restored = BiologicalReceiptStore::open(&path).read_all().unwrap();
        assert!(
            restored
                .iter()
                .any(|receipt| receipt["schema"] == "genos.population-state/v1")
        );
        let tick_receipt = restored
            .iter()
            .find(|receipt| receipt["schema"] == "genos.biological-execution-receipt/v1")
            .expect("tick receipt persisted");
        assert_eq!(tick_receipt["mission_id"], mission_id.to_string());
        assert_eq!(tick_receipt["cell_id"], root_cell.to_string());
        assert_eq!(tick_receipt["genome_id"], root_genome.to_string());
        assert_eq!(tick_receipt["genome_fingerprint"], root_fingerprint);
        assert!(tick_receipt["cost"].as_f64().unwrap() > 0.0);
        assert_eq!(tick_receipt["cost_unit"], "atp_token");
        assert_eq!(tick_receipt["consumed"], true);
        assert!(
            report
                .biological_receipts
                .iter()
                .any(|receipt| receipt.receipt_id.to_string()
                    == tick_receipt["receipt_id"].as_str().unwrap())
        );
        let _ = std::fs::remove_file(path);
    }

    #[cfg(feature = "api")]
    #[test]
    fn rust_origin_signature_matches_backend_contract() {
        let receipt = serde_json::json!({
            "schema": "genos.biological-execution-receipt/v1",
            "receipt_id": "11111111-1111-4111-8111-111111111111",
            "mission_id": "22222222-2222-4222-8222-222222222222",
            "cell_id": null,
            "genome_id": null,
            "genome_fingerprint": null,
            "tick": 4,
            "execution_scope": "organism",
            "operation": "Observe",
            "metabolic_register": "rust_orchestrator_metabolism",
            "cost": 1.0,
            "cost_unit": "atp_token",
            "consumed": true,
            "completed": true,
            "observed_at_unix_ms": 1234
        });
        let auth = ReceiptAuthContext {
            timestamp: "1790798400", nonce: "33333333-3333-4333-8333-333333333333",
        };
        let signature = sign_receipt(&receipt, "shared-test-secret", &auth).unwrap();
        assert_eq!(signature, "9f1aa5c884d02b0af7c9955434a29dce25f7d47d1f48a32aae8e1ba2574b1f1c");
    }
}

//! Mission-bound durable receipts for supplied choanocyte streams.

use crate::GenosEcosystem;
use genos_biology::RawSignalPacket;
use genos_store::BiologicalReceiptStore;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::time::Instant;

const RECEIPT_SCHEMA: &str = "genos.choanocyte-stream-receipt/v2";

impl GenosEcosystem {
    /// Filter the caller-supplied packets and append their measured mission receipt.
    pub fn filter_stream_and_persist(
        &mut self,
        packets: &[RawSignalPacket],
        store: &BiologicalReceiptStore,
    ) -> Result<Value, String> {
        let mission_id = self
            .mission_id
            .ok_or_else(|| "Choanocyte stream receipt requires a mission id".to_string())?;
        let input_digest = digest_packets(packets)?;
        let started = Instant::now();
        let result = self.filter_stream(packets);
        let elapsed_ns = started.elapsed().as_nanos().max(1);
        let receipt = json!({
            "schema": RECEIPT_SCHEMA,
            "receiptId": uuid::Uuid::new_v4(),
            "missionId": mission_id,
            "cellId": self.choanocyte.id,
            "inputSha256": input_digest,
            "packetCount": result.total_scanned,
            "retainedCount": result.retained_signals.len(),
            "rejectedCount": result.rejected_noise_count,
            "measuredElapsedNs": elapsed_ns,
            "measuredPacketsPerSecond": result.total_scanned as f64 * 1_000_000_000.0 / elapsed_ns as f64,
            "modeledFlow": result.generated_flow,
            "hydrodynamicMeasurement": false,
        });
        store.append_receipts(std::slice::from_ref(&receipt))?;
        verify_persisted_receipt(store, &receipt)?;
        Ok(receipt)
    }
}

fn digest_packets(packets: &[RawSignalPacket]) -> Result<String, String> {
    let encoded = serde_json::to_vec(packets).map_err(|error| error.to_string())?;
    Ok(format!("{:x}", Sha256::digest(encoded)))
}

fn verify_persisted_receipt(
    store: &BiologicalReceiptStore,
    expected: &Value,
) -> Result<(), String> {
    let receipts = store.read_all()?;
    if receipts.iter().any(|receipt| receipt == expected) {
        return Ok(());
    }
    Err("Choanocyte receipt was not readable from the durable journal".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn persisted_receipt_binds_actual_stream_to_mission_and_survives_reopen() {
        let path = std::env::temp_dir().join(format!("genos-choano-{}.jsonl", uuid::Uuid::new_v4()));
        let packets = [
            RawSignalPacket { id: "retained-1".into(), size_nm: 150.0, semantic_density: 0.9, content: "signal-a".into(), is_noise: false },
            RawSignalPacket { id: "noise-1".into(), size_nm: 40.0, semantic_density: 0.1, content: "signal-b".into(), is_noise: true },
            RawSignalPacket { id: "retained-2".into(), size_nm: 180.0, semantic_density: 0.7, content: "signal-c".into(), is_noise: false },
        ];
        let mission_id = uuid::Uuid::new_v4();
        let receipt = {
            let store = BiologicalReceiptStore::open(&path);
            let mut ecosystem = GenosEcosystem::new("choanocyte-mission");
            ecosystem.set_mission_id(mission_id);
            ecosystem.filter_stream_and_persist(&packets, &store).unwrap()
        };

        let reopened = BiologicalReceiptStore::open(&path);
        let recovered = reopened.read_all().unwrap();
        let stored = recovered.iter().find(|item| item["receiptId"] == receipt["receiptId"]).unwrap();
        assert_eq!(stored["schema"], RECEIPT_SCHEMA);
        assert_eq!(stored["missionId"], mission_id.to_string());
        assert_eq!(stored["inputSha256"], digest_packets(&packets).unwrap());
        assert_eq!(stored["packetCount"], 3);
        assert_eq!(stored["retainedCount"], 2);
        assert_eq!(stored["rejectedCount"], 1);
        assert!(stored["measuredElapsedNs"].as_u64().unwrap() > 0);
        assert!(stored["measuredPacketsPerSecond"].as_f64().unwrap() > 0.0);
        assert_eq!(stored["hydrodynamicMeasurement"], false);
        assert_eq!(recovered.len(), 1);
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn stream_receipt_refuses_unbound_mission() {
        let path = std::env::temp_dir().join(format!("genos-choano-{}.jsonl", uuid::Uuid::new_v4()));
        let store = BiologicalReceiptStore::open(&path);
        let mut ecosystem = GenosEcosystem::new("unbound-choanocyte");
        assert!(ecosystem.filter_stream_and_persist(&[], &store).is_err());
        assert!(store.read_all().unwrap().is_empty());
        let _ = std::fs::remove_file(path);
    }
}

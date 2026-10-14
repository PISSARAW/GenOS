//! Mission-bound durable receipts for supplied choanocyte streams.

use crate::GenosEcosystem;
use genos_biology::RawSignalPacket;
use genos_store::BiologicalReceiptStore;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::time::Instant;

const RECEIPT_SCHEMA: &str = "genos.choanocyte-stream-receipt/v2";
const STREAM_SCHEMA: &str = "genos.choanocyte-signal-stream/v1";

/// Typed caller-supplied signal stream scoped by a declared producer identity.
#[derive(Debug, Clone, serde::Deserialize, serde::Serialize)]
#[serde(deny_unknown_fields)]
#[serde(rename_all = "camelCase")]
pub struct MissionChoanocyteStream {
    pub schema: String,
    pub producer_id: String,
    pub packets: Vec<RawSignalPacket>,
}

impl MissionChoanocyteStream {
    pub fn new(producer_id: impl Into<String>, packets: Vec<RawSignalPacket>) -> Self {
        Self { schema: STREAM_SCHEMA.into(), producer_id: producer_id.into(), packets }
    }

    fn validate(&self) -> Result<(), String> {
        validate_stream_identity(&self.schema, &self.producer_id)?;
        validate_packets(&self.packets)
    }
}

fn validate_stream_identity(schema: &str, producer_id: &str) -> Result<(), String> {
    if schema != STREAM_SCHEMA || producer_id.trim().is_empty() {
        return Err("Choanocyte stream requires the supported schema and producer identity".into());
    }
    Ok(())
}

fn validate_packets(packets: &[RawSignalPacket]) -> Result<(), String> {
    let mut ids = std::collections::HashSet::new();
    for packet in packets {
        validate_packet_identity(&packet.id, &mut ids)?;
        validate_packet_measurements(packet)?;
    }
    Ok(())
}

fn validate_packet_identity(
    packet_id: &str,
    ids: &mut std::collections::HashSet<String>,
) -> Result<(), String> {
    if packet_id.trim().is_empty() || !ids.insert(packet_id.to_string()) {
        return Err("Choanocyte stream packet identity is invalid or duplicated".into());
    }
    Ok(())
}

fn validate_packet_measurements(packet: &RawSignalPacket) -> Result<(), String> {
    if !packet.size_nm.is_finite() || packet.size_nm <= 0.0 {
        return Err("Choanocyte packet size must be finite and positive".into());
    }
    if !packet.semantic_density.is_finite() || !(0.0..=1.0).contains(&packet.semantic_density) {
        return Err("Choanocyte packet semantic density must be between zero and one".into());
    }
    if packet.content.trim().is_empty() {
        return Err("Choanocyte packet content must not be empty".into());
    }
    Ok(())
}

impl GenosEcosystem {
    /// Filter a typed producer stream and append its measured mission receipt.
    pub fn filter_stream_and_persist(
        &mut self,
        stream: &MissionChoanocyteStream,
        store: &BiologicalReceiptStore,
    ) -> Result<Value, String> {
        stream.validate()?;
        let mission_id = self
            .mission_id
            .ok_or_else(|| "Choanocyte stream receipt requires a mission id".to_string())?;
        let input_digest = digest_stream(stream)?;
        let started = Instant::now();
        let result = self.filter_stream(&stream.packets);
        let elapsed_ns = started.elapsed().as_nanos().max(1);
        let receipt = json!({
            "schema": RECEIPT_SCHEMA,
            "receiptId": uuid::Uuid::new_v4(),
            "missionId": mission_id,
            "cellId": self.choanocyte.id,
            "producerId": stream.producer_id,
            "streamSchema": stream.schema,
            "inputSha256": input_digest,
            "packetCount": result.total_scanned,
            "retainedCount": result.retained_signals.len(),
            "rejectedCount": result.rejected_noise_count,
            "measuredElapsedNs": elapsed_ns,
            "measuredPacketsPerSecondMilli": packets_per_second_milli(result.total_scanned, elapsed_ns),
            "modeledFlowMilliUnits": {
                "flowVelocityMmS": milli_units(result.generated_flow.flow_velocity_mm_s),
                "pumpingRateMlS": milli_units(result.generated_flow.pumping_rate_ml_s),
                "suctionPressurePa": milli_units(result.generated_flow.suction_pressure_pa),
                "flagellarBeatHz": milli_units(result.generated_flow.flagellar_beat_hz),
            },
            "hydrodynamicMeasurement": false,
        });
        store.append_receipts(std::slice::from_ref(&receipt))?;
        verify_persisted_receipt(store, &receipt)?;
        Ok(receipt)
    }
}

fn digest_stream(stream: &MissionChoanocyteStream) -> Result<String, String> {
    let encoded = serde_json::to_vec(stream).map_err(|error| error.to_string())?;
    Ok(format!("{:x}", Sha256::digest(encoded)))
}

fn packets_per_second_milli(packet_count: usize, elapsed_ns: u128) -> u64 {
    let scaled = (packet_count as u128)
        .saturating_mul(1_000_000_000_000)
        .checked_div(elapsed_ns.max(1))
        .unwrap_or(u128::MAX);
    scaled.min(u64::MAX as u128) as u64
}

fn milli_units(value: f64) -> i64 {
    (value * 1000.0).round() as i64
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
        let packets = vec![
            RawSignalPacket { id: "retained-1".into(), size_nm: 150.0, semantic_density: 0.9, content: "signal-a".into(), is_noise: false },
            RawSignalPacket { id: "noise-1".into(), size_nm: 40.0, semantic_density: 0.1, content: "signal-b".into(), is_noise: true },
            RawSignalPacket { id: "retained-2".into(), size_nm: 180.0, semantic_density: 0.7, content: "signal-c".into(), is_noise: false },
        ];
        let stream = MissionChoanocyteStream::new("agent-choano-source", packets.clone());
        let mission_id = uuid::Uuid::new_v4();
        let receipt = {
            let store = BiologicalReceiptStore::open(&path);
            let mut ecosystem = GenosEcosystem::new("choanocyte-mission");
            ecosystem.set_mission_id(mission_id);
            ecosystem.filter_stream_and_persist(&stream, &store).unwrap()
        };

        let reopened = BiologicalReceiptStore::open(&path);
        let recovered = reopened.read_all().unwrap();
        let stored = recovered.iter().find(|item| item["receiptId"] == receipt["receiptId"]).unwrap();
        assert_eq!(stored["schema"], RECEIPT_SCHEMA);
        assert_eq!(stored["missionId"], mission_id.to_string());
        assert_eq!(stored["producerId"], "agent-choano-source");
        assert_eq!(stored["streamSchema"], STREAM_SCHEMA);
        assert_eq!(stored["inputSha256"], digest_stream(&stream).unwrap());
        assert_eq!(stored["packetCount"], 3);
        assert_eq!(stored["retainedCount"], 2);
        assert_eq!(stored["rejectedCount"], 1);
        assert!(stored["measuredElapsedNs"].as_u64().unwrap() > 0);
        assert!(stored["measuredPacketsPerSecondMilli"].as_u64().unwrap() > 0);
        assert_eq!(stored["modeledFlowMilliUnits"]["pumpingRateMlS"], 450);
        assert_eq!(stored["hydrodynamicMeasurement"], false);
        assert_eq!(recovered.len(), 1);
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn stream_receipt_refuses_unbound_mission() {
        let path = std::env::temp_dir().join(format!("genos-choano-{}.jsonl", uuid::Uuid::new_v4()));
        let store = BiologicalReceiptStore::open(&path);
        let mut ecosystem = GenosEcosystem::new("unbound-choanocyte");
        let stream = MissionChoanocyteStream::new("agent-1", vec![]);
        assert!(ecosystem.filter_stream_and_persist(&stream, &store).is_err());
        assert!(store.read_all().unwrap().is_empty());
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn stream_rejects_missing_or_duplicate_packet_identity_before_filtering() {
        let path = std::env::temp_dir().join(format!("genos-choano-{}.jsonl", uuid::Uuid::new_v4()));
        let store = BiologicalReceiptStore::open(&path);
        let mut ecosystem = GenosEcosystem::new("invalid-choanocyte");
        ecosystem.set_mission_id(uuid::Uuid::new_v4());
        let duplicate = RawSignalPacket { id: "same".into(), size_nm: 120.0, semantic_density: 0.5, content: "x".into(), is_noise: false };
        let stream = MissionChoanocyteStream::new("agent-1", vec![duplicate.clone(), duplicate]);
        assert!(ecosystem.filter_stream_and_persist(&stream, &store).is_err());
        assert!(store.read_all().unwrap().is_empty());
        let _ = std::fs::remove_file(path);
    }
}

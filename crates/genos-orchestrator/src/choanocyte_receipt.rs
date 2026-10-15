//! Mission-bound durable receipts for supplied choanocyte streams.

use crate::GenosEcosystem;
use genos_biology::RawSignalPacket;
use genos_store::BiologicalReceiptStore;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::time::Instant;

const RECEIPT_SCHEMA: &str = "genos.choanocyte-stream-receipt/v2";
const STREAM_SCHEMA: &str = "genos.choanocyte-signal-stream/v1";

struct StreamReceiptContext {
    mission_id: uuid::Uuid,
    producer_id: uuid::Uuid,
    input_digest: String,
    idempotency_key: String,
}

/// Typed signal payload; producer identity comes from the runtime, not this input.
#[derive(Debug, Clone, serde::Deserialize, serde::Serialize)]
#[serde(deny_unknown_fields)]
pub struct MissionChoanocyteStream {
    pub schema: String,
    pub packets: Vec<RawSignalPacket>,
}

impl MissionChoanocyteStream {
    pub fn new(packets: Vec<RawSignalPacket>) -> Self {
        Self { schema: STREAM_SCHEMA.into(), packets }
    }

    fn validate(&self) -> Result<(), String> {
        validate_stream_schema(&self.schema)?;
        validate_packets(&self.packets)
    }
}

fn validate_stream_schema(schema: &str) -> Result<(), String> {
    if schema != STREAM_SCHEMA {
        return Err("Choanocyte stream schema is unsupported".into());
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
        let context = stream_receipt_context(self, stream)?;
        if let Some(receipt) = find_existing_stream_receipt(store, &context)? {
            return Ok(receipt);
        }
        let receipt = build_stream_receipt(self, stream, &context);
        persist_stream_receipt(store, receipt, &context)
    }
}

fn stream_receipt_context(
    ecosystem: &GenosEcosystem,
    stream: &MissionChoanocyteStream,
) -> Result<StreamReceiptContext, String> {
    let mission_id = ecosystem
        .mission_id
        .ok_or_else(|| "Choanocyte stream receipt requires a mission id".to_string())?;
    let producer_id = runtime_producer_id(ecosystem)?;
    let input_digest = digest_stream(stream)?;
    let idempotency_key = stream_idempotency_key(mission_id, &input_digest);
    Ok(StreamReceiptContext { mission_id, producer_id, input_digest, idempotency_key })
}

fn build_stream_receipt(
    ecosystem: &mut GenosEcosystem,
    stream: &MissionChoanocyteStream,
    context: &StreamReceiptContext,
) -> Value {
    let started = Instant::now();
    let result = ecosystem.filter_stream(&stream.packets);
    let elapsed_ns = started.elapsed().as_nanos().max(1);
    json!({
            "schema": RECEIPT_SCHEMA,
            "receiptId": uuid::Uuid::new_v4(),
            "missionId": context.mission_id,
            "idempotency_key": context.idempotency_key,
            "orchestratorId": context.producer_id,
            "cellId": ecosystem.choanocyte.id,
            "producerId": context.producer_id,
            "streamSchema": stream.schema,
            "inputSha256": context.input_digest,
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
        })
}

fn find_existing_stream_receipt(
    store: &BiologicalReceiptStore,
    context: &StreamReceiptContext,
) -> Result<Option<Value>, String> {
    let mission_key = context.mission_id.to_string();
    for receipt in store.read_all()? {
        if receipt["schema"] != RECEIPT_SCHEMA
            || receipt["missionId"] != mission_key
            || receipt["inputSha256"] != context.input_digest
        {
            continue;
        }
        if receipt["idempotency_key"]
            .as_str()
            .is_some_and(|key| key != context.idempotency_key)
        {
            return Err("Choanocyte idempotency receipt does not match its mission and stream".into());
        }
        return Ok(Some(receipt));
    }
    Ok(None)
}

fn persist_stream_receipt(
    store: &BiologicalReceiptStore,
    receipt: Value,
    context: &StreamReceiptContext,
) -> Result<Value, String> {
    let persisted = match store.append_idempotent_receipt(&receipt) {
        Ok(persisted) => persisted,
        Err(error) => find_existing_stream_receipt(store, context)?.ok_or(error)?,
    };
    verify_persisted_receipt(store, &persisted)?;
    Ok(persisted)
}

fn stream_idempotency_key(mission_id: uuid::Uuid, input_digest: &str) -> String {
    format!("{mission_id}:{input_digest}")
}

fn runtime_producer_id(ecosystem: &GenosEcosystem) -> Result<uuid::Uuid, String> {
    let producer_id = ecosystem.orchestrator.orchestrator_id;
    let is_active = ecosystem.orchestrator.active_cells
        .get(&producer_id)
        .is_some_and(|cell| cell.cell_id == producer_id);
    if !is_active {
        return Err("Choanocyte producer identity is not an active runtime cell".into());
    }
    Ok(producer_id)
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
        let stream = MissionChoanocyteStream::new(packets.clone());
        let mission_id = uuid::Uuid::new_v4();
        let (receipt, orchestrator_id) = {
            let store = BiologicalReceiptStore::open(&path);
            let mut ecosystem = GenosEcosystem::new("choanocyte-mission");
            ecosystem.set_mission_id(mission_id);
            let receipt = ecosystem.filter_stream_and_persist(&stream, &store).unwrap();
            (receipt, ecosystem.orchestrator.orchestrator_id)
        };

        let reopened = BiologicalReceiptStore::open(&path);
        let recovered = reopened.read_all().unwrap();
        let stored = recovered.iter().find(|item| item["receiptId"] == receipt["receiptId"]).unwrap();
        assert_eq!(stored["schema"], RECEIPT_SCHEMA);
        assert_eq!(stored["missionId"], mission_id.to_string());
        assert_eq!(stored["orchestratorId"], orchestrator_id.to_string());
        assert_eq!(stored["producerId"], orchestrator_id.to_string());
        assert_eq!(stored["cellId"], "orchestrator_choanocyte");
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
    fn same_stream_in_another_mission_gets_a_distinct_receipt() {
        let path = std::env::temp_dir().join(format!("genos-choano-{}.jsonl", uuid::Uuid::new_v4()));
        let store = BiologicalReceiptStore::open(&path);
        let stream = MissionChoanocyteStream::new(vec![RawSignalPacket {
            id: "signal".into(),
            size_nm: 150.0,
            semantic_density: 0.9,
            content: "shared input".into(),
            is_noise: false,
        }]);
        let mut first = GenosEcosystem::new("first-mission");
        first.set_mission_id(uuid::Uuid::new_v4());
        let first_receipt = first.filter_stream_and_persist(&stream, &store).unwrap();
        let mut second = GenosEcosystem::new("second-mission");
        second.set_mission_id(uuid::Uuid::new_v4());
        let second_receipt = second.filter_stream_and_persist(&stream, &store).unwrap();

        assert_ne!(first_receipt["missionId"], second_receipt["missionId"]);
        assert_ne!(first_receipt["idempotency_key"], second_receipt["idempotency_key"]);
        assert_eq!(store.read_all().unwrap().len(), 2);
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn stream_receipt_refuses_unbound_mission() {
        let path = std::env::temp_dir().join(format!("genos-choano-{}.jsonl", uuid::Uuid::new_v4()));
        let store = BiologicalReceiptStore::open(&path);
        let mut ecosystem = GenosEcosystem::new("unbound-choanocyte");
        let stream = MissionChoanocyteStream::new(vec![]);
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
        let stream = MissionChoanocyteStream::new(vec![duplicate.clone(), duplicate]);
        assert!(ecosystem.filter_stream_and_persist(&stream, &store).is_err());
        assert!(store.read_all().unwrap().is_empty());
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn typed_stream_rejects_caller_claimed_producer_identity() {
        let forged = serde_json::json!({
            "schema": STREAM_SCHEMA,
            "producerId": "trusted-worker-42",
            "packets": []
        });
        assert!(serde_json::from_value::<MissionChoanocyteStream>(forged).is_err());
    }

    #[test]
    fn stream_receipt_fails_closed_when_runtime_producer_is_not_active() {
        let path = std::env::temp_dir().join(format!("genos-choano-{}.jsonl", uuid::Uuid::new_v4()));
        let store = BiologicalReceiptStore::open(&path);
        let mut ecosystem = GenosEcosystem::new("inactive-producer");
        ecosystem.set_mission_id(uuid::Uuid::new_v4());
        ecosystem.orchestrator.orchestrator_id = uuid::Uuid::new_v4();
        let stream = MissionChoanocyteStream::new(vec![]);
        assert!(ecosystem.filter_stream_and_persist(&stream, &store).is_err());
        assert!(store.read_all().unwrap().is_empty());
        let _ = std::fs::remove_file(path);
    }
}

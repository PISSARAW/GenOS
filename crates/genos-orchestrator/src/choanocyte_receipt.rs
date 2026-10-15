//! Mission-bound durable receipts for supplied choanocyte streams.

use crate::GenosEcosystem;
use crate::choanocyte_authority::{ChoanocyteProducerAuthority, ProducerProof, signing_bytes};
use genos_biology::RawSignalPacket;
use genos_store::BiologicalReceiptStore;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::time::Instant;

const RECEIPT_SCHEMA: &str = "genos.choanocyte-stream-receipt/v2";
const STREAM_SCHEMA: &str = "genos.choanocyte-signal-stream/v1";

struct StreamReceiptContext {
    mission_id: uuid::Uuid,
    runtime_producer_id: uuid::Uuid,
    external_producer_id: uuid::Uuid,
    input_digest: String,
    trust_key_sha256: String,
    signature_hex: String,
    idempotency_key: String,
}

/// Typed, signed signal payload from an external producer.
#[derive(Debug, Clone, serde::Deserialize, serde::Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct MissionChoanocyteStream {
    pub schema: String,
    pub producer_id: uuid::Uuid,
    pub signature_hex: String,
    pub packets: Vec<RawSignalPacket>,
}

impl MissionChoanocyteStream {
    pub fn new(packets: Vec<RawSignalPacket>) -> Self {
        Self { schema: STREAM_SCHEMA.into(), producer_id: uuid::Uuid::nil(), signature_hex: String::new(), packets }
    }

    /// Octets canonically signed by an external producer for one mission.
    pub fn signing_bytes(&self, mission_id: uuid::Uuid) -> Result<Vec<u8>, String> {
        signing_bytes(mission_id, self.producer_id, &digest_stream(self)?)
    }

    pub fn payload_digest(&self) -> Result<String, String> {
        digest_stream(self)
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
        authority: &ChoanocyteProducerAuthority,
    ) -> Result<Value, String> {
        stream.validate()?;
        let context = stream_receipt_context(self, stream, authority)?;
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
    authority: &ChoanocyteProducerAuthority,
) -> Result<StreamReceiptContext, String> {
    let mission_id = ecosystem
        .mission_id
        .ok_or_else(|| "Choanocyte stream receipt requires a mission id".to_string())?;
    let runtime_producer_id = runtime_producer_id(ecosystem)?;
    let input_digest = digest_stream(stream)?;
    let trust_key_sha256 = authority.verify(ProducerProof {
        mission_id,
        producer_id: stream.producer_id,
        payload_sha256: &input_digest,
        signature_hex: &stream.signature_hex,
    })?;
    let idempotency_key = stream_idempotency_key(mission_id, &input_digest);
    Ok(StreamReceiptContext {
        mission_id,
        runtime_producer_id,
        external_producer_id: stream.producer_id,
        input_digest,
        trust_key_sha256,
        signature_hex: stream.signature_hex.clone(),
        idempotency_key,
    })
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
            "orchestratorId": context.runtime_producer_id,
            "runtimeProducerId": context.runtime_producer_id,
            "cellId": ecosystem.choanocyte.id,
            "producerId": context.external_producer_id,
            "producerTrustKeySha256": context.trust_key_sha256,
            "producerSignatureHex": context.signature_hex,
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
        if receipt["producerId"] != context.external_producer_id.to_string()
            || receipt["producerTrustKeySha256"] != context.trust_key_sha256
            || receipt["producerSignatureHex"] != context.signature_hex
        {
            return Err("Choanocyte receipt source identity does not match its verified envelope".into());
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
    #[derive(serde::Serialize)]
    #[serde(rename_all = "camelCase")]
    struct CanonicalPayload<'a> {
        schema: &'a str,
        producer_id: uuid::Uuid,
        packets: &'a [RawSignalPacket],
    }
    let encoded = serde_json::to_vec(&CanonicalPayload {
        schema: &stream.schema,
        producer_id: stream.producer_id,
        packets: &stream.packets,
    }).map_err(|error| error.to_string())?;
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
#[path = "choanocyte_receipt_tests.rs"]
mod tests;

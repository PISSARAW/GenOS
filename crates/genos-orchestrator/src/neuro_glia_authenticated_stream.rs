//! Entrées et rejeu du flux neuro-glial authentifiées par la configuration hôte.

use crate::GenosEcosystem;
use crate::genos_store::BiologicalReceiptStore;
use crate::mission_neuro_glia_receipt::{
    NeuroGliaStreamEvent, latest_response_receipt, validate_receipt_snapshot,
};
use crate::neuro_glia_stream_validation::verified_stream;
use crate::neuro_glia_authority::NeuroGliaProducerAuthority;
use serde_json::Value;
use uuid::Uuid;

pub struct AuthenticatedNeuroGliaRequest<'a> {
    pub event: NeuroGliaStreamEvent,
    pub authority: &'a NeuroGliaProducerAuthority,
}

impl GenosEcosystem {
    /// Vérifie les claims hôte avant de persister l'événement signé.
    pub fn record_authenticated_neuro_glia_stream_event(
        &mut self,
        store: &BiologicalReceiptStore,
        authenticated: AuthenticatedNeuroGliaRequest<'_>,
    ) -> Result<Value, String> {
        let request = authenticated.event;
        let authority = authenticated.authority;
        let mission = self.mission_id.ok_or("mission identity is required")?;
        let proof = request.source.as_ref().ok_or("signed neuro-glia producer proof is required")?;
        let digest = crate::neuro_glia_authority::payload_digest(
            &request.event_type, &request.idempotency_key, &request.payload,
        )?;
        if digest != proof.payload_sha256 {
            return Err("neuro-glia producer payload digest does not match event".into());
        }
        let claims = crate::neuro_glia_authority::NeuroGliaClaims {
            mission_id: mission,
            tick: request.tick,
            producer_id: proof.producer_id,
            payload_sha256: digest.clone(),
        };
        authority.verify(&claims, &proof.signature_hex)?;
        if let Some(backend_proof) = request.backend_authorization.as_ref() {
            authority.verify_backend_authorization(backend_proof,
                crate::neuro_glia_authority::BackendEventBinding {
                    mission_id: mission, producer_id: proof.producer_id, event_id: request.event_id,
                    event_type: request.event_type.clone(), tick: request.tick,
                    idempotency_key: request.idempotency_key.clone(), payload_sha256: digest.clone(),
                })?;
        }
        if store.read_all()?.iter().any(|entry| entry["schema"] == "genos.mission-neuro-glia-event/v1") {
            self.replay_authenticated_neuro_glia_event_stream(store, authority)?;
        }
        self.record_neuro_glia_stream_event(store, request)
    }

    /// Rejoue uniquement un flux dont chaque événement porte une signature approuvée.
    pub fn replay_authenticated_neuro_glia_event_stream(
        &mut self,
        store: &BiologicalReceiptStore,
        authority: &NeuroGliaProducerAuthority,
    ) -> Result<Vec<Value>, String> {
        let mission = self.mission_id.ok_or("mission identity is required")?;
        let entries = store.read_all()?;
        let stream = verified_stream(&entries, mission)?;
        verify_stream_sources(&stream, mission, authority)?;
        let latest = stream.last().ok_or("durable glial event stream is empty")?;
        let receipt = latest_response_receipt(&entries, latest)?;
        validate_receipt_snapshot(store, &receipt)?;
        self.restore_population(store)?;
        Ok(stream)
    }
}

fn verify_stream_sources(
    stream: &[Value],
    mission: Uuid,
    authority: &NeuroGliaProducerAuthority,
) -> Result<(), String> {
    for entry in stream { authority.verify_event_entry(entry, mission)?; }
    Ok(())
}

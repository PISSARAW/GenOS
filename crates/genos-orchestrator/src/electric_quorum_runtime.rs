use crate::GenosEcosystem;
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use genos_biology::specialized_cells::electrocyte::ElectricOrganStack;
use genos_store::BiologicalReceiptStore;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::{HashMap, HashSet};
use std::time::{Instant, SystemTime, UNIX_EPOCH};
use uuid::Uuid;

const DURABLE_QUORUM_SCHEMA: &str = "genos.electric-quorum-receipt/v1";

const ELECTRIC_VOTE_SCHEMA: &str = "genos.electric-vote/v1";

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct ElectricMissionVote {
    pub participant_cell_id: Uuid,
    pub approve: bool,
    pub signature_hex: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ElectricQuorumRequest {
    pub proposal_id: String,
    pub expires_at_unix_ms: u64,
    pub votes: Vec<ElectricMissionVote>,
}

impl ElectricQuorumRequest {
    /// Produit les octets canoniques que chaque votant doit signer.
    pub fn vote_signing_bytes(
        &self,
        mission_id: Uuid,
        vote: &ElectricMissionVote,
    ) -> Result<Vec<u8>, String> {
        vote_signing_bytes(mission_id, self, vote)
    }
}

/// Clés publiques de participants approuvées par la configuration de confiance.
/// Ne construisez ce registre qu'à partir d'une configuration détenue par l'application.
pub struct ElectricVoterAuthority {
    trusted_voters: HashMap<Uuid, VerifyingKey>,
}

impl ElectricVoterAuthority {
    pub fn from_trusted_public_keys(keys: HashMap<Uuid, String>) -> Result<Self, String> {
        if keys.is_empty() {
            return Err("aucune clé de votant électrocytaire approuvée".into());
        }
        let trusted_voters = keys.into_iter().map(|(cell_id, encoded)| {
            let decoded = decode_hex(&encoded)?;
            let bytes: [u8; 32] = decoded.try_into()
                .map_err(|_| "clé publique de votant Ed25519 de longueur invalide".to_string())?;
            let key = VerifyingKey::from_bytes(&bytes).map_err(|error| error.to_string())?;
            Ok((cell_id, key))
        }).collect::<Result<HashMap<_, _>, String>>()?;
        Ok(Self { trusted_voters })
    }

    fn verify_vote(
        &self,
        mission_id: Uuid,
        request: &ElectricQuorumRequest,
        vote: &ElectricMissionVote,
    ) -> Result<(), String> {
        let key = self.trusted_voters.get(&vote.participant_cell_id)
            .ok_or_else(|| "quorum vote references an untrusted cell identity".to_string())?;
        let signature_bytes = decode_hex(&vote.signature_hex)?;
        let signature = Signature::from_slice(&signature_bytes).map_err(|error| error.to_string())?;
        key.verify(&request.vote_signing_bytes(mission_id, vote)?, &signature)
            .map_err(|_| "quorum vote signature is invalid".to_string())
    }
}

fn decode_hex(value: &str) -> Result<Vec<u8>, String> {
    if value.len() % 2 != 0 {
        return Err("signature hex length is invalid".into());
    }
    value.as_bytes().chunks_exact(2).map(|pair| {
        let high = (pair[0] as char).to_digit(16).ok_or("signature hex is invalid")?;
        let low = (pair[1] as char).to_digit(16).ok_or("signature hex is invalid")?;
        Ok(((high << 4) | low) as u8)
    }).collect()
}

fn vote_signing_bytes(
    mission_id: Uuid,
    request: &ElectricQuorumRequest,
    vote: &ElectricMissionVote,
) -> Result<Vec<u8>, String> {
    #[derive(Serialize)]
    struct Claims<'a> {
        schema: &'static str,
        mission_id: Uuid,
        proposal_id: &'a str,
        expires_at_unix_ms: u64,
        participant_cell_id: Uuid,
        approve: bool,
    }
    serde_json::to_vec(&Claims {
        schema: ELECTRIC_VOTE_SCHEMA,
        mission_id,
        proposal_id: &request.proposal_id,
        expires_at_unix_ms: request.expires_at_unix_ms,
        participant_cell_id: vote.participant_cell_id,
        approve: vote.approve,
    }).map_err(|error| error.to_string())
}

fn now_unix_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn validate_signed_votes(
    mission_id: Uuid,
    request: &ElectricQuorumRequest,
    authority: &ElectricVoterAuthority,
) -> Result<(Vec<Uuid>, usize), String> {
    if request.votes.len() > 256 {
        return Err("quorum is bounded to 256 participant votes".into());
    }
    let mut participants = HashSet::new();
    let mut approvals = 0;
    for vote in &request.votes {
        authority.verify_vote(mission_id, request, vote)?;
        if !participants.insert(vote.participant_cell_id) {
            return Err("duplicate cell vote rejected".into());
        }
        approvals += usize::from(vote.approve);
    }
    if participants.len() < 2 || approvals < 2 || approvals <= request.votes.len() / 2 {
        return Err("multi-cell approval quorum not reached".into());
    }
    Ok((participants.into_iter().collect(), approvals))
}

fn validate_votes(
    eco: &GenosEcosystem,
    request: &ElectricQuorumRequest,
    authority: &ElectricVoterAuthority,
) -> Result<(Vec<Uuid>, usize), String> {
    let mission_id = eco.mission_id.ok_or("mission identity is required")?;
    let (participants, approvals) = validate_signed_votes(mission_id, request, authority)?;
    if participants.iter().any(|id| !eco.orchestrator.active_cells.contains_key(id)) {
        return Err("quorum vote references a cell outside the active population".into());
    }
    Ok((participants, approvals))
}

fn validate_durable_request(
    eco: &GenosEcosystem,
    request: &ElectricQuorumRequest,
) -> Result<Uuid, String> {
    let mission_id = eco.mission_id.ok_or("mission identity is required")?;
    if request.proposal_id.trim().is_empty() {
        return Err("proposal identity is required".into());
    }
    Ok(mission_id)
}

struct DurableQuorumInput<'request> {
    mission_id: Uuid,
    idempotency_key: String,
    request: &'request ElectricQuorumRequest,
    authority: &'request ElectricVoterAuthority,
}

fn prepare_durable_quorum(
    eco: &GenosEcosystem,
    input: DurableQuorumInput<'_>,
) -> Result<(Value, ElectricOrganStack), String> {
    if now_unix_ms() > input.request.expires_at_unix_ms {
        return Err("quorum vote deadline expired".into());
    }
    let (participants, approvals) = validate_votes(eco, input.request, input.authority)?;
    let started = Instant::now();
    let mut organ_after = eco.electric_organ.clone();
    let burst = organ_after.discharge_burst()?;
    let receipt = json!({
        "schema": DURABLE_QUORUM_SCHEMA,
        "idempotency_key": input.idempotency_key,
        "mission_id": input.mission_id,
        "proposal_id": input.request.proposal_id,
        "expires_at_unix_ms": input.request.expires_at_unix_ms,
        "accepted": true,
        "votes": input.request.votes,
        "participant_cell_ids": participants,
        "approvals": approvals,
        "measured_latency_us": started.elapsed().as_micros(),
        "burst": burst,
        "organ_after": &organ_after
    });
    Ok((receipt, organ_after))
}

fn durable_receipt_matches_request(
    receipt: &Value,
    request: &ElectricQuorumRequest,
    mission_id: Uuid,
) -> Result<bool, String> {
    let expected_key = format!("{mission_id}:{}", request.proposal_id);
    let votes = serde_json::to_value(&request.votes).map_err(|error| error.to_string())?;
    Ok(receipt["schema"] == DURABLE_QUORUM_SCHEMA
        && receipt["mission_id"] == mission_id.to_string()
        && receipt["proposal_id"] == request.proposal_id
        && receipt["idempotency_key"] == expected_key
        && receipt["accepted"] == true
        && receipt["votes"] == votes)
}

impl GenosEcosystem {
    /// Persist an accepted quorum decision before installing its simulated discharge.
    /// Signatures prove registered keys, not distributed collection or network consensus.
    pub fn discharge_electric_under_quorum_durable(
        &mut self,
        request: ElectricQuorumRequest,
        store: &BiologicalReceiptStore,
        authority: &ElectricVoterAuthority,
    ) -> Result<Value, String> {
        let mission_id = validate_durable_request(self, &request)?;
        let idempotency_key = format!("{mission_id}:{}", request.proposal_id);
        if let Some(existing) = store.find_idempotent_receipt(DURABLE_QUORUM_SCHEMA, &idempotency_key)? {
            return self.replay_electric_quorum(&request, existing, authority);
        }
        let input = DurableQuorumInput { mission_id, idempotency_key, request: &request, authority };
        let (receipt, organ_after) = prepare_durable_quorum(self, input)?;
        store.append_idempotent_receipt(&receipt)?;
        self.electric_organ = organ_after;
        self.record_event("ELECTROCYTE_QUORUM_COMPLETED", receipt.clone());
        Ok(receipt)
    }

    /// Restore the accepted organ state from its durable mission receipt.
    pub fn replay_electric_quorum(
        &mut self,
        request: &ElectricQuorumRequest,
        receipt: Value,
        authority: &ElectricVoterAuthority,
    ) -> Result<Value, String> {
        let mission_id = validate_durable_request(self, request)?;
        validate_signed_votes(mission_id, request, authority)?;
        if !durable_receipt_matches_request(&receipt, request, mission_id)? {
            return Err("electric quorum receipt does not match the mission request".into());
        }
        let organ: ElectricOrganStack = serde_json::from_value(receipt["organ_after"].clone())
            .map_err(|error| error.to_string())?;
        self.electric_organ = organ;
        Ok(receipt)
    }

    fn refused_quorum_receipt(
        &mut self,
        request: &ElectricQuorumRequest,
        reason: &str,
        started: Instant,
    ) -> Value {
        let receipt = json!({
            "schema": "genos.electric-quorum/v1",
            "mission_id": self.mission_id,
            "proposal_id": request.proposal_id,
            "accepted": false,
            "reason": reason,
            "votes": request.votes,
            "measured_latency_ms": started.elapsed().as_secs_f64() * 1000.0
        });
        self.record_event("ELECTROCYTE_QUORUM_REFUSED", receipt.clone());
        receipt
    }

    /// N'autorise la décharge électrique qu'après un vote majoritaire multi-cellules non expiré.
    pub fn discharge_electric_under_quorum(
        &mut self,
        request: ElectricQuorumRequest,
        authority: &ElectricVoterAuthority,
    ) -> Value {
        let started = Instant::now();
        if self.mission_id.is_none() || request.proposal_id.trim().is_empty() {
            return self.refused_quorum_receipt(&request, "mission or proposal identity missing", started);
        }
        if now_unix_ms() > request.expires_at_unix_ms {
            return self.refused_quorum_receipt(&request, "quorum vote deadline expired", started);
        }
        let (participants, approvals) = match validate_votes(self, &request, authority) {
            Ok(validated) => validated,
            Err(reason) => return self.refused_quorum_receipt(&request, &reason, started),
        };
        let burst = match self.discharge_electric() {
            Ok(result) => result,
            Err(reason) => return self.refused_quorum_receipt(&request, &reason, started),
        };
        let receipt = json!({
            "schema": "genos.electric-quorum/v1",
            "mission_id": self.mission_id,
            "proposal_id": request.proposal_id,
            "accepted": true,
            "participant_cell_ids": participants,
            "approvals": approvals,
            "measured_latency_ms": started.elapsed().as_secs_f64() * 1000.0,
            "burst": burst
        });
        self.record_event("ELECTROCYTE_QUORUM_COMPLETED", receipt.clone());
        receipt
    }
}


#[cfg(test)]
#[path = "electric_quorum_runtime_tests.rs"]
mod tests;

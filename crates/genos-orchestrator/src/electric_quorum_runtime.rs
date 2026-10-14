use crate::GenosEcosystem;
use genos_biology::specialized_cells::electrocyte::ElectricOrganStack;
use genos_store::BiologicalReceiptStore;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::HashSet;
use std::time::{Instant, SystemTime, UNIX_EPOCH};
use uuid::Uuid;

const DURABLE_QUORUM_SCHEMA: &str = "genos.electric-quorum-receipt/v1";

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ElectricMissionVote {
    pub participant_cell_id: Uuid,
    pub approve: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ElectricQuorumRequest {
    pub proposal_id: String,
    pub expires_at_unix_ms: u64,
    pub votes: Vec<ElectricMissionVote>,
}

fn now_unix_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn validate_votes(eco: &GenosEcosystem, votes: &[ElectricMissionVote]) -> Result<(Vec<Uuid>, usize), String> {
    if votes.len() > 256 {
        return Err("quorum is bounded to 256 participant votes".into());
    }
    let mut participants = HashSet::new();
    let mut approvals = 0;
    for vote in votes {
        if !eco.orchestrator.active_cells.contains_key(&vote.participant_cell_id) {
            return Err("quorum vote references a cell outside the active population".into());
        }
        if !participants.insert(vote.participant_cell_id) {
            return Err("duplicate cell vote rejected".into());
        }
        approvals += usize::from(vote.approve);
    }
    if participants.len() < 2 || approvals < 2 || approvals <= votes.len() / 2 {
        return Err("multi-cell approval quorum not reached".into());
    }
    Ok((participants.into_iter().collect(), approvals))
}

impl GenosEcosystem {
    /// Persist an accepted quorum decision before installing its simulated discharge.
    /// The vote list is caller-supplied; this does not authenticate distributed voters.
    pub fn discharge_electric_under_quorum_durable(
        &mut self,
        request: ElectricQuorumRequest,
        store: &BiologicalReceiptStore,
    ) -> Result<Value, String> {
        let mission_id = self.mission_id.ok_or("mission identity is required")?;
        if request.proposal_id.trim().is_empty() {
            return Err("proposal identity is required".into());
        }
        let idempotency_key = format!("{mission_id}:{}", request.proposal_id);
        if let Some(existing) = store.find_idempotent_receipt(DURABLE_QUORUM_SCHEMA, &idempotency_key)? {
            return self.replay_electric_quorum(&request, existing);
        }
        if now_unix_ms() > request.expires_at_unix_ms {
            return Err("quorum vote deadline expired".into());
        }
        let (participants, approvals) = validate_votes(self, &request.votes)?;
        let started = Instant::now();
        let mut organ_after = self.electric_organ.clone();
        let burst = organ_after.discharge_burst()?;
        let receipt = json!({
            "schema": DURABLE_QUORUM_SCHEMA,
            "idempotency_key": idempotency_key,
            "mission_id": mission_id,
            "proposal_id": request.proposal_id,
            "expires_at_unix_ms": request.expires_at_unix_ms,
            "accepted": true,
            "votes": request.votes,
            "participant_cell_ids": participants,
            "approvals": approvals,
            "measured_latency_ms": started.elapsed().as_secs_f64() * 1000.0,
            "burst": burst,
            "organ_after": organ_after
        });
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
    ) -> Result<Value, String> {
        let mission_id = self.mission_id.ok_or("mission identity is required")?;
        let expected_key = format!("{mission_id}:{}", request.proposal_id);
        if receipt["schema"] != DURABLE_QUORUM_SCHEMA
            || receipt["mission_id"] != mission_id.to_string()
            || receipt["proposal_id"] != request.proposal_id
            || receipt["idempotency_key"] != expected_key
            || receipt["accepted"] != true
            || receipt["votes"] != serde_json::to_value(&request.votes).map_err(|error| error.to_string())?
        {
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
    pub fn discharge_electric_under_quorum(&mut self, request: ElectricQuorumRequest) -> Value {
        let started = Instant::now();
        if self.mission_id.is_none() || request.proposal_id.trim().is_empty() {
            return self.refused_quorum_receipt(&request, "mission or proposal identity missing", started);
        }
        if now_unix_ms() > request.expires_at_unix_ms {
            return self.refused_quorum_receipt(&request, "quorum vote deadline expired", started);
        }
        let (participants, approvals) = match validate_votes(self, &request.votes) {
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
mod tests {
    use super::*;
    use crate::genos_cell::AgentCell;
    use crate::genos_biology::specialized_cells::electrocyte::ElectricOrganStack;

    fn quorum_fixture() -> (GenosEcosystem, Vec<Uuid>) {
        let mut eco = GenosEcosystem::new("electro-quorum");
        eco.set_mission_id(Uuid::new_v4());
        eco.orchestrator.create_tissue("Participants", "Mission").unwrap();
        for index in 0..3 {
            eco.orchestrator
                .add_worker("Participants", AgentCell::new(format!("participant-{index}"), "test", "worker"))
                .unwrap();
        }
        eco.electric_organ = ElectricOrganStack::new("measured-organ", 6000, 2);
        let ids = eco.orchestrator.active_cells.keys().copied().take(3).collect();
        (eco, ids)
    }

    fn electrocyte_snapshot(organ: &ElectricOrganStack) -> Value {
        serde_json::to_value(&organ.electrocytes).unwrap()
    }

    #[test]
    fn electric_discharge_requires_live_multi_cell_quorum_and_records_measurement() {
        let (mut eco, ids) = quorum_fixture();
        let request = ElectricQuorumRequest {
            proposal_id: "mission-action-1".into(),
            expires_at_unix_ms: now_unix_ms() + 1000,
            votes: ids.iter().map(|participant_cell_id| ElectricMissionVote { participant_cell_id: *participant_cell_id, approve: true }).collect(),
        };
        let receipt = eco.discharge_electric_under_quorum(request);
        assert_eq!(receipt["accepted"], true);
        assert_eq!(receipt["participant_cell_ids"].as_array().unwrap().len(), 3);
        assert!(receipt["measured_latency_ms"].as_f64().unwrap() >= 0.0);
        assert_eq!(eco.read_events(0).last().unwrap().event_type, "ELECTROCYTE_QUORUM_COMPLETED");
    }

    #[test]
    fn expired_electric_quorum_is_refused_without_depolarizing_cells() {
        let (mut eco, ids) = quorum_fixture();
        let request = ElectricQuorumRequest {
            proposal_id: "expired-action".into(),
            expires_at_unix_ms: 0,
            votes: ids.iter().map(|participant_cell_id| ElectricMissionVote { participant_cell_id: *participant_cell_id, approve: true }).collect(),
        };
        let receipt = eco.discharge_electric_under_quorum(request);
        assert_eq!(receipt["accepted"], false);
        assert!(eco.electric_organ.electrocytes.iter().all(|cell| !cell.is_depolarized));
    }

    #[test]
    fn durable_electric_quorum_appends_before_mutation_and_replays_after_store_reopen() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("electric-quorum.jsonl");
        let store = BiologicalReceiptStore::open(&path);
        let (mut ecosystem, ids) = quorum_fixture();
        let mission_id = ecosystem.mission_id.unwrap();
        let request = ElectricQuorumRequest {
            proposal_id: "durable-discharge-1".into(),
            expires_at_unix_ms: now_unix_ms() + 10_000,
            votes: ids.iter().map(|participant_cell_id| ElectricMissionVote {
                participant_cell_id: *participant_cell_id,
                approve: true,
            }).collect(),
        };
        let original = ecosystem.electric_organ.clone();
        let receipt = ecosystem.discharge_electric_under_quorum_durable(request.clone(), &store).unwrap();
        assert_eq!(store.read_all().unwrap().len(), 1);
        assert!(ecosystem.electric_organ.electrocytes.iter().any(|cell| cell.is_depolarized));
        assert_ne!(electrocyte_snapshot(&ecosystem.electric_organ), electrocyte_snapshot(&original));

        let reopened = BiologicalReceiptStore::open(&path);
        let durable = reopened.find_idempotent_receipt(
            DURABLE_QUORUM_SCHEMA,
            &format!("{mission_id}:{}", request.proposal_id),
        ).unwrap().unwrap();
        let mut restored = GenosEcosystem::new("electro-quorum-restart");
        restored.set_mission_id(mission_id);
        restored.electric_organ = original;
        let replayed = restored.replay_electric_quorum(&request, durable).unwrap();
        assert_eq!(replayed, receipt);
        assert_eq!(electrocyte_snapshot(&restored.electric_organ), electrocyte_snapshot(&ecosystem.electric_organ));
        assert_eq!(reopened.read_all().unwrap().len(), 1);
    }

    #[test]
    fn durable_electric_quorum_rejects_without_persisting_or_mutating() {
        let directory = tempfile::tempdir().unwrap();
        let store = BiologicalReceiptStore::open(directory.path().join("electric-quorum.jsonl"));
        let (mut ecosystem, ids) = quorum_fixture();
        let request = ElectricQuorumRequest {
            proposal_id: "insufficient-votes".into(),
            expires_at_unix_ms: now_unix_ms() + 10_000,
            votes: ids.iter().take(1).map(|participant_cell_id| ElectricMissionVote {
                participant_cell_id: *participant_cell_id,
                approve: true,
            }).collect(),
        };
        let original = ecosystem.electric_organ.electrocytes.clone();
        assert!(ecosystem.discharge_electric_under_quorum_durable(request, &store).is_err());
        assert!(store.read_all().unwrap().is_empty());
        assert_eq!(electrocyte_snapshot(&ecosystem.electric_organ), serde_json::to_value(&original).unwrap());
    }
}

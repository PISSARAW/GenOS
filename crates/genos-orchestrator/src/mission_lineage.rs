//! Mission entrypoint for deterministic counterfactual lineage replay.

use crate::GenosEcosystem;
use genos_genome::replay::{EvolutionEvent, TrajectoryReplay};
use genos_store::BiologicalReceiptStore;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub const MAX_LINEAGE_REPLAY_EVENTS: usize = 256;

pub struct LineageReplayInput {
    pub genome_id: Uuid,
    pub seed: u64,
    pub events: Vec<EvolutionEvent>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct LineageReplayReceipt {
    pub schema: String,
    pub receipt_id: Uuid,
    pub mission_id: Uuid,
    pub source_genome_id: Uuid,
    pub lineage_id: Uuid,
    pub seed: u64,
    pub event_origin: String,
    pub events_artifact: String,
    pub genome_artifacts: Vec<String>,
    pub genome_hashes: Vec<String>,
    pub fitness_trajectory: Vec<f64>,
    pub divergence_from_source: f64,
    pub result_origin: String,
}

impl GenosEcosystem {
    /// Replay caller-supplied events from a stored mission genome; preserves all artifacts.
    pub fn replay_lineage_for_mission(
        &self,
        input: LineageReplayInput,
        store: &BiologicalReceiptStore,
    ) -> Result<LineageReplayReceipt, String> {
        let mission_id = self.mission_id.ok_or("mission identity is required")?;
        if input.events.len() > MAX_LINEAGE_REPLAY_EVENTS {
            return Err(format!("lineage replay exceeds {MAX_LINEAGE_REPLAY_EVENTS} events"));
        }
        let source = self.orchestrator.genomes.get(&input.genome_id)
            .ok_or_else(|| format!("genome {} not found", input.genome_id))?;
        let replay = TrajectoryReplay::replay_trajectory_seeded(source, &input.events, input.seed);
        let receipt = replay_receipt(ReplayReceiptInput { mission_id, input, source, replay })?;
        let encoded = serde_json::to_value(&receipt).map_err(|error| error.to_string())?;
        store.append_receipts(&[encoded])?;
        Ok(receipt)
    }
}

struct ReplayReceiptInput<'a> {
    mission_id: Uuid,
    input: LineageReplayInput,
    source: &'a genos_genome::Genome,
    replay: genos_genome::replay::ReplayResult,
}

fn replay_receipt(input: ReplayReceiptInput<'_>) -> Result<LineageReplayReceipt, String> {
    let ReplayReceiptInput { mission_id, input, source, replay } = input;
    let events_artifact = serde_json::to_string(&input.events).map_err(|error| error.to_string())?;
    let genome_artifacts = replay.genomes.iter().map(serde_json::to_string)
        .collect::<Result<Vec<_>, _>>().map_err(|error| error.to_string())?;
    let genome_hashes = replay.genomes.iter().map(genos_genome::Genome::content_hash).collect();
    Ok(LineageReplayReceipt {
        schema: "genos.lineage-replay-receipt/v1".into(), receipt_id: Uuid::new_v4(),
        mission_id, source_genome_id: source.genome_id(), lineage_id: source.lineage_id(),
        seed: input.seed, event_origin: "caller_supplied".into(), events_artifact,
        genome_artifacts, genome_hashes, fitness_trajectory: replay.fitness_trajectory,
        divergence_from_source: replay.divergence_from_original,
        result_origin: "counterfactual".into(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn mission_replay_is_seeded_and_persists_all_lineage_artifacts() {
        let nonce = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
        let path = std::env::temp_dir().join(format!("genos-lineage-replay-{nonce}.jsonl"));
        let store = BiologicalReceiptStore::open(&path);
        let mut ecosystem = GenosEcosystem::new("lineage-replay-test");
        ecosystem.set_mission_id(Uuid::new_v4());
        let genome_id = ecosystem.seed_germline(ecosystem.orchestrator.orchestrator_id, "replay genome").unwrap();
        let input = LineageReplayInput {
            genome_id, seed: 73,
            events: vec![EvolutionEvent::Mutate { rate: 0.8 }, EvolutionEvent::Select { pressure: 0.4 }],
        };

        let first = ecosystem.replay_lineage_for_mission(input, &store).unwrap();
        let second = ecosystem.replay_lineage_for_mission(LineageReplayInput {
            genome_id, seed: 73,
            events: vec![EvolutionEvent::Mutate { rate: 0.8 }, EvolutionEvent::Select { pressure: 0.4 }],
        }, &store).unwrap();

        assert_eq!(first.genome_hashes, second.genome_hashes);
        assert_eq!(first.event_origin, "caller_supplied");
        assert_eq!(first.result_origin, "counterfactual");
        assert_eq!(first.genome_artifacts.len(), 3);
        assert_eq!(store.read_all().unwrap().len(), 2);
        let _ = std::fs::remove_file(path);
    }
}

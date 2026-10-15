//! Durable mission-bound reproduction artifacts and restart recovery.

use crate::GenosEcosystem;
use crate::reproduction_cycle::ReproductionOutcome;
use crate::reproduction_cycle::{SeededReproductionIdentity, deterministic_reproduction_id};
use crate::reproduction_population_recovery::{
    SnapshotLineageInput, linked_snapshot, reproduction_receipt_digest,
    restore_population_snapshot, snapshot_digest,
    validate_snapshot_lineage, validate_snapshot_lineage_fields,
};
use genos_cell::AgentCell;
use genos_genome::Genome;
use genos_store::BiologicalReceiptStore;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::HashSet;
use uuid::Uuid;

const RECEIPT_SCHEMA: &str = "genos.reproduction-lineage-receipt/v1";
const LINK_SCHEMA: &str = "genos.reproduction-lineage-recovery/v1";

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct ReproductionLineageReceipt {
    pub schema: String,
    pub idempotency_key: String,
    pub mission_id: Uuid,
    pub parent_cell: AgentCell,
    pub daughter_cell: AgentCell,
    pub parent_genome: Genome,
    pub daughter_genome: Genome,
    pub reproduction_event: Value,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub campaign_seed: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub population_snapshot_sha256: Option<String>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct ReproductionRecoverySummary {
    pub receipts_replayed: usize,
    pub cells_recovered: usize,
    pub genomes_recovered: usize,
}

struct ReproductionReceiptInput {
    mission_id: Uuid,
    outcome: ReproductionOutcome,
    event: Value,
    snapshot: Value,
    campaign_seed: Option<u64>,
}

struct ReproductionReplayInput<'a> {
    entries: &'a [Value],
    receipt: ReproductionLineageReceipt,
}

#[derive(Default)]
struct RecoveryAccumulator {
    summary: ReproductionRecoverySummary,
    cells: HashSet<Uuid>,
    genomes: HashSet<Uuid>,
}

impl GenosEcosystem {
    /// Perform one mission reproduction and persist its complete cell/genome attachment.
    pub fn reproduce_and_archive_lineage(
        &mut self,
        store: &BiologicalReceiptStore,
    ) -> Result<ReproductionLineageReceipt, String> {
        let mission_id = self.mission_id.ok_or("mission identity is required")?;
        let before_reproduction = self.orchestrator.clone();
        let prepared = (|| {
            let (outcome, event) = self.autonomous_reproduction_cycle_unrecorded()
                .map_err(|reason| format!("reproduction blocked: {reason:?}"))?;
            let snapshot = self.population_state_receipt(self.receipt_tick)?;
            let persisted = self.persist_reproduction_receipt(
                store,
                ReproductionReceiptInput {
                    mission_id,
                    outcome,
                    event: event.clone(),
                    snapshot,
                    campaign_seed: self.reproduction_seed,
                },
            )?;
            Ok::<_, String>((persisted, event))
        })();
        match prepared {
            Ok((receipt, event)) => {
                self.record_event("AUTONOMOUS_REPRODUCTION", event);
                Ok(receipt)
            }
            Err(error) => {
                self.orchestrator = before_reproduction;
                Err(error)
            }
        }
    }

    /// Replay all durable births for this mission into a fresh or compatible ecosystem.
    pub fn replay_reproduction_lineage(
        &mut self,
        store: &BiologicalReceiptStore,
    ) -> Result<ReproductionRecoverySummary, String> {
        let mission_id = self.mission_id.ok_or("mission identity is required")?;
        let entries = store.read_all()?;
        let receipts = entries.iter().cloned()
            .filter(|item| item["schema"] == RECEIPT_SCHEMA)
            .map(serde_json::from_value::<ReproductionLineageReceipt>)
            .collect::<Result<Vec<_>, _>>().map_err(|error| error.to_string())?;
        let mut recovery = RecoveryAccumulator::default();
        for receipt in receipts.into_iter().filter(|item| item.mission_id == mission_id) {
            self.replay_one_receipt(
                ReproductionReplayInput { entries: &entries, receipt },
                &mut recovery,
            )?;
        }
        recovery.summary.cells_recovered = recovery.cells.len();
        recovery.summary.genomes_recovered = recovery.genomes.len();
        Ok(recovery.summary)
    }

    fn replay_one_receipt(
        &mut self,
        input: ReproductionReplayInput<'_>,
        recovery: &mut RecoveryAccumulator,
    ) -> Result<(), String> {
        validate_receipt(&input.receipt)?;
        let snapshot = linked_snapshot(input.entries, &input.receipt)?;
        recovery.cells.insert(input.receipt.parent_cell.cell_id);
        recovery.cells.insert(input.receipt.daughter_cell.cell_id);
        recovery.genomes.insert(input.receipt.parent_genome.genome_id());
        recovery.genomes.insert(input.receipt.daughter_genome.genome_id());
        match snapshot {
            Some(snapshot) => {
                validate_snapshot_lineage(&snapshot, &input.receipt)?;
                restore_population_snapshot(self, &snapshot)?;
            }
            None => self.restore_receipt(&input.receipt)?,
        }
        recovery.summary.receipts_replayed += 1;
        Ok(())
    }

    fn cell_snapshot(&self, id: Uuid) -> Result<AgentCell, String> {
        self.orchestrator.active_cells.get(&id).cloned()
            .ok_or_else(|| format!("reproduction cell {id} is not active"))
    }

    fn genome_for_cell(&self, cell: &AgentCell) -> Result<Genome, String> {
        let id = cell.genome_id.ok_or_else(|| format!("cell {} has no genome", cell.cell_id))?;
        self.orchestrator.genomes.get(&id).cloned()
            .ok_or_else(|| format!("genome {id} for cell {} is missing", cell.cell_id))
    }

    fn persist_reproduction_receipt(
        &self,
        store: &BiologicalReceiptStore,
        input: ReproductionReceiptInput,
    ) -> Result<ReproductionLineageReceipt, String> {
        let parent_cell = self.cell_snapshot(input.outcome.mother_id)?;
        let daughter_cell = self.cell_snapshot(input.outcome.daughter_id)?;
        validate_snapshot_lineage_fields(
            &input.snapshot,
            SnapshotLineageInput {
                mission_id: input.mission_id,
                parent: &parent_cell,
                daughter: &daughter_cell,
            },
        )?;
        let snapshot_sha256 = snapshot_digest(&input.snapshot)?;
        let receipt = ReproductionLineageReceipt {
            schema: RECEIPT_SCHEMA.into(),
            idempotency_key: format!("{}:{}", input.mission_id, input.outcome.daughter_id),
            mission_id: input.mission_id,
            parent_genome: self.genome_for_cell(&parent_cell)?,
            daughter_genome: self.genome_for_cell(&daughter_cell)?,
            parent_cell,
            daughter_cell,
            reproduction_event: input.event,
            campaign_seed: input.campaign_seed,
            population_snapshot_sha256: Some(snapshot_sha256),
        };
        validate_receipt(&receipt)?;
        persist_receipt(store, receipt, input.snapshot)
    }

    fn restore_receipt(&mut self, receipt: &ReproductionLineageReceipt) -> Result<(), String> {
        for (cell, genome) in [(&receipt.parent_cell, &receipt.parent_genome), (&receipt.daughter_cell, &receipt.daughter_genome)] {
            if let Some(existing) = self.orchestrator.genomes.get(&genome.genome_id()) {
                if existing != genome && !valid_genome_progression(existing, genome) {
                    return Err(format!("genome {} conflicts with the restored lineage", genome.genome_id()));
                }
            }
            if let Some(existing) = self.orchestrator.active_cells.get(&cell.cell_id) {
                if existing.genome_id != cell.genome_id {
                    return Err(format!("cell {} has a conflicting genome attachment", cell.cell_id));
                }
            }
            self.orchestrator.genomes.insert(genome.genome_id(), genome.clone());
            self.orchestrator.active_cells.insert(cell.cell_id, cell.clone());
        }
        Ok(())
    }
}

fn valid_genome_progression(previous: &Genome, next: &Genome) -> bool {
    previous.genome_id() == next.genome_id()
        && previous.lineage_id() == next.lineage_id()
        && previous.parent_ids == next.parent_ids
        && previous.generation == next.generation
        && previous.content_hash() == next.content_hash()
        && previous.bud_scars.iter().all(|scar| next.bud_scars.contains(scar))
}

fn validate_receipt(receipt: &ReproductionLineageReceipt) -> Result<(), String> {
    validate_schema(receipt)?;
    validate_mission_attachment(receipt)?;
    validate_cell_genome_attachment(receipt)?;
    let (parent, daughter) = validate_genomes(receipt)?;
    validate_event_lineage(receipt, &parent, &daughter)?;
    validate_seeded_identity(receipt)
}

fn validate_seeded_identity(receipt: &ReproductionLineageReceipt) -> Result<(), String> {
    let Some(seed) = receipt.campaign_seed else { return Ok(()); };
    let identity = SeededReproductionIdentity {
        mission_id: receipt.mission_id,
        seed,
        parent_cell_id: receipt.parent_cell.cell_id,
        parent_genome_id: receipt.parent_genome.genome_id(),
        prior_bud_scars: receipt.parent_cell.bud_scars.saturating_sub(1),
    };
    if deterministic_reproduction_id(identity, "genome") != receipt.daughter_genome.genome_id()
        || deterministic_reproduction_id(identity, "cell") != receipt.daughter_cell.cell_id
    {
        return Err("seeded reproduction daughter identity mismatch".into());
    }
    Ok(())
}

fn persist_receipt(
    store: &BiologicalReceiptStore,
    receipt: ReproductionLineageReceipt,
    snapshot: Value,
) -> Result<ReproductionLineageReceipt, String> {
    let snapshot_sha256 = receipt.population_snapshot_sha256.as_deref()
        .ok_or("reproduction population snapshot digest missing")?;
    let receipt_sha256 = reproduction_receipt_digest(&receipt)?;
    let link = json!({
        "schema": LINK_SCHEMA,
        "idempotency_key": receipt.idempotency_key,
        "mission_id": receipt.mission_id,
        "tick": snapshot["tick"],
        "population_snapshot_sha256": snapshot_sha256,
        "reproduction_receipt_sha256": receipt_sha256,
    });
    let encoded = serde_json::to_value(&receipt).map_err(|error| error.to_string())?;
    if let Some(existing) = existing_idempotent_receipt(store, &receipt, &encoded)? {
        return Ok(existing);
    }
    store.append_receipts(&[encoded, snapshot, link])?;
    Ok(receipt)
}

fn existing_idempotent_receipt(
    store: &BiologicalReceiptStore,
    receipt: &ReproductionLineageReceipt,
    encoded: &Value,
) -> Result<Option<ReproductionLineageReceipt>, String> {
    let entries = store.read_all()?;
    let Some(existing) = store.find_idempotent_receipt(RECEIPT_SCHEMA, &receipt.idempotency_key)? else {
        return Ok(None);
    };
    if existing != *encoded {
        return Err("reproduction idempotency key collision".into());
    }
    let existing: ReproductionLineageReceipt = serde_json::from_value(existing)
        .map_err(|error| error.to_string())?;
    validate_receipt(&existing)?;
    linked_snapshot(&entries, &existing)?
        .ok_or("reproduction idempotency record has no linked snapshot")?;
    Ok(Some(existing))
}

fn validate_schema(receipt: &ReproductionLineageReceipt) -> Result<(), String> {
    if receipt.schema != RECEIPT_SCHEMA
        || receipt.reproduction_event["schema"] != "genos.reproduction-event/v1"
    {
        return Err("unsupported reproduction lineage receipt schema".into());
    }
    Ok(())
}

fn validate_mission_attachment(receipt: &ReproductionLineageReceipt) -> Result<(), String> {
    if receipt.idempotency_key != format!("{}:{}", receipt.mission_id, receipt.daughter_cell.cell_id)
        || receipt.reproduction_event["parent"]["genome_id"] != json!(receipt.parent_genome.genome_id())
        || receipt.reproduction_event["daughter"]["genome_id"] != json!(receipt.daughter_genome.genome_id())
    {
        return Err("mission key or reproduction event genome identity is inconsistent".into());
    }
    Ok(())
}

fn validate_cell_genome_attachment(receipt: &ReproductionLineageReceipt) -> Result<(), String> {
    if receipt.parent_cell.genome_id != Some(receipt.parent_genome.genome_id())
        || receipt.daughter_cell.genome_id != Some(receipt.daughter_genome.genome_id())
    {
        return Err("cell-to-genome attachment does not match the receipt".into());
    }
    Ok(())
}

fn validate_genomes(receipt: &ReproductionLineageReceipt) -> Result<(genos_genome::genome::GenomeFingerprint, genos_genome::genome::GenomeFingerprint), String> {
    receipt.parent_genome.validate()?;
    receipt.daughter_genome.validate()?;
    let parent = receipt.parent_genome.fingerprint()?;
    let daughter = receipt.daughter_genome.fingerprint()?;
    if !genomes_form_direct_lineage(receipt, &parent, &daughter) {
        return Err("reproduction genomes do not form a direct lineage".into());
    }
    Ok((parent, daughter))
}

fn genomes_form_direct_lineage(
    receipt: &ReproductionLineageReceipt,
    parent: &genos_genome::genome::GenomeFingerprint,
    daughter: &genos_genome::genome::GenomeFingerprint,
) -> bool {
    receipt.daughter_genome.parent_ids == [receipt.parent_genome.genome_id()]
        && receipt.daughter_genome.generation == receipt.parent_genome.generation.saturating_add(1)
        && daughter.lineage_id == parent.lineage_id
}

fn validate_event_lineage(
    receipt: &ReproductionLineageReceipt,
    parent: &genos_genome::genome::GenomeFingerprint,
    daughter: &genos_genome::genome::GenomeFingerprint,
) -> Result<(), String> {
    if !event_cell_and_fingerprint_ids_match(receipt, parent, daughter) {
        return Err("reproduction event fingerprints or cell identities disagree".into());
    }
    if !event_lineage_metadata_matches(receipt, daughter) {
        return Err("reproduction event is missing its lineage, generation, or seed".into());
    }
    Ok(())
}

fn event_cell_and_fingerprint_ids_match(
    receipt: &ReproductionLineageReceipt,
    parent: &genos_genome::genome::GenomeFingerprint,
    daughter: &genos_genome::genome::GenomeFingerprint,
) -> bool {
    let event = &receipt.reproduction_event;
    event["parent"]["cell_id"] == json!(receipt.parent_cell.cell_id)
        && event["daughter"]["cell_id"] == json!(receipt.daughter_cell.cell_id)
        && event["fingerprints"]["parent"]["genome_id"] == json!(parent.genome_id)
        && event["fingerprints"]["parent"]["lineage_id"] == json!(parent.lineage_id)
        && event["fingerprints"]["parent"]["content_hash"] == json!(parent.content_hash)
        && event["fingerprints"]["daughter"] == json!(daughter)
}

fn event_lineage_metadata_matches(
    receipt: &ReproductionLineageReceipt,
    daughter: &genos_genome::genome::GenomeFingerprint,
) -> bool {
    let event = &receipt.reproduction_event;
    event["lineage_id"] == json!(daughter.lineage_id)
        && event["generation"] == json!(receipt.daughter_genome.generation)
        && event["campaign_seed"] == json!(receipt.campaign_seed)
        && event["seed"].as_str().is_some_and(|seed| seed.len() == 64)
}

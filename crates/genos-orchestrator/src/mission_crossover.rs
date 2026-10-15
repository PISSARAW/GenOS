//! Mission-bound sexual reproduction with deterministic, durable replay.

use crate::GenosEcosystem;
use genos_cell::AgentCell;
use genos_genome::genome::GenomeFingerprint;
use genos_genome::{Genome, fertilize};
use genos_store::BiologicalReceiptStore;
use rand::SeedableRng;
use rand::rngs::StdRng;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use uuid::Uuid;

pub const CROSSOVER_SCHEMA: &str = "genos.mission-crossover-receipt/v1";

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CrossoverParent {
    pub cell: AgentCell,
    pub genome: Genome,
    pub fingerprint: GenomeFingerprint,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CrossoverReceipt {
    pub schema: String,
    pub receipt_id: Uuid,
    pub idempotency_key: String,
    pub mission_id: Uuid,
    pub seed: u64,
    pub parent_a: CrossoverParent,
    pub parent_b: CrossoverParent,
    pub child_cell: AgentCell,
    pub child_genome: Genome,
    pub child_fingerprint: GenomeFingerprint,
}

#[derive(Clone, Copy)]
pub struct CrossoverRequest {
    pub parent_a_cell_id: Uuid,
    pub parent_b_cell_id: Uuid,
    pub seed: u64,
}

#[derive(Clone, Copy)]
struct CrossoverContext {
    mission_id: Uuid,
    seed: u64,
}

struct CrossoverIdentity {
    mission_id: Uuid,
    parent_a_cell_id: Uuid,
    parent_b_cell_id: Uuid,
    seed: u64,
}

impl GenosEcosystem {
    /// Cross two active, genome-bearing cells and persist their complete lineage.
    pub fn crossover_for_mission(
        &mut self,
        request: CrossoverRequest,
        store: &BiologicalReceiptStore,
    ) -> Result<CrossoverReceipt, String> {
        let mission_id = self.mission_id.ok_or("mission identity is required")?;
        let key = request_key(mission_id, &request);
        if let Some(value) = store.find_idempotent_receipt(CROSSOVER_SCHEMA, &key)? {
            return self.restore_crossover_receipt(value, mission_id);
        }
        self.create_and_persist_crossover(request, mission_id, store)
    }

    fn restore_crossover_receipt(
        &mut self,
        value: serde_json::Value,
        mission_id: Uuid,
    ) -> Result<CrossoverReceipt, String> {
        let receipt: CrossoverReceipt = serde_json::from_value(value)
            .map_err(|error| error.to_string())?;
        validate_receipt(&receipt, mission_id)?;
        self.install_crossover(&receipt)?;
        Ok(receipt)
    }

    fn create_and_persist_crossover(
        &mut self,
        request: CrossoverRequest,
        mission_id: Uuid,
        store: &BiologicalReceiptStore,
    ) -> Result<CrossoverReceipt, String> {
        let receipt = self.build_crossover_receipt(request, mission_id)?;
        validate_receipt(&receipt, mission_id)?;
        let encoded = serde_json::to_value(&receipt).map_err(|error| error.to_string())?;
        store.append_idempotent_receipt(&encoded)?;
        self.install_crossover(&receipt)?;
        Ok(receipt)
    }

    /// Restore a persisted crossover into a fresh or matching mission runtime.
    pub fn replay_crossover_for_mission(
        &mut self,
        idempotency_key: &str,
        store: &BiologicalReceiptStore,
    ) -> Result<CrossoverReceipt, String> {
        let mission_id = self.mission_id.ok_or("mission identity is required")?;
        let value = store
            .find_idempotent_receipt(CROSSOVER_SCHEMA, idempotency_key)?
            .ok_or("crossover receipt not found")?;
        let receipt: CrossoverReceipt = serde_json::from_value(value).map_err(|error| error.to_string())?;
        validate_receipt(&receipt, mission_id)?;
        self.install_crossover(&receipt)?;
        Ok(receipt)
    }

    fn crossover_parent(&self, cell_id: Uuid) -> Result<CrossoverParent, String> {
        let cell = self.orchestrator.active_cells.get(&cell_id)
            .ok_or_else(|| format!("crossover parent cell {cell_id} is not active"))?.clone();
        let genome_id = cell.genome_id.ok_or("crossover parent cell has no genome")?;
        let genome = self.orchestrator.genomes.get(&genome_id)
            .ok_or("crossover parent genome is not registered")?.clone();
        genome.validate()?;
        if genome.genome_id() != genome_id {
            return Err("crossover parent cell/genome identity mismatch".into());
        }
        Ok(CrossoverParent { fingerprint: genome.fingerprint()?, cell, genome })
    }

    fn build_crossover_receipt(&self, request: CrossoverRequest, mission_id: Uuid) -> Result<CrossoverReceipt, String> {
        let parent_a = self.crossover_parent(request.parent_a_cell_id)?;
        let parent_b = self.crossover_parent(request.parent_b_cell_id)?;
        validate_distinct_parents(&parent_a, &parent_b)?;
        let context = CrossoverContext { mission_id, seed: request.seed };
        let child_genome = child_genome((&parent_a.genome, &parent_b.genome), context)?;
        let child_cell = child_cell(&parent_a.cell, &child_genome, context);
        make_receipt(ReceiptParts { mission_id, seed: request.seed, parent_a, parent_b, child_genome, child_cell })
    }

    fn install_crossover(&mut self, receipt: &CrossoverReceipt) -> Result<(), String> {
        for parent in [&receipt.parent_a, &receipt.parent_b] {
            check_existing_parent(self, parent)?;
        }
        check_existing_child(self, receipt)?;
        for parent in [&receipt.parent_a, &receipt.parent_b] {
            self.orchestrator.genomes.entry(parent.genome.genome_id())
                .or_insert_with(|| parent.genome.clone());
            self.orchestrator.active_cells.entry(parent.cell.cell_id)
                .or_insert_with(|| parent.cell.clone());
        }
        self.orchestrator.genomes.entry(receipt.child_genome.genome_id())
            .or_insert_with(|| receipt.child_genome.clone());
        self.orchestrator.active_cells.entry(receipt.child_cell.cell_id)
            .or_insert_with(|| receipt.child_cell.clone());
        Ok(())
    }
}

fn child_genome(parents: (&Genome, &Genome), context: CrossoverContext) -> Result<Genome, String> {
    let (parent_a, parent_b) = parents;
    let mut rng = StdRng::seed_from_u64(context.seed);
    let mut child = fertilize(parent_a, parent_b, &mut rng);
    child.set_identity(deterministic_id(&format!("child-genome:{}:{}:{}:{}", context.mission_id, context.seed, parent_a.genome_id(), parent_b.genome_id())));
    child.validate()?;
    Ok(child)
}

fn child_cell(parent: &AgentCell, genome: &Genome, context: CrossoverContext) -> AgentCell {
    let mut child = parent.clone();
    child.cell_id = deterministic_id(&format!("child-cell:{}:{}:{}", context.mission_id, context.seed, genome.genome_id()));
    child.name = format!("Croisement_G{}", genome.generation);
    child.name_meaning = "Descendance issue de deux génomes parentaux".into();
    child.genome_id = Some(genome.genome_id());
    child.bud_scars = 0;
    child.bud_scar_ids.clear();
    child.is_senescent = false;
    child
}

fn validate_receipt(receipt: &CrossoverReceipt, mission_id: Uuid) -> Result<(), String> {
    if receipt.schema != CROSSOVER_SCHEMA || receipt.mission_id != mission_id {
        return Err("crossover receipt schema or mission mismatch".into());
    }
    validate_receipt_identity(receipt, mission_id)?;
    validate_child_replay(receipt, CrossoverContext { mission_id, seed: receipt.seed })
}

fn validate_receipt_identity(receipt: &CrossoverReceipt, mission_id: Uuid) -> Result<(), String> {
    validate_parent(&receipt.parent_a)?;
    validate_parent(&receipt.parent_b)?;
    validate_distinct_parents(&receipt.parent_a, &receipt.parent_b)?;
    let identity = CrossoverIdentity {
        mission_id,
        parent_a_cell_id: receipt.parent_a.cell.cell_id,
        parent_b_cell_id: receipt.parent_b.cell.cell_id,
        seed: receipt.seed,
    };
    let key = receipt_key(&identity);
    if receipt.idempotency_key != key || receipt.receipt_id != deterministic_id(&key) {
        return Err("crossover receipt identity is inconsistent".into());
    }
    Ok(())
}

fn validate_child_replay(receipt: &CrossoverReceipt, context: CrossoverContext) -> Result<(), String> {
    let expected = child_genome((&receipt.parent_a.genome, &receipt.parent_b.genome), context)?;
    let expected_fingerprint = expected.fingerprint()?;
    let expected_cell = child_cell(&receipt.parent_a.cell, &expected, context);
    validate_child_genome(receipt, &expected, &expected_fingerprint)?;
    validate_child_cell(receipt, &expected_cell)?;
    Ok(())
}

fn validate_child_genome(receipt: &CrossoverReceipt, expected: &Genome, fingerprint: &GenomeFingerprint) -> Result<(), String> {
    let parent_ids = [receipt.parent_a.genome.genome_id(), receipt.parent_b.genome.genome_id()];
    if receipt.child_fingerprint != *fingerprint
        || receipt.child_genome.fingerprint()? != *fingerprint
        || receipt.child_genome != *expected
        || receipt.child_genome.parent_ids != parent_ids
    {
        return Err("crossover child genome does not replay from its parents and seed".into());
    }
    Ok(())
}

fn validate_child_cell(receipt: &CrossoverReceipt, expected: &AgentCell) -> Result<(), String> {
    let actual = serde_json::to_value(&receipt.child_cell).map_err(|error| error.to_string())?;
    let expected = serde_json::to_value(expected).map_err(|error| error.to_string())?;
    if actual != expected { return Err("crossover child cell does not match the replayed genome".into()); }
    Ok(())
}

fn validate_parent(parent: &CrossoverParent) -> Result<(), String> {
    parent.genome.validate()?;
    if parent.cell.genome_id != Some(parent.genome.genome_id())
        || parent.fingerprint != parent.genome.fingerprint()?
    {
        return Err("crossover parent fingerprint or cell binding is invalid".into());
    }
    Ok(())
}

fn validate_distinct_parents(a: &CrossoverParent, b: &CrossoverParent) -> Result<(), String> {
    if a.cell.cell_id == b.cell.cell_id || a.genome.genome_id() == b.genome.genome_id() {
        return Err("crossover requires two distinct parent cells and genomes".into());
    }
    Ok(())
}

fn receipt_key(identity: &CrossoverIdentity) -> String {
    format!("{}:{}:{}:{}", identity.mission_id, identity.parent_a_cell_id, identity.parent_b_cell_id, identity.seed)
}

pub fn request_key(mission_id: Uuid, request: &CrossoverRequest) -> String {
    receipt_key(&CrossoverIdentity {
        mission_id,
        parent_a_cell_id: request.parent_a_cell_id,
        parent_b_cell_id: request.parent_b_cell_id,
        seed: request.seed,
    })
}

struct ReceiptParts {
    mission_id: Uuid,
    seed: u64,
    parent_a: CrossoverParent,
    parent_b: CrossoverParent,
    child_genome: Genome,
    child_cell: AgentCell,
}

fn make_receipt(parts: ReceiptParts) -> Result<CrossoverReceipt, String> {
    let ReceiptParts { mission_id, seed, parent_a, parent_b, child_genome, child_cell } = parts;
    let identity = CrossoverIdentity {
        mission_id,
        parent_a_cell_id: parent_a.cell.cell_id,
        parent_b_cell_id: parent_b.cell.cell_id,
        seed,
    };
    let key = receipt_key(&identity);
    Ok(CrossoverReceipt {
        schema: CROSSOVER_SCHEMA.into(),
        receipt_id: deterministic_id(&key),
        idempotency_key: key,
        mission_id,
        seed,
        parent_a,
        parent_b,
        child_fingerprint: child_genome.fingerprint()?,
        child_cell,
        child_genome,
    })
}

fn deterministic_id(value: &str) -> Uuid {
    let digest = Sha256::digest(value.as_bytes());
    let mut bytes = [0_u8; 16];
    bytes.copy_from_slice(&digest[..16]);
    bytes[6] = (bytes[6] & 0x0f) | 0x80;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    Uuid::from_bytes(bytes)
}

fn check_existing_parent(ecosystem: &GenosEcosystem, parent: &CrossoverParent) -> Result<(), String> {
    if let Some(existing) = ecosystem.orchestrator.genomes.get(&parent.genome.genome_id()) {
        if existing.fingerprint()? != parent.fingerprint { return Err("restored crossover parent genome conflicts with runtime".into()); }
    }
    if let Some(existing) = ecosystem.orchestrator.active_cells.get(&parent.cell.cell_id) {
        if serde_json::to_value(existing).map_err(|error| error.to_string())?
            != serde_json::to_value(&parent.cell).map_err(|error| error.to_string())? {
            return Err("restored crossover parent cell conflicts with runtime".into());
        }
    }
    Ok(())
}

fn check_existing_child(ecosystem: &GenosEcosystem, receipt: &CrossoverReceipt) -> Result<(), String> {
    if let Some(existing) = ecosystem.orchestrator.genomes.get(&receipt.child_genome.genome_id()) {
        if existing.fingerprint()? != receipt.child_fingerprint {
            return Err("restored crossover child genome conflicts with runtime".into());
        }
    }
    if let Some(existing) = ecosystem.orchestrator.active_cells.get(&receipt.child_cell.cell_id) {
        if serde_json::to_value(existing).map_err(|error| error.to_string())?
            != serde_json::to_value(&receipt.child_cell).map_err(|error| error.to_string())? {
            return Err("restored crossover child cell conflicts with runtime".into());
        }
    }
    Ok(())
}

#[cfg(test)]
#[path = "mission_crossover_tests.rs"]
mod tests;

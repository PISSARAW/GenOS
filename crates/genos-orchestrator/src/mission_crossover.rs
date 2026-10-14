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

const CROSSOVER_SCHEMA: &str = "genos.mission-crossover-receipt/v1";

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
            self.orchestrator.genomes.insert(parent.genome.genome_id(), parent.genome.clone());
            self.orchestrator.active_cells.insert(parent.cell.cell_id, parent.cell.clone());
        }
        self.orchestrator.genomes.insert(receipt.child_genome.genome_id(), receipt.child_genome.clone());
        self.orchestrator.active_cells.insert(receipt.child_cell.cell_id, receipt.child_cell.clone());
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
        if existing.fingerprint()? != receipt.child_fingerprint { return Err("restored crossover child genome conflicts with runtime".into()); }
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
mod tests {
    use super::*;
    use serde_json::Value;

    #[test]
    fn seeded_crossover_is_durable_idempotent_and_replayable_after_restart() {
        let directory = tempfile::tempdir().unwrap();
        let store_path = directory.path().join("crossovers.jsonl");
        let store = BiologicalReceiptStore::open(&store_path);
        let mission_id = Uuid::new_v4();
        let mut ecosystem = GenosEcosystem::new("crossover-test");
        ecosystem.set_mission_id(mission_id);
        ecosystem.orchestrator.create_tissue("Arena", "Reproduction").unwrap();
        let a_cell = ecosystem.orchestrator.orchestrator_id;
        let a_genome = ecosystem.seed_germline(a_cell, "parent A").unwrap();
        let b_cell = ecosystem.orchestrator.add_worker("Arena", AgentCell::new("B", "parent B", "cell")).unwrap();
        let b_genome = ecosystem.seed_germline(b_cell, "parent B").unwrap();

        let request = CrossoverRequest { parent_a_cell_id: a_cell, parent_b_cell_id: b_cell, seed: 941 };
        let receipt = ecosystem.crossover_for_mission(request, &store).unwrap();
        let retry = ecosystem.crossover_for_mission(
            CrossoverRequest { parent_a_cell_id: a_cell, parent_b_cell_id: b_cell, seed: 941 }, &store,
        ).unwrap();
        assert_eq!(receipt.child_fingerprint, retry.child_fingerprint);
        assert_eq!(receipt.parent_a.fingerprint.genome_id, a_genome);
        assert_eq!(receipt.parent_b.fingerprint.genome_id, b_genome);
        assert_eq!(receipt.child_genome.parent_ids, vec![a_genome, b_genome]);
        assert_eq!(store.read_all().unwrap().len(), 1);

        let reopened = BiologicalReceiptStore::open(&store_path);
        let mut restored = GenosEcosystem::new("crossover-restart");
        restored.set_mission_id(mission_id);
        let replayed = restored.replay_crossover_for_mission(&receipt.idempotency_key, &reopened).unwrap();
        assert_eq!(replayed.child_fingerprint, receipt.child_fingerprint);
        assert!(restored.orchestrator.active_cells.contains_key(&receipt.child_cell.cell_id));
        assert_eq!(restored.orchestrator.genomes[&receipt.child_genome.genome_id()].fingerprint().unwrap(), receipt.child_fingerprint);
    }

    #[test]
    fn replay_rejects_wrong_mission_and_tampered_child() {
        let directory = tempfile::tempdir().unwrap();
        let store = BiologicalReceiptStore::open(directory.path().join("crossovers.jsonl"));
        let mut ecosystem = GenosEcosystem::new("crossover-test");
        let mission_id = Uuid::new_v4();
        ecosystem.set_mission_id(mission_id);
        ecosystem.orchestrator.create_tissue("Arena", "Reproduction").unwrap();
        let a = ecosystem.orchestrator.orchestrator_id;
        ecosystem.seed_germline(a, "parent A").unwrap();
        let b = ecosystem.orchestrator.add_worker("Arena", AgentCell::new("B", "parent B", "cell")).unwrap();
        ecosystem.seed_germline(b, "parent B").unwrap();
        let receipt = ecosystem.crossover_for_mission(CrossoverRequest { parent_a_cell_id: a, parent_b_cell_id: b, seed: 42 }, &store).unwrap();
        let mut wrong = GenosEcosystem::new("wrong-mission");
        wrong.set_mission_id(Uuid::new_v4());
        assert!(wrong.replay_crossover_for_mission(&receipt.idempotency_key, &store).is_err());

        let mut value: Value = store.read_all().unwrap().remove(0);
        value["child_genome"]["generation"] = serde_json::json!(999);
        assert!(validate_receipt(&serde_json::from_value(value).unwrap(), mission_id).is_err());
    }
}

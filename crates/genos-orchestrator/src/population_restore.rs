use crate::GenosEcosystem;
use genos_store::BiologicalReceiptStore;
use genos_cell::AgentCell;
use genos_genome::Genome;
use serde_json::Value;
use uuid::Uuid;

fn restore_cell(entry: &Value) -> Result<(AgentCell, Option<Genome>), String> {
    let cell: AgentCell = serde_json::from_value(entry["cell_state"].clone()).map_err(|e| e.to_string())?;
    if entry["cell_id"] != cell.cell_id.to_string() { return Err("population cell mismatch".into()); }
    let genome = if entry["genome_state"].is_null() { None }
        else { Some(serde_json::from_value::<Genome>(entry["genome_state"].clone()).map_err(|e| e.to_string())?) };
    validate_genome(&cell, genome.as_ref(), entry)?;
    Ok((cell, genome))
}

fn validate_genome(cell: &AgentCell, genome: Option<&Genome>, entry: &Value) -> Result<(), String> {
    let Some(genome) = genome else {
        return if cell.genome_id.is_none() { Ok(()) } else { Err("population genome missing".into()) };
    };
    let fingerprint = genome.fingerprint()?;
    if Some(fingerprint.genome_id) != cell.genome_id || entry["genome_fingerprint"] != fingerprint.content_hash {
        return Err("population genome mismatch".into());
    }
    Ok(())
}

impl GenosEcosystem {
    pub fn restore_population(&mut self, store: &BiologicalReceiptStore) -> Result<(), String> {
        let receipts = store.read_all()?;
        let snapshot = receipts.iter().rev().find(|item| item["schema"] == "genos.population-state/v1")
            .ok_or("population snapshot missing")?;
        let mission: Uuid = serde_json::from_value(snapshot["mission_id"].clone()).map_err(|e| e.to_string())?;
        if self.mission_id.is_some_and(|id| id != mission) { return Err("population mission mismatch".into()); }
        let entries = snapshot["active_cells"].as_array().ok_or("population cells missing")?;
        let mut cells = std::collections::HashMap::new();
        let mut genomes = std::collections::HashMap::new();
        for entry in entries {
            let (cell, genome) = restore_cell(entry)?;
            if let Some(genome) = genome { genomes.insert(genome.genome_id(), genome); }
            cells.insert(cell.cell_id, cell);
        }
        self.receipt_tick = snapshot["tick"].as_u64().ok_or("population tick missing")?;
        self.mission_id = Some(mission);
        self.orchestrator.active_cells = cells;
        self.orchestrator.genomes = genomes;
        Ok(())
    }
}

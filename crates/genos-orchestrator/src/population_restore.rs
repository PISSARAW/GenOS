use crate::GenosEcosystem;
use genos_store::BiologicalReceiptStore;
use genos_biology::spore::Spore;
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

fn spore_matches_entry(entry: &Value, spore: &Spore) -> Result<bool, String> {
    let fingerprint = spore.genome.fingerprint()?;
    let expected_id = format!("{}:{}", spore.parent_cell_id, fingerprint.genome_id);
    let spore_type = serde_json::to_value(&spore.spore_type).map_err(|error| error.to_string())?;
    Ok(entry["spore_id"] == expected_id
        && entry["parent_cell_id"] == spore.parent_cell_id.to_string()
        && entry["genome_id"] == fingerprint.genome_id.to_string()
        && entry["lineage_id"] == fingerprint.lineage_id.to_string()
        && entry["generation"] == spore.genome.generation
        && entry["genome_fingerprint"] == fingerprint.content_hash
        && entry["spore_type"] == spore_type)
}

fn restore_spore(entry: &Value) -> Result<(Spore, Option<String>), String> {
    let spore: Spore = serde_json::from_value(entry["spore_state"].clone())
        .map_err(|error| error.to_string())?;
    if !spore_matches_entry(entry, &spore)? {
        return Err("population spore mismatch".into());
    }
    let tissue = entry["tissue"].as_str().map(str::to_string);
    Ok((spore, tissue))
}

fn population_snapshot(store: &BiologicalReceiptStore) -> Result<Value, String> {
    store.read_all()?.into_iter().rev()
        .find(|item| item["schema"] == "genos.population-state/v1")
        .ok_or_else(|| "population snapshot missing".into())
}

fn restore_cells(entries: &[Value]) -> Result<(std::collections::HashMap<Uuid, AgentCell>, std::collections::HashMap<Uuid, Genome>), String> {
    let mut cells = std::collections::HashMap::new();
    let mut genomes = std::collections::HashMap::new();
    for entry in entries {
        let (cell, genome) = restore_cell(entry)?;
        if let Some(genome) = genome { genomes.insert(genome.genome_id(), genome); }
        cells.insert(cell.cell_id, cell);
    }
    Ok((cells, genomes))
}

fn restore_spores(entries: &[Value]) -> Result<(Vec<Spore>, std::collections::HashMap<Uuid, String>, std::collections::HashMap<Uuid, Genome>), String> {
    let mut spores = Vec::with_capacity(entries.len());
    let mut tissues = std::collections::HashMap::new();
    let mut genomes = std::collections::HashMap::new();
    for entry in entries {
        let (spore, tissue) = restore_spore(entry)?;
        genomes.insert(spore.genome.genome_id(), spore.genome.clone());
        if let Some(tissue) = tissue { tissues.insert(spore.parent_cell_id, tissue); }
        spores.push(spore);
    }
    Ok((spores, tissues, genomes))
}

impl GenosEcosystem {
    pub fn restore_population(&mut self, store: &BiologicalReceiptStore) -> Result<(), String> {
        let snapshot = population_snapshot(store)?;
        let mission: Uuid = serde_json::from_value(snapshot["mission_id"].clone()).map_err(|e| e.to_string())?;
        if self.mission_id.is_some_and(|id| id != mission) { return Err("population mission mismatch".into()); }
        let entries = snapshot["active_cells"].as_array().ok_or("population cells missing")?;
        let spore_entries = snapshot["dormant_spores"].as_array().ok_or("population spores missing")?;
        let tick = snapshot["tick"].as_u64().ok_or("population tick missing")?;
        let (cells, mut genomes) = restore_cells(entries)?;
        let (spores, spore_tissues, spore_genomes) = restore_spores(spore_entries)?;
        genomes.extend(spore_genomes);
        self.receipt_tick = tick;
        self.mission_id = Some(mission);
        self.orchestrator.active_cells = cells;
        self.orchestrator.genomes = genomes;
        self.orchestrator.dormant_spores = spores;
        self.orchestrator.spore_tissue_map = spore_tissues;
        Ok(())
    }
}

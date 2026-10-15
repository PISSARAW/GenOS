use crate::GenosEcosystem;
use genos_store::BiologicalReceiptStore;
use genos_biology::spore::Spore;
use genos_cell::AgentCell;
use genos_genome::Genome;
use genos_biology::tissue::Tissue;
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

fn population_snapshot(
    store: &BiologicalReceiptStore,
    expected_mission: Option<Uuid>,
) -> Result<Value, String> {
    let receipts = store.read_all()?;
    let matching = receipts.iter().rev()
        .find(|item| item["schema"] == "genos.population-state/v1"
            && expected_mission.is_none_or(|mission| item["mission_id"] == mission.to_string()));
    if let Some(snapshot) = matching {
        return Ok(snapshot.clone());
    }
    if expected_mission.is_some()
        && receipts.iter().any(|item| item["schema"] == "genos.population-state/v1")
    {
        return Err("population mission mismatch".into());
    }
    Err("population snapshot for mission missing".into())
}

fn restore_cells(entries: &[Value]) -> Result<(
    std::collections::HashMap<Uuid, AgentCell>,
    std::collections::HashMap<Uuid, Genome>,
    std::collections::HashMap<String, Vec<Uuid>>,
), String> {
    let mut cells = std::collections::HashMap::new();
    let mut genomes = std::collections::HashMap::new();
    let mut tissue_members = std::collections::HashMap::<String, Vec<Uuid>>::new();
    for entry in entries {
        let (cell, genome) = restore_cell(entry)?;
        if let Some(tissue) = entry["tissue"].as_str() {
            if tissue.trim().is_empty() { return Err("population tissue name is empty".into()); }
            tissue_members.entry(tissue.to_string()).or_default().push(cell.cell_id);
        } else if !entry["tissue"].is_null() {
            return Err("population tissue name is invalid".into());
        }
        if let Some(genome) = genome { genomes.insert(genome.genome_id(), genome); }
        if cells.insert(cell.cell_id, cell).is_some() {
            return Err("duplicate population cell".into());
        }
    }
    Ok((cells, genomes, tissue_members))
}

fn restore_tissues(
    members: std::collections::HashMap<String, Vec<Uuid>>,
    stem_cell_id: Uuid,
) -> std::collections::HashMap<String, Tissue> {
    members.into_iter().map(|(name, cell_ids)| {
        let mut tissue = Tissue::new(&name, "restored from population membership", stem_cell_id);
        for cell_id in cell_ids { tissue.integrate_cell(cell_id); }
        (name, tissue)
    }).collect()
}

fn restore_saved_tissues(
    snapshot: &Value,
    members: std::collections::HashMap<String, Vec<Uuid>>,
    stem_cell_id: Uuid,
) -> Result<std::collections::HashMap<String, Tissue>, String> {
    let Some(saved) = snapshot.get("tissues") else {
        return Ok(restore_tissues(members, stem_cell_id));
    };
    let tissues: std::collections::HashMap<String, Tissue> = serde_json::from_value(saved.clone())
        .map_err(|error| format!("invalid population tissues: {error}"))?;
    for (name, tissue) in &tissues {
        let member_ids = members.get(name).map(Vec::as_slice).unwrap_or_default();
        if tissue.name != *name || tissue.stem_cell_id != stem_cell_id
            || !same_members(&tissue.somatic_cells, member_ids) {
            return Err("population tissue membership mismatch".into());
        }
    }
    if members.keys().any(|name| !tissues.contains_key(name)) {
        return Err("population tissue is missing".into());
    }
    Ok(tissues)
}

fn same_members(left: &[Uuid], right: &[Uuid]) -> bool {
    left.len() == right.len() && left.iter().all(|id| right.contains(id))
}

fn validate_mission_identity(
    expected: Option<Uuid>,
    current: Option<Uuid>,
    restored: Uuid,
) -> Result<(), String> {
    if expected.is_some_and(|id| id != restored) || current.is_some_and(|id| id != restored) {
        return Err("population mission mismatch".into());
    }
    Ok(())
}

fn snapshot_orchestrator_id(
    snapshot: &Value,
    fallback: Uuid,
    cells: &std::collections::HashMap<Uuid, AgentCell>,
) -> Result<Uuid, String> {
    let id = match snapshot.get("orchestrator_id") {
        None => cells.values()
            .find(|cell| cell.name_meaning == "Orchestrateur Souche" && cell.role == "Stem")
            .map(|cell| cell.cell_id)
            .unwrap_or(fallback),
        Some(value) => value.as_str().ok_or("population orchestrator id is invalid")?
            .parse::<Uuid>().map_err(|error| error.to_string())?,
    };
    if !cells.contains_key(&id) {
        return Err("population orchestrator cell is missing".into());
    }
    Ok(id)
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
        self.restore_population_for_mission(store, self.mission_id)
    }

    /// Reopen the configured biological journal and restore the active mission
    /// before its runtime starts processing ticks.
    pub fn resume_mission_from_journal(&mut self, mission_id: Uuid) -> Result<(), String> {
        let path = self
            .receipt_journal
            .as_ref()
            .ok_or_else(|| "biological receipt journal is not configured".to_string())?;
        let store = BiologicalReceiptStore::open(path);
        self.restore_population_for_mission(&store, Some(mission_id))
    }

    fn restore_population_for_mission(
        &mut self,
        store: &BiologicalReceiptStore,
        expected_mission: Option<Uuid>,
    ) -> Result<(), String> {
        let requested_mission = expected_mission.or(self.mission_id);
        let snapshot = population_snapshot(store, requested_mission)?;
        let mission: Uuid = match serde_json::from_value(snapshot["mission_id"].clone()) {
            Ok(mission) => mission,
            Err(error) => return Err(error.to_string()),
        };
        validate_mission_identity(expected_mission, self.mission_id, mission)?;
        let entries = snapshot["active_cells"].as_array().ok_or("population cells missing")?;
        let spore_entries = snapshot["dormant_spores"].as_array().ok_or("population spores missing")?;
        let tick = snapshot["tick"].as_u64().ok_or("population tick missing")?;
        let (cells, mut genomes, tissue_members) = restore_cells(entries)?;
        let (spores, spore_tissues, spore_genomes) = restore_spores(spore_entries)?;
        let orchestrator_id = snapshot_orchestrator_id(
            &snapshot, self.orchestrator.orchestrator_id, &cells,
        )?;
        let tissues = restore_saved_tissues(&snapshot, tissue_members, orchestrator_id)?;
        genomes.extend(spore_genomes);
        self.receipt_tick = tick;
        self.mission_id = Some(mission);
        self.orchestrator.orchestrator_id = orchestrator_id;
        self.orchestrator.active_cells = cells;
        self.orchestrator.tissues = tissues;
        self.orchestrator.genomes = genomes;
        self.orchestrator.dormant_spores = spores;
        self.orchestrator.spore_tissue_map = spore_tissues;
        Ok(())
    }
}

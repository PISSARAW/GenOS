//! Validation and replay for reproduction-linked population snapshots.

use crate::GenosEcosystem;
use crate::reproduction_lineage_replay::ReproductionLineageReceipt;
use genos_biology::spore::Spore;
use genos_cell::AgentCell;
use genos_genome::Genome;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use uuid::Uuid;

const SNAPSHOT_SCHEMA: &str = "genos.population-state/v1";
const LINK_SCHEMA: &str = "genos.reproduction-lineage-recovery/v1";

pub(super) struct SnapshotLineageInput<'a> {
    pub mission_id: Uuid,
    pub parent: &'a AgentCell,
    pub daughter: &'a AgentCell,
}

pub(super) fn linked_snapshot(
    entries: &[Value],
    receipt: &ReproductionLineageReceipt,
) -> Result<Option<Value>, String> {
    let Some(expected_digest) = receipt.population_snapshot_sha256.as_deref() else {
        return Ok(None);
    };
    let (link_index, link) = linked_event(entries, receipt)?;
    let snapshot = snapshot_before_link(entries, link_index, link, receipt)?;
    if snapshot_digest(snapshot)? != expected_digest {
        return Err("reproduction population snapshot digest mismatch".into());
    }
    validate_snapshot_seed(snapshot, receipt.campaign_seed)?;
    Ok(Some(snapshot.clone()))
}

pub(super) fn reproduction_receipt_digest(
    receipt: &ReproductionLineageReceipt,
) -> Result<String, String> {
    let encoded = serde_json::to_vec(receipt).map_err(|error| error.to_string())?;
    Ok(format!("{:x}", Sha256::digest(encoded)))
}

fn linked_event<'a>(
    entries: &'a [Value],
    receipt: &ReproductionLineageReceipt,
) -> Result<(usize, &'a Value), String> {
    let link = entries.iter().enumerate().rev()
        .find(|(_, item)| item["schema"] == LINK_SCHEMA
            && item["idempotency_key"] == receipt.idempotency_key)
        .ok_or("reproduction population recovery link missing")?;
    let (index, value) = link;
    if value["mission_id"] != receipt.mission_id.to_string()
        || value["population_snapshot_sha256"] != receipt.population_snapshot_sha256.as_deref().unwrap_or_default()
    {
        return Err("reproduction recovery link identity mismatch".into());
    }
    validate_linked_receipt_digest(value, receipt)?;
    Ok((index, value))
}

fn validate_linked_receipt_digest(link: &Value, receipt: &ReproductionLineageReceipt) -> Result<(), String> {
    let expected = reproduction_receipt_digest(receipt)?;
    if link.get("reproduction_receipt_sha256").is_some() {
        return if link["reproduction_receipt_sha256"] == expected {
            Ok(())
        } else {
            Err("reproduction receipt digest mismatch".into())
        };
    }
    if receipt.campaign_seed.is_some() {
        return Err("seeded reproduction receipt digest missing".into());
    }
    Ok(())
}

fn snapshot_before_link<'a>(
    entries: &'a [Value],
    link_index: usize,
    link: &Value,
    receipt: &ReproductionLineageReceipt,
) -> Result<&'a Value, String> {
    let tick = link["tick"].as_u64().ok_or("reproduction population tick missing")?;
    entries[..link_index].iter().rev()
        .find(|item| item["schema"] == SNAPSHOT_SCHEMA
            && item["mission_id"] == receipt.mission_id.to_string()
            && item["tick"] == tick)
        .ok_or_else(|| "linked reproduction population snapshot missing".into())
}

pub(super) fn validate_snapshot_lineage(
    snapshot: &Value,
    receipt: &ReproductionLineageReceipt,
) -> Result<(), String> {
    validate_snapshot_lineage_fields(snapshot, SnapshotLineageInput {
        mission_id: receipt.mission_id,
        parent: &receipt.parent_cell,
        daughter: &receipt.daughter_cell,
    })
}

pub(super) fn validate_snapshot_lineage_fields(
    snapshot: &Value,
    lineage: SnapshotLineageInput<'_>,
) -> Result<(), String> {
    validate_snapshot_identity(snapshot, lineage.mission_id)?;
    let cells = snapshot["active_cells"].as_array()
        .ok_or("reproduction population active cells missing")?;
    for expected in [lineage.parent, lineage.daughter] {
        if !cells.iter().any(|entry| snapshot_has_cell(entry, expected)) {
            return Err("reproduction lineage is absent from its population snapshot".into());
        }
    }
    Ok(())
}

fn validate_snapshot_identity(snapshot: &Value, mission_id: Uuid) -> Result<(), String> {
    if snapshot["schema"] != SNAPSHOT_SCHEMA
        || snapshot["mission_id"] != mission_id.to_string()
        || snapshot["tick"].as_u64().is_none()
    {
        return Err("reproduction population snapshot identity mismatch".into());
    }
    Ok(())
}

fn validate_snapshot_seed(snapshot: &Value, expected: Option<u64>) -> Result<(), String> {
    let stored = match snapshot.get("reproduction_seed") {
        None | Some(Value::Null) => None,
        Some(Value::Number(value)) => value.as_u64(),
        _ => None,
    };
    if stored != expected {
        return Err("reproduction campaign seed differs from linked population snapshot".into());
    }
    Ok(())
}

fn snapshot_has_cell(entry: &Value, cell: &AgentCell) -> bool {
    entry["cell_id"] == cell.cell_id.to_string()
        && entry["genome_id"] == cell.genome_id.map(|id| id.to_string()).unwrap_or_default()
}

pub(super) fn snapshot_digest(snapshot: &Value) -> Result<String, String> {
    let encoded = serde_json::to_vec(snapshot).map_err(|error| error.to_string())?;
    Ok(format!("{:x}", Sha256::digest(encoded)))
}

pub(super) fn restore_population_snapshot(
    ecosystem: &mut GenosEcosystem,
    snapshot: &Value,
) -> Result<(), String> {
    let mission_id: Uuid = serde_json::from_value(snapshot["mission_id"].clone())
        .map_err(|error| error.to_string())?;
    validate_ecosystem_mission(ecosystem, mission_id)?;
    ecosystem.restore_reproduction_seed(snapshot_reproduction_seed(snapshot)?)?;
    let (cells, mut genomes) = restore_cells(snapshot)?;
    let (spores, spore_tissues, spore_genomes) = restore_spores(snapshot)?;
    genomes.extend(spore_genomes);
    ecosystem.mission_id = Some(mission_id);
    ecosystem.receipt_tick = snapshot["tick"].as_u64().ok_or("reproduction population tick missing")?;
    ecosystem.orchestrator.active_cells = cells;
    ecosystem.orchestrator.genomes = genomes;
    ecosystem.orchestrator.dormant_spores = spores;
    ecosystem.orchestrator.spore_tissue_map = spore_tissues;
    Ok(())
}

fn snapshot_reproduction_seed(snapshot: &Value) -> Result<Option<u64>, String> {
    match snapshot.get("reproduction_seed") {
        None | Some(Value::Null) => Ok(None),
        Some(Value::Number(value)) => value.as_u64().map(Some)
            .ok_or_else(|| "reproduction population seed is invalid".into()),
        _ => Err("reproduction population seed is invalid".into()),
    }
}

fn validate_ecosystem_mission(ecosystem: &GenosEcosystem, mission_id: Uuid) -> Result<(), String> {
    if ecosystem.mission_id.is_some_and(|mission| mission != mission_id) {
        return Err("reproduction population mission mismatch".into());
    }
    Ok(())
}

fn restore_cells(
    snapshot: &Value,
) -> Result<(HashMap<Uuid, AgentCell>, HashMap<Uuid, Genome>), String> {
    let entries = snapshot["active_cells"].as_array()
        .ok_or("reproduction population active cells missing")?;
    let mut cells = HashMap::new();
    let mut genomes = HashMap::new();
    for entry in entries {
        let cell: AgentCell = serde_json::from_value(entry["cell_state"].clone())
            .map_err(|error| error.to_string())?;
        let genome = restore_cell_genome(entry, &cell)?;
        if let Some(genome) = genome {
            genomes.insert(genome.genome_id(), genome);
        }
        cells.insert(cell.cell_id, cell);
    }
    Ok((cells, genomes))
}

fn restore_cell_genome(entry: &Value, cell: &AgentCell) -> Result<Option<Genome>, String> {
    if entry["cell_id"] != cell.cell_id.to_string() {
        return Err("reproduction population cell identity mismatch".into());
    }
    let genome = if entry["genome_state"].is_null() {
        None
    } else {
        Some(serde_json::from_value::<Genome>(entry["genome_state"].clone())
            .map_err(|error| error.to_string())?)
    };
    let Some(genome) = genome else {
        return if cell.genome_id.is_some() {
            Err("reproduction population genome missing".into())
        } else { Ok(None) };
    };
    let fingerprint = genome.fingerprint()?;
    if cell.genome_id != Some(fingerprint.genome_id)
        || entry["genome_fingerprint"] != fingerprint.content_hash
    {
        return Err("reproduction population genome identity mismatch".into());
    }
    Ok(Some(genome))
}

fn restore_spores(
    snapshot: &Value,
) -> Result<(Vec<Spore>, HashMap<Uuid, String>, HashMap<Uuid, Genome>), String> {
    let entries = snapshot["dormant_spores"].as_array()
        .ok_or("reproduction population spores missing")?;
    let mut spores = Vec::new();
    let mut tissues = HashMap::new();
    let mut genomes = HashMap::new();
    for entry in entries {
        let spore: Spore = serde_json::from_value(entry["spore_state"].clone())
            .map_err(|error| error.to_string())?;
        let fingerprint = spore.genome.fingerprint()?;
        if entry["genome_id"] != fingerprint.genome_id.to_string()
            || entry["lineage_id"] != fingerprint.lineage_id.to_string()
            || entry["genome_fingerprint"] != fingerprint.content_hash
        {
            return Err("reproduction population spore identity mismatch".into());
        }
        genomes.insert(fingerprint.genome_id, spore.genome.clone());
        if let Some(tissue) = entry["tissue"].as_str() {
            tissues.insert(spore.parent_cell_id, tissue.to_string());
        }
        spores.push(spore);
    }
    Ok((spores, tissues, genomes))
}

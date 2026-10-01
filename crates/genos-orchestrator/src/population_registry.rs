use crate::GenosEcosystem;
use serde_json::{Value, json};

impl GenosEcosystem {
    /// Produit un snapshot versionné de la population active et dormante.
    pub fn population_state_receipt(&self, tick: u64) -> Result<Value, String> {
        let cells = self
            .orchestrator
            .active_cells
            .iter()
            .map(|(cell_id, cell)| {
                let genome = cell.genome_id.and_then(|id| self.orchestrator.genomes.get(&id));
                let fingerprint = genome.map(|entry| entry.fingerprint()).transpose()?;
                Ok(json!({
                    "cell_id": cell_id,
                    "cell_state": cell,
                    "cell_state_json": serde_json::to_value(cell).map_err(|e| e.to_string())?.to_string(),
                    "genome_state": genome,
                    "genome_id": cell.genome_id,
                    "lineage_id": genome.map(|entry| entry.lineage_id()),
                    "generation": genome.map(|entry| entry.generation),
                    "tissue": self.orchestrator.owning_tissue(*cell_id),
                    "genome_fingerprint": fingerprint.map(|entry| entry.content_hash),
                    "senescent": cell.is_senescent,
                    "ephemeral": cell.is_ephemeral
                }))
            })
            .collect::<Result<Vec<Value>, String>>()?;
        let spores = self
            .orchestrator
            .dormant_spores
            .iter()
            .map(|spore| {
                let fingerprint = spore.genome.fingerprint()?;
                Ok(json!({
                    "spore_id": format!("{}:{}", spore.parent_cell_id, spore.genome.genome_id()),
                    "parent_cell_id": spore.parent_cell_id,
                    "spore_type": spore.spore_type,
                    "genome_id": fingerprint.genome_id,
                    "lineage_id": fingerprint.lineage_id,
                    "generation": spore.genome.generation,
                    "genome_fingerprint": fingerprint.content_hash
                }))
            })
            .collect::<Result<Vec<Value>, String>>()?;
        Ok(json!({
            "schema": "genos.population-state/v1",
            "mission_id": self.mission_id,
            "tick": tick,
            "phase": "after_tick",
            "active_cells": cells,
            "dormant_spores": spores
        }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::genos_cell::AgentCell;

    #[test]
    fn population_snapshot_preserves_cell_and_spore_lineage() {
        let mut ecosystem = GenosEcosystem::new("population-registry");
        ecosystem.orchestrator.create_tissue("Tissue A", "Exec").unwrap();
        let cell = ecosystem
            .orchestrator
            .add_worker("Tissue A", AgentCell::new("cell", "w", "Soma"))
            .unwrap();
        let genome_id = ecosystem.seed_germline(cell, "POPULATION").unwrap();
        let lineage_id = ecosystem.orchestrator.genomes[&genome_id].lineage_id();
        ecosystem.orchestrator.sporulate_cell(cell, genos_biology::spore::SporeType::FungalReproductive).unwrap();

        let snapshot = ecosystem.population_state_receipt(4).unwrap();
        assert_eq!(snapshot["schema"], "genos.population-state/v1");
        assert!(!snapshot["active_cells"].as_array().unwrap().iter().any(|entry| entry["cell_id"] == cell.to_string()));
        assert_eq!(snapshot["dormant_spores"][0]["lineage_id"], lineage_id.to_string());
        assert!(snapshot["dormant_spores"][0]["genome_fingerprint"].is_string());
    }
}

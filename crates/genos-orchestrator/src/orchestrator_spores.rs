use crate::orchestrator::BiomimeticOrchestrator;
use genos_biology::spore::{Spore, SporeFromCell, SporeType};
use genos_genome::Genome;
use genos_cell::AgentCell;
use uuid::Uuid;

impl BiomimeticOrchestrator {
    pub(crate) fn detach_from_tissues(&mut self, cell_id: Uuid) -> Option<String> {
        let mut origin = None;
        for (name, tissue) in self.tissues.iter_mut() {
            let before = tissue.somatic_cells.len();
            tissue.somatic_cells.retain(|id| *id != cell_id);
            if tissue.somatic_cells.len() < before {
                origin = Some(name.clone());
            }
        }
        origin
    }

    pub fn owning_tissue(&self, cell_id: Uuid) -> Option<String> {
        self.tissues
            .iter()
            .find(|(_, tissue)| tissue.somatic_cells.contains(&cell_id))
            .map(|(name, _)| name.clone())
    }

    pub fn sporulate_cell(
        &mut self,
        worker_id: Uuid,
        spore_type: SporeType,
    ) -> Result<usize, String> {
        let worker = self
            .active_cells
            .remove(&worker_id)
            .ok_or_else(|| format!("Cellule {} non trouvée", worker_id))?;
        let origin = self.detach_from_tissues(worker_id);
        let genome = worker
            .genome_id
            .and_then(|genome_id| self.genomes.get(&genome_id).cloned())
            .unwrap_or_else(|| Genome::new(&worker.role));
        self.genomes.insert(genome.genome_id(), genome.clone());
        let spore = match spore_type {
            SporeType::BacterialEndospore => Spore::from_cell(SporeFromCell {
                spore_type: spore_type.clone(),
                cell: &worker,
                genome,
                bunker_armor: 9999,
            }),
            SporeType::FungalReproductive => Spore::from_cell(SporeFromCell {
                spore_type: spore_type.clone(),
                cell: &worker,
                genome,
                bunker_armor: 0,
            }),
        };
        if let Some(tissue_name) = origin {
            self.spore_tissue_map.insert(worker_id, tissue_name);
        }
        self.dormant_spores.push(spore);
        Ok(self.dormant_spores.len() - 1)
    }

    pub fn germinate_spore(
        &mut self,
        index: usize,
        conditions: (bool, bool),
    ) -> Result<AgentCell, String> {
        if index >= self.dormant_spores.len() {
            return Err("Index de spore invalide".to_string());
        }
        let (warm_and_wet, nutrients_available) = conditions;
        let spore = self.dormant_spores[index].clone();
        let genome = spore.genome.clone();
        let revived_cell = spore.germinate(warm_and_wet, nutrients_available)?;
        self.dormant_spores.remove(index);
        self.genomes.insert(genome.genome_id(), genome);
        let cell_id = revived_cell.cell_id;
        if let Some(tissue_name) = self.spore_tissue_map.remove(&cell_id)
            && let Some(tissue) = self.tissues.get_mut(&tissue_name)
        {
            tissue.integrate_cell(cell_id);
        }
        self.active_cells.insert(cell_id, revived_cell.clone());
        Ok(revived_cell)
    }
}
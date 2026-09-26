use crate::orchestrator::BiomimeticOrchestrator;
use genos_biology::embryology::{
    cleave_zygote, differentiate_swarm, sculpt_architecture_via_apoptosis, seed_hox_genome,
};
use genos_genome::Genome;
use genos_cell::AgentCell;
use uuid::Uuid;

impl BiomimeticOrchestrator {
    pub fn cleave_and_differentiate(&mut self, divisions: u32, gradient: f64) -> Vec<AgentCell> {
        let zygote = AgentCell::new("Zygote_Origin", "Origine clonale", "Embryo");
        let mut swarm = cleave_zygote(zygote, divisions);
        let mut genome = seed_hox_genome("HOX_BLUEPRINT");
        differentiate_swarm(&mut swarm, gradient, &mut genome);
        sculpt_architecture_via_apoptosis(&mut swarm);
        self.genomes.insert(genome.genome_id(), genome.clone());
        swarm
    }

    pub fn trigger_endosymbiosis(
        &mut self,
        host_id: Uuid,
        symbiont_id: Uuid,
    ) -> Result<(), String> {
        {
            let host = self
                .active_cells
                .get(&host_id)
                .ok_or_else(|| format!("Hôte {} introuvable", host_id))?;
            host.can_phagocytize(symbiont_id)?;
        }
        if !self.active_cells.contains_key(&symbiont_id) {
            return Err(format!(
                "Symbionte {} introuvable ou déjà phagocyté",
                symbiont_id
            ));
        }

        let symbiont = self
            .active_cells
            .remove(&symbiont_id)
            .ok_or_else(|| format!("Symbionte {} introuvable ou déjà phagocyté", symbiont_id))?;
        self.detach_from_tissues(symbiont_id);
        let host = self
            .active_cells
            .get_mut(&host_id)
            .ok_or_else(|| format!("Hôte {} introuvable", host_id))?;
        host.phagocytize(symbiont)?;

        self.emit_bioluminescence(
            genos_biology::bioluminescence::FluorophoreColor::Green,
            "Mitochondria",
            (
                "ENDOSYMBIOSIS",
                "Symbiont successfully integrated as organelle",
            ),
        );

        Ok(())
    }
}
use crate::orchestrator::BiomimeticOrchestrator;
use crate::conscience::{CognitiveRegulationState, Conscience, BranchMetrics};
use genos_immune::{Antigen, ClonalSelection};
use genos_biology::bioluminescence::{BioluminescenceMicroscope, FluorophoreColor};
use genos_biology::redundancy::RedundancySystem;
use uuid::Uuid;

impl BiomimeticOrchestrator {
    pub fn detect_immune_threat(&mut self, antigen: &Antigen) -> bool {
        self.immune_selection.recognize(antigen)
    }

    pub fn evaluate_worker(
        &mut self,
        worker_id: Uuid,
        loop_metrics: (u32, f64),
    ) -> Result<CognitiveRegulationState, String> {
        let (errors_in_loop, progress_score) = loop_metrics;
        let worker = self
            .active_cells
            .get_mut(&worker_id)
            .ok_or_else(|| format!("Cellule {} non trouvée", worker_id))?;
        self.conscience.evaluate_branch(&mut worker.conscience, BranchMetrics { errors_in_loop, progress_score, health_score: 1.0, ..Default::default() });
        Ok(worker.conscience.clone())
    }

    pub fn evaluate_orchestrator(&mut self, loop_metrics: (u32, f64)) -> CognitiveRegulationState {
        if let Some(root) = self.active_cells.get_mut(&self.orchestrator_id) {
            self.conscience.evaluate_branch(&mut root.conscience, BranchMetrics { errors_in_loop: loop_metrics.0, progress_score: loop_metrics.1, health_score: 1.0, ..Default::default() });
            self.cognitive_regulation_state = root.conscience.clone();
        }
        self.cognitive_regulation_state.clone()
    }

    pub fn check_invariants(&self) -> Result<(), String> {
        for (name, tissue) in &self.tissues {
            for cell_id in &tissue.somatic_cells {
                if !self.active_cells.contains_key(cell_id) {
                    return Err(format!(
                        "tissu '{name}' reference la cellule absente {cell_id}"
                    ));
                }
            }
        }
        for spore in &self.dormant_spores {
            if !self.genomes.contains_key(&spore.genome.genome_id()) {
                return Err(format!(
                    "spore {} sans genome enregistre",
                    spore.parent_cell_id
                ));
            }
        }
        for cell_id in self.spore_tissue_map.keys() {
            if !self
                .dormant_spores
                .iter()
                .any(|s| s.parent_cell_id == *cell_id)
            {
                return Err(format!("spore_tissue_map orphelin pour {cell_id}"));
            }
        }
        Ok(())
    }

    pub fn execute_tool_resilient(
        &mut self,
        expected_tool: &str,
        mutated_tool: &str,
    ) -> Result<String, String> {
        match self
            .redundancy
            .execute_instruction_with_redundancy(expected_tool, mutated_tool)
        {
            Ok(()) => Ok(format!(
                "Instruction acceptée via dégénérescence du codon ({})",
                mutated_tool
            )),
            Err(_) => {
                let fallback_gene = self.redundancy.fallback_execution()?;
                Ok(format!(
                    "Bascule sur voie de secours métabolique : {}",
                    fallback_gene.locus
                ))
            }
        }
    }

    pub fn emit_bioluminescence(
        &self,
        color: FluorophoreColor,
        organelle: &str,
        event_info: (&str, &str),
    ) {
        let (event_type, details) = event_info;
        BioluminescenceMicroscope::emit_fluorescence(
            self.orchestrator_id,
            color,
            organelle,
            event_type,
            details,
        );
    }
}
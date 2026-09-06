use std::collections::HashMap;
use uuid::Uuid;
use serde::{Deserialize, Serialize};

use genos_biology::bioluminescence::{BioluminescenceMicroscope, FluorophoreColor};
use genos_biology::ecology::CollusionCheck;
use genos_biology::embryology::{cleave_zygote, differentiate_swarm, sculpt_architecture_via_apoptosis, seed_hox_genome};
use genos_biology::redundancy::RedundancySystem;
use genos_biology::spore::{Spore, SporeType};
use genos_biology::tissue::{TaskDelegation, Tissue};
use genos_cell::AgentCell;
use genos_genome::Genome;

use crate::conscience::{Conscience, ConscienceState};

/// L'Orchestrateur Biomimétique central de GenOS : coordonne les tissus cellulaires,
/// surveille la dissonance cognitive, applique l'écologie anti-collusion et gère
/// la résilience par sporulation et redondance génétique.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BiomimeticOrchestrator {
    pub orchestrator_id: Uuid,
    pub name: String,
    pub conscience_state: ConscienceState,
    pub tissues: HashMap<String, Tissue>,
    pub dormant_spores: Vec<Spore>,
    pub redundancy: RedundancySystem,
    pub active_cells: HashMap<Uuid, AgentCell>,
    pub conscience: Conscience,
}

impl BiomimeticOrchestrator {
    pub fn new(name: &str, max_dissonance: f64, baseline_budget: f64) -> Self {
        let root_cell = AgentCell::new(name, "Orchestrateur Souche", "Stem");
        let root_id = root_cell.cell_id;
        let mut active_cells = HashMap::new();
        active_cells.insert(root_id, root_cell);

        Self {
            orchestrator_id: root_id,
            name: name.to_string(),
            conscience_state: ConscienceState::default(),
            tissues: HashMap::new(),
            dormant_spores: Vec::new(),
            redundancy: RedundancySystem::new(),
            active_cells,
            conscience: Conscience::new(max_dissonance, baseline_budget),
        }
    }

    /// Crée et enregistre un nouveau Tissu cellulaire dirigé par la racine ou une cellule souche
    pub fn create_tissue(&mut self, name: &str, function_role: &str) -> &mut Tissue {
        let tissue = Tissue::new(name, function_role, self.orchestrator_id);
        self.tissues.insert(name.to_string(), tissue);
        self.tissues.get_mut(name).unwrap()
    }

    /// Intègre une cellule ouvrière dans un tissu donné
    pub fn add_worker(&mut self, tissue_name: &str, worker: AgentCell) -> Result<Uuid, String> {
        let worker_id = worker.cell_id;
        let tissue = self.tissues.get_mut(tissue_name)
            .ok_or_else(|| format!("Tissu '{}' introuvable", tissue_name))?;
        if self.active_cells.contains_key(&worker_id) {
            return Err(format!("Cellule {} déjà active", worker_id));
        }
        self.active_cells.insert(worker_id, worker);
        tissue.integrate_cell(worker_id);
        Ok(worker_id)
    }

    /// Délégation hiérarchique via Desmosomes intercellulaires
    pub fn delegate_task(&self, tissue_name: &str, target: (Uuid, &str)) -> Result<String, String> {
        let (to_id, task) = target;
        let tissue = self.tissues.get(tissue_name)
            .ok_or_else(|| format!("Tissu '{}' introuvable", tissue_name))?;
        tissue.delegate_task(TaskDelegation {
            from_id: tissue.stem_cell_id,
            to_id,
            task,
        })
    }

    /// Écologie évolutive : audit anti-collusion (Handicap de Zahavi et Arbitrage Réalité)
    pub fn audit_collusion(&mut self, tissue_name: &str, audit: (&str, u32, bool)) -> Result<String, String> {
        let (agent_id, consumed_tokens, physical_test_passed) = audit;
        let tissue = self.tissues.get_mut(tissue_name)
            .ok_or_else(|| format!("Tissu '{}' introuvable", tissue_name))?;
        let check = CollusionCheck {
            consumed_tokens,
            physical_test_passed,
        };
        tissue.ecology.enforce_anti_collusion(agent_id, check)
    }

    /// Évalue la conscience d'un agent ouvrier (dissonance / apoptose)
    pub fn evaluate_worker(&mut self, worker_id: Uuid, loop_metrics: (u32, f64)) -> Result<ConscienceState, String> {
        let (errors_in_loop, progress_score) = loop_metrics;
        let worker = self.active_cells.get_mut(&worker_id)
            .ok_or_else(|| format!("Cellule {} non trouvée", worker_id))?;
        self.conscience.evaluate_branch(&mut worker.conscience, errors_in_loop, progress_score);
        Ok(worker.conscience.clone())
    }

    pub fn evaluate_orchestrator(&mut self, loop_metrics: (u32, f64)) -> ConscienceState {
        let root = self.active_cells.get_mut(&self.orchestrator_id)
            .expect("orchestrator root cell must remain active");
        self.conscience.evaluate_branch(&mut root.conscience, loop_metrics.0, loop_metrics.1);
        self.conscience_state = root.conscience.clone();
        self.conscience_state.clone()
    }

    /// Sporulation : cryoconserve une cellule sous forme d'endospore résistante
    pub fn sporulate_cell(&mut self, worker_id: Uuid, spore_type: SporeType) -> Result<usize, String> {
        let worker = self.active_cells.remove(&worker_id)
            .ok_or_else(|| format!("Cellule {} non trouvée", worker_id))?;
        let genome = Genome::new(&worker.role);
        let spore = match spore_type {
            SporeType::BacterialEndospore => Spore::from_cell(spore_type.clone(), &worker, genome, 9999),
            SporeType::FungalReproductive => {
                Spore::from_cell(spore_type.clone(), &worker, genome, 0)
            }
        };
        self.dormant_spores.push(spore);
        Ok(self.dormant_spores.len() - 1)
    }

    /// Germination : réactive une spore dormante si les conditions environnementales sont favorables
    pub fn germinate_spore(&mut self, index: usize, conditions: (bool, bool)) -> Result<AgentCell, String> {
        if index >= self.dormant_spores.len() {
            return Err("Index de spore invalide".to_string());
        }
        let (warm_and_wet, nutrients_available) = conditions;
        let spore = self.dormant_spores.remove(index);
        let revived_cell = spore.germinate(warm_and_wet, nutrients_available)?;
        let cell_id = revived_cell.cell_id;
        self.active_cells.insert(cell_id, revived_cell.clone());
        Ok(revived_cell)
    }

    /// Redondance biologique : tolérance aux mutations de commandes et fallbacks métaboliques
    pub fn execute_tool_resilient(&mut self, expected_tool: &str, mutated_tool: &str) -> Result<String, String> {
        match self.redundancy.execute_instruction_with_redundancy(expected_tool, mutated_tool) {
            Ok(()) => Ok(format!("Instruction acceptée via dégénérescence du codon ({})", mutated_tool)),
            Err(_) => {
                let fallback_gene = self.redundancy.fallback_execution()?;
                Ok(format!("Bascule sur voie de secours métabolique : {}", fallback_gene.locus))
            }
        }
    }

    /// Embryologie : clivage du zygote et différenciation HOX
    pub fn cleave_and_differentiate(&mut self, divisions: u32, gradient: f64) -> Vec<AgentCell> {
        let zygote = AgentCell::new("Zygote_Origin", "Origine clonale", "Embryo");
        let mut swarm = cleave_zygote(zygote, divisions);
        let mut genome = seed_hox_genome("HOX_BLUEPRINT");
        differentiate_swarm(&mut swarm, gradient, &mut genome);
        sculpt_architecture_via_apoptosis(&mut swarm);
        for cell in &swarm {
            self.active_cells.insert(cell.cell_id, cell.clone());
        }
        swarm
    }

    /// Symbiogenèse Eucaryote : un agent (host) phagocyte un autre agent (symbiont)
    pub fn trigger_endosymbiosis(&mut self, host_id: Uuid, symbiont_id: Uuid) -> Result<(), String> {
        let host = self.active_cells.get(&host_id)
            .ok_or_else(|| format!("Hôte {} introuvable", host_id))?;
        host.can_phagocytize(symbiont_id)?;
        // Extraire le symbionte après validation atomique de l'hôte.
        let symbiont = self.active_cells.remove(&symbiont_id)
            .ok_or_else(|| format!("Symbionte {} introuvable ou déjà phagocyté", symbiont_id))?;
        let host = self.active_cells.get_mut(&host_id).unwrap();
        host.phagocytize(symbiont)?;
        
        // 4. Émettre un signal bioluminescent pour marquer l'événement
        self.emit_bioluminescence(
            FluorophoreColor::Green, 
            "Mitochondria", 
            ("ENDOSYMBIOSIS", "Symbiont successfully integrated as organelle")
        );
        
        Ok(())
    }

    /// Télémétrie bioluminescente : émission de fluorophores photoniques structurés
    pub fn emit_bioluminescence(&self, color: FluorophoreColor, organelle: &str, event_info: (&str, &str)) {
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

#[cfg(test)]
mod tests {
    use super::*;
    use genos_cell::Organelle;

    #[test]
    fn test_endosymbiosis() {
        let mut orchestrator = BiomimeticOrchestrator::new("Overmind", 50.0, 100.0);
        let host = AgentCell::new("Host", "The Absorber", "Architect");
        let symbiont = AgentCell::new("Symbiont", "The Absorbed", "Verifier");
        
        let host_id = host.cell_id;
        let symbiont_id = symbiont.cell_id;
        
        orchestrator.active_cells.insert(host_id, host);
        orchestrator.active_cells.insert(symbiont_id, symbiont);
        
        assert!(orchestrator.active_cells.contains_key(&symbiont_id));
        
        let result = orchestrator.trigger_endosymbiosis(host_id, symbiont_id);
        assert!(result.is_ok());
        
        // Symbiont should no longer be an active autonomous cell
        assert!(!orchestrator.active_cells.contains_key(&symbiont_id));
        
        // Host should contain the symbiont as an organelle
        let host_cell = orchestrator.active_cells.get(&host_id).unwrap();
        assert_eq!(host_cell.organelles.len(), 1);
        
        match &host_cell.organelles[0] {
            Organelle::Endosymbiont { original_id, role, .. } => {
                assert_eq!(*original_id, symbiont_id);
                assert_eq!(role, "Verifier");
            }
            _ => panic!("expected an endosymbiont organelle"),
        }
    }

    #[test]
    fn test_add_worker_does_not_orphan_cell_on_unknown_tissue() {
        let mut orchestrator = BiomimeticOrchestrator::new("Overmind", 50.0, 100.0);
        let worker = AgentCell::new("Worker", "Worker", "Worker");
        let worker_id = worker.cell_id;
        assert!(orchestrator.add_worker("missing", worker).is_err());
        assert!(!orchestrator.active_cells.contains_key(&worker_id));
    }
}

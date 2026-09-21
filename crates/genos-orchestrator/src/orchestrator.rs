use std::collections::HashMap;
use uuid::Uuid;
use serde::{Deserialize, Serialize};

use genos_biology::bioluminescence::{BioluminescenceMicroscope, FluorophoreColor};
use genos_biology::chemistry::MetabolicNetwork;
use genos_biology::ecology::CollusionCheck;
use genos_biology::embryology::{cleave_zygote, differentiate_swarm, sculpt_architecture_via_apoptosis, seed_hox_genome};
use genos_biology::glycolysis::build_glycolysis_network;
use genos_biology::lipid_membrane::build_lipid_membrane_network;
use genos_biology::redundancy::RedundancySystem;
use genos_biology::spore::{Spore, SporeFromCell, SporeType};
use genos_biology::tissue::{TaskDelegation, Tissue};
use genos_cell::AgentCell;
use genos_genome::Genome;
use genos_immune::{Antigen, ClonalSelection};

use crate::autopoiesis::Membrane;
use crate::conscience::{Conscience, ConscienceState};
use crate::metabolism::Metabolism;
use crate::planner::{Goal, WorldState};

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
    /// Tissu d'origine de chaque spore (clé = identifiant de la cellule parente),
    /// afin de réintégrer la cellule ranimée lors de la germination.
    #[serde(default)]
    pub spore_tissue_map: HashMap<Uuid, String>,
    /// Génomes connus (indexés par identifiant) afin de préserver la lignée
    /// lors de la sporulation et de la germination.
    #[serde(default)]
    pub genomes: HashMap<Uuid, Genome>,
    pub redundancy: RedundancySystem,
    pub active_cells: HashMap<Uuid, AgentCell>,
    pub conscience: Conscience,
    pub immune_selection: ClonalSelection,
    /// Métabolisme énergétique (ATP adossé au temps réel).
    #[serde(skip)]
    pub metabolism: Metabolism,
    /// Réseau métabolique chimique réel (glycolyse) : molécules, réactions
    /// équilibrées et bilans de matière/énergie mesurés, distinct de l'ATP
    /// abstrait ci-dessus.
    #[serde(skip)]
    pub chemistry: MetabolicNetwork,
    /// Frontière auto-entretenue (membrane d'autopoïèse).
    #[serde(skip)]
    pub membrane: Membrane,
    /// Réseau chimique réel de la bicouche lipidique (synthèse/dégradation de
    /// phospholipides), distinct de l'intégrité abstraite ci-dessus qu'il alimente.
    #[serde(skip)]
    pub lipid_chemistry: MetabolicNetwork,
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
            spore_tissue_map: HashMap::new(),
            genomes: HashMap::new(),
            redundancy: RedundancySystem::new(),
            active_cells,
            conscience: Conscience::new(max_dissonance, baseline_budget),
            immune_selection: ClonalSelection::new(),
            metabolism: Metabolism::default(),
            chemistry: build_glycolysis_network(),
            membrane: Membrane::default(),
            lipid_chemistry: build_lipid_membrane_network(),
        }
    }

    /// Evaluates a threat antigen through the orchestrator's persistent clonal selection.
    pub fn detect_immune_threat(&mut self, antigen: &Antigen) -> bool {
        self.immune_selection.recognize(antigen)
    }

    /// Crée et enregistre un nouveau Tissu cellulaire dirigé par la racine ou une cellule souche
    pub fn create_tissue(&mut self, name: &str, function_role: &str) -> Result<&mut Tissue, String> {
        if self.tissues.contains_key(name) {
            return Err(format!("Tissu '{}' existe déjà", name));
        }
        if !self.active_cells.contains_key(&self.orchestrator_id) {
            return Err("La cellule souche de l'orchestrateur est introuvable".to_string());
        }
        let tissue = Tissue::new(name, function_role, self.orchestrator_id);
        self.tissues.insert(name.to_string(), tissue);
        self.tissues.get_mut(name).ok_or_else(|| format!("Tissu '{}' introuvable après création", name))
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
        // Never panic if the root cell was removed: keep the last known state.
        if let Some(root) = self.active_cells.get_mut(&self.orchestrator_id) {
            self.conscience.evaluate_branch(&mut root.conscience, loop_metrics.0, loop_metrics.1);
            self.conscience_state = root.conscience.clone();
        }
        self.conscience_state.clone()
    }

    /// Détache une cellule de tous les tissus qui la référencent.
    /// Retourne le nom du tissu d'origine, le cas échéant, pour une réintégration ultérieure.
    fn detach_from_tissues(&mut self, cell_id: Uuid) -> Option<String> {
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

    /// Nom du tissu qui référence `cell_id`, le cas échéant (lecture seule).
    pub fn owning_tissue(&self, cell_id: Uuid) -> Option<String> {
        self.tissues
            .iter()
            .find(|(_, tissue)| tissue.somatic_cells.contains(&cell_id))
            .map(|(name, _)| name.clone())
    }

    /// Vérifie les invariants structurels de l'orchestrateur.
    /// Utilisé par les tests de propriété et disponible pour l'observabilité.
    pub fn check_invariants(&self) -> Result<(), String> {
        for (name, tissue) in &self.tissues {
            for cell_id in &tissue.somatic_cells {
                if !self.active_cells.contains_key(cell_id) {
                    return Err(format!("tissu '{name}' reference la cellule absente {cell_id}"));
                }
            }
        }
        for spore in &self.dormant_spores {
            if !self.genomes.contains_key(&spore.genome.genome_id()) {
                return Err(format!("spore {} sans genome enregistre", spore.parent_cell_id));
            }
        }
        for cell_id in self.spore_tissue_map.keys() {
            if !self.dormant_spores.iter().any(|s| s.parent_cell_id == *cell_id) {
                return Err(format!("spore_tissue_map orphelin pour {cell_id}"));
            }
        }
        Ok(())
    }

    /// Sporulation : cryoconserve une cellule sous forme d'endospore résistante
    pub fn sporulate_cell(&mut self, worker_id: Uuid, spore_type: SporeType) -> Result<usize, String> {
        let worker = self.active_cells.remove(&worker_id)
            .ok_or_else(|| format!("Cellule {} non trouvée", worker_id))?;
        // Éviter une référence pendante : le tissu ne doit plus référencer une cellule absente.
        let origin = self.detach_from_tissues(worker_id);
        // Préserver la lignée : réutiliser le génome connu de la cellule si disponible.
        let genome = worker
            .genome_id
            .and_then(|genome_id| self.genomes.get(&genome_id).cloned())
            .unwrap_or_else(|| Genome::new(&worker.role));
        // Toute spore doit référencer un génome enregistré (invariant de lignée).
        self.genomes.insert(genome.genome_id(), genome.clone());
        let spore = match spore_type {
            SporeType::BacterialEndospore => Spore::from_cell(SporeFromCell {
                spore_type: spore_type.clone(),
                cell: &worker,
                genome,
                bunker_armor: 9999,
            }),
            SporeType::FungalReproductive => {
                Spore::from_cell(SporeFromCell {
                    spore_type: spore_type.clone(),
                    cell: &worker,
                    genome,
                    bunker_armor: 0,
                })
            }
        };
        if let Some(tissue_name) = origin {
            self.spore_tissue_map.insert(worker_id, tissue_name);
        }
        self.dormant_spores.push(spore);
        Ok(self.dormant_spores.len() - 1)
    }

    /// Germination : réactive une spore dormante si les conditions environnementales sont favorables
    pub fn germinate_spore(&mut self, index: usize, conditions: (bool, bool)) -> Result<AgentCell, String> {
        if index >= self.dormant_spores.len() {
            return Err("Index de spore invalide".to_string());
        }
        let (warm_and_wet, nutrients_available) = conditions;
        // Vérifier la viabilité AVANT de consommer la spore dormante, sinon une
        // germination ratée la détruirait silencieusement.
        let spore = self.dormant_spores[index].clone();
        let genome = spore.genome.clone();
        let revived_cell = spore.germinate(warm_and_wet, nutrients_available)?;
        self.dormant_spores.remove(index);
        // Conserver le génome pour les sporulations ultérieures de cette lignée.
        self.genomes.insert(genome.genome_id(), genome);
        let cell_id = revived_cell.cell_id;
        // Réintégrer la cellule ranimée dans son tissu d'origine, si connu.
        if let Some(tissue_name) = self.spore_tissue_map.remove(&cell_id)
            && let Some(tissue) = self.tissues.get_mut(&tissue_name)
        {
            tissue.integrate_cell(cell_id);
        }
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

    /// Embryologie : clivage du zygote et différenciation HOX.
    /// Les cellules produites sont retournées mais ne sont PAS enregistrées :
    /// l'appelant doit les intégrer via `add_worker` pour garantir l'invariant
    /// « toute cellule active appartient à un tissu ».
    pub fn cleave_and_differentiate(&mut self, divisions: u32, gradient: f64) -> Vec<AgentCell> {
        let zygote = AgentCell::new("Zygote_Origin", "Origine clonale", "Embryo");
        let mut swarm = cleave_zygote(zygote, divisions);
        let mut genome = seed_hox_genome("HOX_BLUEPRINT");
        differentiate_swarm(&mut swarm, gradient, &mut genome);
        sculpt_architecture_via_apoptosis(&mut swarm);
        self.genomes.insert(genome.genome_id(), genome.clone());
        swarm
    }

    /// Symbiogenèse Eucaryote : un agent (host) phagocyte un autre agent (symbiont)
    pub fn trigger_endosymbiosis(&mut self, host_id: Uuid, symbiont_id: Uuid) -> Result<(), String> {
        // Valider l'intégralité de la relation hôte/symbionte AVANT toute mutation :
        // une phagocytose rejetée ne doit jamais retirer ni perdre de cellule.
        {
            let host = self.active_cells.get(&host_id)
                .ok_or_else(|| format!("Hôte {} introuvable", host_id))?;
            host.can_phagocytize(symbiont_id)?;
        }
        if !self.active_cells.contains_key(&symbiont_id) {
            return Err(format!("Symbionte {} introuvable ou déjà phagocyté", symbiont_id));
        }

        // Extraction atomique : les validations ci-dessus garantissent le succès de phagocytize.
        let symbiont = self.active_cells.remove(&symbiont_id)
            .ok_or_else(|| format!("Symbionte {} introuvable ou déjà phagocyté", symbiont_id))?;
        // Le tissu ne doit plus référencer une cellule désormais intégrée à l'hôte.
        self.detach_from_tissues(symbiont_id);
        let host = self.active_cells.get_mut(&host_id).ok_or_else(|| format!("Hôte {} introuvable", host_id))?;
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
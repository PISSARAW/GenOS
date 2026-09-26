use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;

use genos_biology::bioluminescence::{BioluminescenceMicroscope, FluorophoreColor};
use genos_biology::chemistry::MetabolicNetwork;
use genos_biology::ecology::CollusionCheck;
use genos_biology::embryology::{
    cleave_zygote, differentiate_swarm, sculpt_architecture_via_apoptosis, seed_hox_genome,
};
use genos_biology::glycolysis::build_glycolysis_network;
use genos_biology::lipid_membrane::build_lipid_membrane_network;
use genos_biology::redundancy::RedundancySystem;
use genos_biology::spore::{Spore, SporeFromCell, SporeType};
use genos_biology::tissue::{TaskDelegation, Tissue};
use genos_cell::AgentCell;
use genos_genome::Genome;
use genos_immune::{Antigen, ClonalSelection};

use crate::autopoiesis::Membrane;
use crate::conscience::{CognitiveRegulationState, Conscience, BranchMetrics};
use crate::metabolism::Metabolism;
use crate::planner::{Goal, WorldState};

/// L'Orchestrateur Biomimétique central de GenOS : coordonne les tissus cellulaires,
/// surveille la dissonance cognitive, applique l'écologie anti-collusion et gère
/// la résilience par sporulation et redondance génétique.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BiomimeticOrchestrator {
    pub orchestrator_id: Uuid,
    pub name: String,
    pub cognitive_regulation_state: CognitiveRegulationState,
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
            cognitive_regulation_state: CognitiveRegulationState::default(),
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
}
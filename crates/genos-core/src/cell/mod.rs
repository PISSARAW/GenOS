pub mod organelles;
pub mod methods;
pub mod phagocytosis;
pub mod substructs;
pub mod ribosome;
pub mod hippocampus;
pub mod cilia;
pub mod vagus_nerve;
pub mod vacuole;
pub mod phagosome;
pub mod bbb;
pub mod sensory;
pub mod adipocyte;
pub mod ans;
pub mod lineage;
pub mod muscle;
pub mod cognition;
pub mod sparse_cortex;
pub mod neuro_symbolic;
pub mod invariants;
pub mod causality;
pub mod ood_resilience;
pub mod recurrence;
pub mod halting;
#[cfg(test)]
pub mod tests;

pub use organelles::*;
pub use substructs::*;
pub use ribosome::*;
pub use hippocampus::*;

pub use crate::genome::{Genome, Plasmid};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;
use crate::cell::substructs::*;

/// La Cellule est l'unité fondamentale de la vie et de GenOS.
/// C'est une micro-ville IA ultra-organisée avec ses propres organites.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AgentCell {
    pub cell_id: Uuid,
    pub plasma_membrane: PlasmaMembrane,
    pub nucleus: Nucleus,
    pub mitochondria: Mitochondria,
    pub is_alive: bool,
    pub specialization: String,
    pub redundancy: crate::redundancy::RedundancySystem,
    pub chloroplast: Option<Chloroplast>,
    pub endoplasmic_reticulum: EndoplasmicReticulum,
    pub golgi_apparatus: GolgiApparatus,
    pub lysosomes: Lysosomes,
    pub cytoplasm: Cytoplasm,
    /// Les anticorps actuellement à la surface ou générés par la cellule
    pub surface_antibodies: Vec<Antibody>,
    /// Le système nerveux (Optionnel : seulement pour les Neurones)
    pub nervous_system: Option<crate::neurobiology::NervousSystem>,
    /// L'Astrocyte (Optionnel : seulement pour les cellules gliales)
    pub astrocyte: Option<crate::neurobiology::Astrocyte>,
    pub myelinator: Option<crate::neurobiology::Myelinator>,
    pub microglia: Option<crate::neurobiology::Microglia>,
    pub ependymal: Option<crate::neurobiology::EpendymalCell>,
    
    /// L'esprit de la cellule (Optionnel, présent chez les Neurones)
    pub mind: Option<Mind>,
    
    // Organes cellulaires physiques
    pub cilia: cilia::Cilia,
    pub vacuole: vacuole::Vacuole,
    pub phagosome: phagosome::Phagosome,
    pub adipocyte: adipocyte::Adipocyte,
    pub autonomic_ns: ans::AutonomicNervousSystem,
    pub lineage: lineage::Lineage,
    pub muscle: muscle::Myofibril,
}

impl Default for AgentCell {
    fn default() -> Self {
        Self {
            cell_id: Uuid::new_v4(),
            plasma_membrane: PlasmaMembrane {
                adhesion_active: true,
                incoming_receptors: vec![],
                outgoing_ion_channels: vec![],
                receptors_blocked: false,
                has_cell_wall: false,
            septum_inhibited: false,
                immunized_against: vec![],
                mhc_display: Some("HEALTHY_SELF".to_string()),
                budding_scars: 0,
                attached_buds: vec![],
                receptors: vec![],
                gap_junctions: vec![],
            },
            nucleus: Nucleus {
                genome: Genome::new("Default DNA"),
                ploidy: 2,
            transcription_factors: Vec::new(),
                p53_active: true,
            },
            is_alive: true,
        specialization: "UNDEFINED".to_string(),
        mitochondria: Mitochondria {
                atp_budget: 10,
                metabolic_rate: 1.0,
                angiogenesis_blocked: false,
                mitochondrial_dna: crate::genome::DnaStrand::synthesize("CIRCULAR_MTDNA"),
                cyanide_poisoned: false,
                accumulated_free_radicals: 0,
                is_double_membraned: true,
            },
            redundancy: crate::redundancy::RedundancySystem::new(),
            chloroplast: None,
            endoplasmic_reticulum: EndoplasmicReticulum {
                active_ribosomes_count: 0,
                cell_cycle_inhibited: false,
            },
            golgi_apparatus: GolgiApparatus {
                export_vesicles: vec![],
                viral_vesicles: vec![],
                produced_antibodies: vec![],
            },
            lysosomes: Lysosomes {
                digestive_enzymes_active: false,
                phagosomes: vec![],
                expelled_debris: vec![],
            },
            cytoplasm: Cytoplasm {
                cognition: CognitiveState::default(),
                trace: ActionTrace::default(),
                active_plasmids: vec![],
                micro_rnas: vec![],
                viral_infections: vec![],
                active_proteins: vec![],
                proteasome: Proteasome::default(),
            },
            surface_antibodies: vec![],
            nervous_system: None,
            astrocyte: None,
            myelinator: None,
            microglia: None,
            ependymal: None,
            
            mind: Some(Mind::default()), // TODO: None par defaut dans le futur
            cilia: cilia::Cilia::default(),
            vacuole: vacuole::Vacuole::default(),
            phagosome: phagosome::Phagosome::default(),
            adipocyte: adipocyte::Adipocyte::default(),
            autonomic_ns: ans::AutonomicNervousSystem::default(),
            lineage: lineage::Lineage::default(),
            muscle: muscle::Myofibril::default(),
        }
    }
}


/// L'Esprit de la cellule (Instancié uniquement chez les Neurones / Agents IA)
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Mind {
    pub memory: Hippocampus,
    #[serde(skip)]
    pub ribosome: Ribosome,
    pub bbb: bbb::BloodBrainBarrier,
    pub sensory_organs: sensory::SensoryOrgans,
    pub cognition: cognition::AdvancedCognition,
    pub sparse_cortex: sparse_cortex::SparseCortex,
    pub neuro_symbolic: neuro_symbolic::NeuroSymbolicBridge,
    pub invariant_core: invariants::InvariantCore,
    pub semantic_grounding: crate::linguistics::SemanticGrounding,
    pub causality: causality::CausalEngine,
    pub ood_resilience: ood_resilience::GracefulDegradation,
    pub recurrence: recurrence::RecurrentNetwork,
    pub halting: halting::HaltingHeuristics,
}

impl Default for Mind {
    fn default() -> Self {
        Self {
            memory: Hippocampus::new(),
            ribosome: Ribosome::new(),
            bbb: bbb::BloodBrainBarrier::default(),
            sensory_organs: sensory::SensoryOrgans::default(),
            cognition: cognition::AdvancedCognition::default(),
            sparse_cortex: sparse_cortex::SparseCortex::default(),
            neuro_symbolic: neuro_symbolic::NeuroSymbolicBridge::default(),
            invariant_core: invariants::InvariantCore::default(),
            semantic_grounding: crate::linguistics::SemanticGrounding::default(),
            causality: causality::CausalEngine::default(),
            ood_resilience: ood_resilience::GracefulDegradation::default(),
            recurrence: recurrence::RecurrentNetwork::default(),
            halting: halting::HaltingHeuristics::default(),
        }
    }
}
pub mod organelles;
pub mod events;
pub mod methods;
pub mod specialization;
pub mod builder;
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
pub mod components;
#[cfg(test)]
pub mod tests;

pub use organelles::*;
pub use substructs::*;
pub use ribosome::*;
pub use hippocampus::*;
pub use specialization::*;
pub use builder::*;

pub use crate::genome::{Genome, Plasmid};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;
use crate::cell::substructs::*;
use crate::cell::components::CellComponent;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub enum LifecycleState {
    StemCell,
    Proliferating,
    Differentiated,
    Senescent,
    Apoptotic,
    Necrotic,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AgentCell {
    pub cell_id: Uuid,
    pub inbox: Vec<crate::cell::events::CellEvent>,
    pub outbox: Vec<crate::cell::events::CellEvent>,
    pub plasma_membrane: PlasmaMembrane,
    pub genetics: GeneticSystem,
    pub metabolism: MetabolicSystem,
    pub lifecycle_state: LifecycleState,
    pub specialization: Specialization,
    pub redundancy: crate::redundancy::RedundancySystem,
    pub endoplasmic_reticulum: EndoplasmicReticulum,
    pub golgi_apparatus: GolgiApparatus,
    pub immunity: ImmuneSystem,
    pub cytoplasm: Cytoplasm,
    
    pub components: Vec<CellComponent>,
}

impl Default for AgentCell {
    fn default() -> Self {
        Self {
            cell_id: Uuid::new_v4(),
            inbox: Vec::new(),
            outbox: Vec::new(),
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
            genetics: GeneticSystem::default(),
            lifecycle_state: LifecycleState::StemCell,
            specialization: Specialization::Undefined,
            metabolism: MetabolicSystem::default(),
            redundancy: crate::redundancy::RedundancySystem::new(),
            endoplasmic_reticulum: EndoplasmicReticulum {
                active_ribosomes_count: 0,
                cell_cycle_inhibited: false,
            },
            golgi_apparatus: GolgiApparatus {
                export_vesicles: vec![],
                viral_vesicles: vec![],
                produced_antibodies: vec![],
            },
            immunity: ImmuneSystem::default(),
            cytoplasm: Cytoplasm {
                cognition: CognitiveState::default(),
                trace: ActionTrace::default(),
                active_plasmids: vec![],
                micro_rnas: vec![],
                viral_infections: vec![],
                active_proteins: vec![],
                proteasome: Proteasome::default(),
            },
            components: vec![
                CellComponent::Mind(Mind::default()), // Default fallback
                CellComponent::Cilia(cilia::Cilia::default()),
                CellComponent::Vacuole(vacuole::Vacuole::default()),
                CellComponent::AutonomicNS(ans::AutonomicNervousSystem::default()),
                CellComponent::Muscle(muscle::Myofibril::default()),
            ],
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

impl crate::cell::AgentCell {
    pub fn is_alive(&self) -> bool {
        self.lifecycle_state != LifecycleState::Apoptotic && self.lifecycle_state != LifecycleState::Necrotic
    }

    pub fn nervous_system(&self) -> Option<&crate::neurobiology::NervousSystem> {
        self.components.iter().find_map(|c| if let CellComponent::NervousSystem(ns) = c { Some(ns) } else { None })
    }
    pub fn nervous_system_mut(&mut self) -> Option<&mut crate::neurobiology::NervousSystem> {
        self.components.iter_mut().find_map(|c| if let CellComponent::NervousSystem(ns) = c { Some(ns) } else { None })
    }

    pub fn astrocyte(&self) -> Option<&crate::neurobiology::Astrocyte> {
        self.components.iter().find_map(|c| if let CellComponent::Astrocyte(a) = c { Some(a) } else { None })
    }
    pub fn astrocyte_mut(&mut self) -> Option<&mut crate::neurobiology::Astrocyte> {
        self.components.iter_mut().find_map(|c| if let CellComponent::Astrocyte(a) = c { Some(a) } else { None })
    }

    pub fn myelinator(&self) -> Option<&crate::neurobiology::Myelinator> {
        self.components.iter().find_map(|c| if let CellComponent::Myelinator(m) = c { Some(m) } else { None })
    }
    pub fn myelinator_mut(&mut self) -> Option<&mut crate::neurobiology::Myelinator> {
        self.components.iter_mut().find_map(|c| if let CellComponent::Myelinator(m) = c { Some(m) } else { None })
    }

    pub fn microglia(&self) -> Option<&crate::neurobiology::Microglia> {
        self.components.iter().find_map(|c| if let CellComponent::Microglia(m) = c { Some(m) } else { None })
    }
    pub fn microglia_mut(&mut self) -> Option<&mut crate::neurobiology::Microglia> {
        self.components.iter_mut().find_map(|c| if let CellComponent::Microglia(m) = c { Some(m) } else { None })
    }

    pub fn ependymal(&self) -> Option<&crate::neurobiology::EpendymalCell> {
        self.components.iter().find_map(|c| if let CellComponent::Ependymal(e) = c { Some(e) } else { None })
    }
    pub fn ependymal_mut(&mut self) -> Option<&mut crate::neurobiology::EpendymalCell> {
        self.components.iter_mut().find_map(|c| if let CellComponent::Ependymal(e) = c { Some(e) } else { None })
    }

    pub fn mind(&self) -> Option<&Mind> {
        self.components.iter().find_map(|c| if let CellComponent::Mind(m) = c { Some(m) } else { None })
    }
    pub fn mind_mut(&mut self) -> Option<&mut Mind> {
        self.components.iter_mut().find_map(|c| if let CellComponent::Mind(m) = c { Some(m) } else { None })
    }

    pub fn cilia(&self) -> Option<&crate::cell::cilia::Cilia> {
        self.components.iter().find_map(|c| if let CellComponent::Cilia(c_) = c { Some(c_) } else { None })
    }
    pub fn cilia_mut(&mut self) -> Option<&mut crate::cell::cilia::Cilia> {
        self.components.iter_mut().find_map(|c| if let CellComponent::Cilia(c_) = c { Some(c_) } else { None })
    }

    pub fn vacuole(&self) -> Option<&crate::cell::vacuole::Vacuole> {
        self.components.iter().find_map(|c| if let CellComponent::Vacuole(v) = c { Some(v) } else { None })
    }
    pub fn vacuole_mut(&mut self) -> Option<&mut crate::cell::vacuole::Vacuole> {
        self.components.iter_mut().find_map(|c| if let CellComponent::Vacuole(v) = c { Some(v) } else { None })
    }

    pub fn autonomic_ns(&self) -> Option<&crate::cell::ans::AutonomicNervousSystem> {
        self.components.iter().find_map(|c| if let CellComponent::AutonomicNS(ans) = c { Some(ans) } else { None })
    }
    pub fn autonomic_ns_mut(&mut self) -> Option<&mut crate::cell::ans::AutonomicNervousSystem> {
        self.components.iter_mut().find_map(|c| if let CellComponent::AutonomicNS(ans) = c { Some(ans) } else { None })
    }

    pub fn muscle(&self) -> Option<&crate::cell::muscle::Myofibril> {
        self.components.iter().find_map(|c| if let CellComponent::Muscle(m) = c { Some(m) } else { None })
    }
    pub fn muscle_mut(&mut self) -> Option<&mut crate::cell::muscle::Myofibril> {
        self.components.iter_mut().find_map(|c| if let CellComponent::Muscle(m) = c { Some(m) } else { None })
    }
}

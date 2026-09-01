pub mod organelles;
pub mod methods;
pub mod substructs;
#[cfg(test)]
pub mod tests;

pub use organelles::*;
pub use substructs::*;

pub use crate::genome::{Genome, Plasmid};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;
use crate::cell::substructs::*;

/// La Cellule est l'unitÃƒÂ© fondamentale de la vie et de GenOS.
/// C'est une micro-ville IA ultra-organisÃƒÂ©e avec ses propres organites.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AgentCell {
    pub cell_id: Uuid,
    pub plasma_membrane: PlasmaMembrane,
    pub nucleus: Nucleus,
    pub mitochondria: Mitochondria,
    pub redundancy: crate::redundancy::RedundancySystem,
    pub chloroplast: Option<Chloroplast>,
    pub endoplasmic_reticulum: EndoplasmicReticulum,
    pub golgi_apparatus: GolgiApparatus,
    pub lysosomes: Lysosomes,
    pub cytoplasm: Cytoplasm,
    /// Les anticorps actuellement ÃƒÂ  la surface ou gÃƒÂ©nÃƒÂ©rÃƒÂ©s par la cellule
    /// Le systÃƒÂ¨me nerveux (Optionnel : seulement pour les Neurones)
    pub nervous_system: Option<crate::neurobiology::NervousSystem>,
    /// L'Astrocyte (Optionnel : seulement pour les cellules gliales)
    pub surface_antibodies: Vec<Antibody>,
    pub astrocyte: Option<crate::neurobiology::Astrocyte>,
    pub myelinator: Option<crate::neurobiology::Myelinator>,
    pub microglia: Option<crate::neurobiology::Microglia>,
    pub ependymal: Option<crate::neurobiology::EpendymalCell>,
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
            mitochondria: Mitochondria {
                atp_budget: 10,
                metabolic_rate: 1.0,
                angiogenesis_blocked: false,
                mitochondrial_dna: crate::genome::DnaStrand::synthesize("CIRCULAR_MTDNA"),
                is_double_membraned: true,
            },
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
            },
            surface_antibodies: vec![],
            nervous_system: None,
            astrocyte: None,
            myelinator: None,
            microglia: None,
            ependymal: None,
        }
    }
}


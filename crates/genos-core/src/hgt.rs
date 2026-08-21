use serde::{Deserialize, Serialize};
use crate::genome::{AgentGenome, Locus};
use crate::operon::Operon;

/// Unité génétique mobile (élément transposable) capable de s'insérer
/// de manière autonome dans le génome pour propager des fragments (payload).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Transposon {
    pub name: String,
    pub payload: Vec<Locus>,
    pub insertion_sequence: String,
}

/// Véhicule de transfert horizontal, regroupant un ensemble d'opérons.
/// Permet à un agent d'acquérir de nouvelles compétences "à la volée".
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct PlasmidPackage {
    pub id: String,
    pub origin_of_transfer: String,
    pub operons: Vec<Operon>,
    pub compatibility_group: String,
}

/// Trait définissant la capacité d'un agent à assimiler des fragments génétiques externes.
pub trait HorizontalGeneTransfer {
    /// Absorbe un plasmide et l'intègre directement au génome de l'agent.
    fn absorb_plasmid(&mut self, plasmid: &PlasmidPackage);
}

impl HorizontalGeneTransfer for AgentGenome {
    fn absorb_plasmid(&mut self, plasmid: &PlasmidPackage) {
        if let Some(chromosome) = self.cognition.chromosomes.first_mut() {
            chromosome.operons.extend(plasmid.operons.clone());
        }
    }
}

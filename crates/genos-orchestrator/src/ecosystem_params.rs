//! Paramètres groupés des API GenosEcosystem (règle repo : ≤3 params).

use genos_biology::pathology::{ClinicalStatusReport, assess_agent_clinical_status};
use genos_cell::AgentCell;
use genos_dna::model::AgentDna;
use genos_genome::Genome;
use genos_store::{VitrifiedFreeze, VitrifiedThaw};

/// Paramètres d'ajout d'oscillateur (règle repo : ≤3 params).
pub struct OscillatorParams<'a> {
    pub id: &'a str,
    pub phase: f64,
    pub natural_frequency: f64,
}

/// Paramètres de croisement génomique.
pub struct CrossoverParams<'a> {
    pub a: &'a Genome,
    pub b: &'a Genome,
    pub point: usize,
}

/// Paramètres de vitrification (cryptobiose).
pub struct FreezeParams<'a> {
    pub agent_id: &'a str,
    pub data: &'a [u8],
    pub trehalose: f64,
    pub armor: u32,
}

/// Paramètres de dévitrification.
pub struct ThawParams<'a> {
    pub agent_id: &'a str,
    pub warm_and_wet: bool,
    pub nutrients: bool,
}

impl crate::ecosystem::GenosEcosystem {
    pub fn express_dna(&self, dna: &AgentDna) -> genos_dna::Phenotype {
        genos_dna::express::express(dna)
    }

    // --- Pathologie / diagnostic ---

    pub fn assess_health(&self, cell: &AgentCell) -> ClinicalStatusReport {
        assess_agent_clinical_status(cell)
    }

    pub fn freeze_vitrified(&mut self, params: FreezeParams) {
        let FreezeParams {
            agent_id,
            data,
            trehalose,
            armor,
        } = params;
        let _ = self.cryptobiosis.freeze_vitrified(VitrifiedFreeze {
            agent_id,
            data,
            trehalose,
            armor,
        });
    }

    pub fn thaw_vitrified(&mut self, params: ThawParams) -> Result<Vec<u8>, String> {
        let ThawParams {
            agent_id,
            warm_and_wet,
            nutrients,
        } = params;
        self.cryptobiosis.thaw_vitrified(VitrifiedThaw {
            agent_id,
            warm_and_wet,
            nutrients,
        })
    }
}

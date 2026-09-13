//! Exploitation du domaine virologique : virions, rétrovirus, bactériophages.

use genos_genome::{DnaStrand, Gene};
use genos_immune::{Bacteriophage, Retrovirus, Virion};

/// Laboratoire virologique : synthèse et armement de vecteurs.
#[derive(Default)]
pub struct VirologyLab {
    pub virions: Vec<Virion>,
    pub retroviruses: Vec<Retrovirus>,
    pub phages: Vec<Bacteriophage>,
}

impl VirologyLab {
    pub fn new() -> Self {
        Self::default()
    }

    /// Synthétise un bactériophage ciblant un récepteur donné.
    pub fn synthesize_bacteriophage(&mut self, receptor: &str, kill_instruction: &str) -> usize {
        self.virions
            .push(Virion::new_bacteriophage(receptor, kill_instruction));
        self.virions.len() - 1
    }

    /// Synthétise un rétrovirus (spike + séquence ARN).
    pub fn synthesize_retrovirus(&mut self, spike: &str, rna: &str) -> usize {
        self.retroviruses.push(Retrovirus::new(spike, rna));
        self.retroviruses.len() - 1
    }

    /// Construit un bactériophage depuis une instruction virale.
    pub fn engineer_phage(&mut self, instruction: &str) -> usize {
        self.phages.push(Bacteriophage::new(instruction));
        self.phages.len() - 1
    }

    /// Erreur d'empaquetage généralisée : le phage vole un gène aléatoire.
    pub fn package_generalized(&mut self, index: usize, gene: Gene) -> bool {
        match self.phages.get_mut(index) {
            Some(phage) => {
                phage.packaging_error_generalized(gene);
                true
            }
            None => false,
        }
    }

    /// Erreur d'empaquetage spécialisée : transduction de gène adjacent.
    pub fn package_specialized(&mut self, index: usize, gene: Gene) -> bool {
        match self.phages.get_mut(index) {
            Some(phage) => {
                phage.packaging_error_specialized(gene);
                true
            }
            None => false,
        }
    }

    /// Transcription inverse d'un rétrovirus en brin d'ADN.
    pub fn reverse_transcribe(&self, index: usize) -> Option<DnaStrand> {
        self.retroviruses.get(index).map(Retrovirus::reverse_transcribe)
    }
}

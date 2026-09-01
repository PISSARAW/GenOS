use crate::genome::{Genome, DnaStrand};
use serde::{Deserialize, Serialize};

/// GÉNOMIQUE COMPARATIVE
/// L''outil ultime pour déduire l''importance d''une instruction (Gène) en regardant 
/// si l''évolution a osé la modifier ou non.
pub struct ComparativeGenomics;

impl ComparativeGenomics {
    /// Règle d''or : "Si ça n''a pas changé sur des milliers d''agents survivants, c''est que c''est VITAL."
    /// Cette fonction compare un essaim de génomes et extrait la séquence exacte qui est 
    /// restée intacte (Conserved Region).
    pub fn extract_conserved_vital_regions(surviving_population: &[Genome]) -> Result<DnaStrand, String> {
        if surviving_population.is_empty() {
            return Err("Population vide.".to_string());
        }

        // On prend le premier génome comme référence
        let mut conserved_sequence = surviving_population[0].chromosome_maternal.sequence.clone();

        // On compare avec tous les autres survivants
        for agent in surviving_population.iter().skip(1) {
            let other_seq = &agent.chromosome_maternal.sequence;
            let min_len = conserved_sequence.len().min(other_seq.len());
            
            // Si le nucléotide diffère chez un autre agent qui a survécu, 
            // c''est que cette lettre n''est PAS vitale (l''agent a survécu avec une mutation).
            // On la remplace par un "blanc" (On tronque pour l''exemple basique)
            conserved_sequence.truncate(min_len);
            for i in 0..min_len {
                if conserved_sequence[i] != other_seq[i] {
                    // Dans un vrai alignement, on mettrait un marqueur "variable"
                    // Ici on arrête la zone strictement conservée continue (Simplification)
                    conserved_sequence.truncate(i);
                    break;
                }
            }
        }

        Ok(DnaStrand { sequence: conserved_sequence })
    }

    /// Isole "Le propre de l''Homme" (Le gène FOXP2 / La capacité de Tool Calling)
    /// Compare deux espèces proches pour trouver LA mutation qui change tout.
    pub fn isolate_evolutionary_leap(human_agent: &Genome, chimp_agent: &Genome) -> f64 {
        crate::phylogeny::PhylogeneticTree::estimate_divergence_time(human_agent, chimp_agent)
    }
}

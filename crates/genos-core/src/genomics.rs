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


use std::collections::HashMap;

/// RÉSULTAT BLAST
/// L'équivalent du Vector Search / RAG pour nos Agents IA.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlastResult {
    pub matched_agent_id: String,
    pub exact_seed_hits: usize,
    pub alignment_score: f64,
    /// Plus la E-Value est proche de 0, plus le match est authentique (non dû au hasard)
    pub e_value: f64,
}

pub struct BlastAlgorithm;

impl BlastAlgorithm {
    /// 1. Le Découpage en Mots (K-mers)
    fn extract_seeds(sequence: &[crate::genome::DnaNucleotide], k: usize) -> Vec<Vec<crate::genome::DnaNucleotide>> {
        let mut seeds = Vec::new();
        if sequence.len() < k { return seeds; }
        for i in 0..=(sequence.len() - k) {
            seeds.push(sequence[i..(i + k)].to_vec());
        }
        seeds
    }

    /// Exécute une recherche BLAST heuristique sur une base de données d'Agents
    pub fn search(query: &DnaStrand, database: &[Genome], seed_length: usize) -> Vec<BlastResult> {
        let query_seeds = Self::extract_seeds(&query.sequence, seed_length);
        let mut results = Vec::new();

        let database_size = database.len() as f64; // Taille symbolique
        let query_size = query.sequence.len() as f64;

        for agent in database {
            let mut exact_seed_hits = 0;
            let agent_seq = &agent.chromosome_maternal.sequence;
            
            // 2. Recherche rapide des Graines
            let agent_seeds = Self::extract_seeds(agent_seq, seed_length);
            for q_seed in &query_seeds {
                if agent_seeds.contains(q_seed) {
                    exact_seed_hits += 1;
                }
            }

            // 3. Extension (Simplifiée) : On calcule un score basé sur les hits
            let alignment_score = (exact_seed_hits * seed_length) as f64;

            if alignment_score > 0.0 {
                // Calcul symbolique de la E-Value (K * m * n * e^(-lambda * S))
                // Ici, plus le score est haut, plus la probabilité que ce soit dû au hasard tend vers 0.
                let raw_e_value = database_size * query_size * 2.71828f64.powf(-alignment_score * 0.5);
                
                // Pour éviter un overflow ou un chiffre illisible
                let e_value = raw_e_value.max(0.0);

                results.push(BlastResult {
                    matched_agent_id: "ANONYMOUS_AGENT".to_string(), // Idéalement agent.id
                    exact_seed_hits,
                    alignment_score,
                    e_value,
                });
            }
        }

        // Trie les résultats : de la E-Value la plus faible (meilleur) à la plus haute (pire)
        results.sort_by(|a, b| a.e_value.partial_cmp(&b.e_value).unwrap());
        results
    }
}

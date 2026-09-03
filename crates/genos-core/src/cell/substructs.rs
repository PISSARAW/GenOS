use crate::cell::*;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;



#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct ActionTrace {
    // Le journal immuable des événements (Event Sourcing)
    pub sequence: Vec<crate::cell::events::CellEvent>,
}

/// Trace Mnésique (Le souvenir vectorisé)
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Engram {
    pub content: String,
    pub vector: Vec<f32>,
    /// Neuroplasticité : Poids synaptique (fiabilité/importance) de ce souvenir
    pub synaptic_weight: f32,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct CognitiveState {
    pub epigenetic_drives: HashMap<String, f64>,
    pub working_memory: Vec<String>,
    pub episodic_memory: Vec<String>,
    pub semantic_memory: Vec<String>, // Legacy (text-only)
    /// Le Cortex Cérébral : Base de données vectorielle (RAG interne)
    pub cerebral_cortex: Vec<Engram>,
    /// L'Hippocampe : Base de données orientée graphe (Neo4J / GraphRAG)
    #[serde(skip)]
    pub hippocampus: Option<crate::cell::hippocampus::GraphMemory>,
    /// 2. Immunothérapie : Les cellules cancéreuses activent ceci pour se cacher
    pub is_camouflaged: bool,
}

impl CognitiveState {
    /// RAG Biologique : Recherche un souvenir (Engramme) par similarité cosinus.
    pub fn retrieve_memory(&self, query_embedding: &[f32], threshold: f32) -> Option<&Engram> {
        let mut best_match = None;
        let mut best_score = threshold;

        for engram in &self.cerebral_cortex {
            let score = crate::metrics::cosine_similarity(query_embedding, &engram.vector);
            // La Loi de Hebb influence le rappel (les souvenirs fréquents pèsent plus lourd)
            let hebbian_score = score * engram.synaptic_weight; 
            
            if hebbian_score > best_score {
                best_score = hebbian_score;
                best_match = Some(engram);
            }
        }
        best_match
    }

    /// Consolidation Mnésique : Transforme une information en mémoire à long terme
    pub fn consolidate_memory(&mut self, content: String, vector: Vec<f32>) {
        self.cerebral_cortex.push(Engram {
            content,
            vector,
            synaptic_weight: 1.0, // Connexion initiale
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cerebral_cortex_rag() {
        let mut cognition = CognitiveState::default();

        // 1. Consolidation (Apprentissage)
        cognition.consolidate_memory("Le ciel est bleu".to_string(), vec![1.0, 0.0, 0.0]);
        cognition.consolidate_memory("L'herbe est verte".to_string(), vec![0.0, 1.0, 0.0]);

        // 2. Rappel (RAG Biologique) - Requête : "Couleur du ciel" (Similaire au vecteur 1)
        let query_ciel = vec![0.9, 0.1, 0.0];
        let recall = cognition.retrieve_memory(&query_ciel, 0.5);
        
        assert!(recall.is_some());
        assert_eq!(recall.unwrap().content, "Le ciel est bleu");
    }
}


#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MetabolicSystem {
    pub mitochondria: crate::cell::Mitochondria,
    pub adipocyte: crate::cell::adipocyte::Adipocyte,
    pub chloroplast: Option<Chloroplast>,
}

impl Default for MetabolicSystem {
    fn default() -> Self {
        Self {
            mitochondria: crate::cell::Mitochondria {
                atp_budget: 10,
                metabolic_rate: 1.0,
                angiogenesis_blocked: false,
                mitochondrial_dna: crate::genome::DnaStrand::synthesize("CIRCULAR_MTDNA"),
                cyanide_poisoned: false,
                accumulated_free_radicals: 0,
                is_double_membraned: true,
            },
            adipocyte: crate::cell::adipocyte::Adipocyte::default(),
            chloroplast: None,
        }
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct GeneticSystem {
    pub nucleus: crate::cell::Nucleus,
    pub lineage: crate::cell::lineage::Lineage,
    pub horizontal_transfer: crate::genome::HorizontalTransferEngine,
}

impl Default for GeneticSystem {
    fn default() -> Self {
        Self {
            nucleus: crate::cell::Nucleus {
                genome: crate::genome::Genome::new("Default DNA"),
                ploidy: 2,
                transcription_factors: Vec::new(),
                p53_active: true,
            },
            lineage: crate::cell::lineage::Lineage::default(),
            horizontal_transfer: crate::genome::HorizontalTransferEngine::default(),
        }
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ImmuneSystem {
    pub surface_antibodies: Vec<crate::cell::Antibody>,
    pub lysosomes: crate::cell::Lysosomes,
    pub phagosome: crate::cell::phagosome::Phagosome,
}

impl Default for ImmuneSystem {
    fn default() -> Self {
        Self {
            surface_antibodies: vec![],
            lysosomes: crate::cell::Lysosomes {
                digestive_enzymes_active: false,
                phagosomes: vec![],
                expelled_debris: vec![],
            },
            phagosome: crate::cell::phagosome::Phagosome::default(),
        }
    }
}
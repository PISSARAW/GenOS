use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use crate::cell::specialization::Specialization;

/// Molécules informatives dictant l'information positionnelle (Gradients)
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum Morphogen {
    /// Détermine l'axe Antérieur (Tête / Planificateur)
    Bicoid,
    /// Détermine l'axe Ventral / Dorsal (Outils / Exécution)
    SonicHedgehog,
    /// Détermine les feuillets internes (Mémoire / Endoderme)
    Nodal,
}

/// Les Gènes Architectes (Colinéarité et Dominance Postérieure)
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub enum HoxGene {
    /// Identité Antérieure (Règles de base, Logique)
    HoxA,
    /// Identité Thoracique (Routage, Communication)
    HoxB,
    /// Identité Abdominale (Outils complexes, RAG)
    HoxC,
    /// Identité Postérieure (Exécution terminale, Spécialisation extrême)
    HoxD,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MorphogenesisSystem {
    pub gradients: HashMap<Morphogen, f32>,
    pub active_hox_genes: Vec<HoxGene>,
    pub positional_identity_locked: bool,
}

impl Default for MorphogenesisSystem {
    fn default() -> Self {
        Self {
            gradients: HashMap::new(),
            active_hox_genes: Vec::new(),
            positional_identity_locked: false,
        }
    }
}

impl MorphogenesisSystem {
    /// Reçoit des morphogènes du milieu environnant
    pub fn receive_morphogen(&mut self, morphogen: Morphogen, concentration: f32) {
        if !self.positional_identity_locked {
            let current = self.gradients.entry(morphogen).or_insert(0.0);
            *current += concentration;
        }
    }

    /// Traduit l'information positionnelle (Gradients) en plan architectural (Gènes Hox)
    pub fn pattern_formation(&mut self) {
        if self.positional_identity_locked {
            return;
        }

        self.active_hox_genes.clear();

        let bicoid = *self.gradients.get(&Morphogen::Bicoid).unwrap_or(&0.0);
        let shh = *self.gradients.get(&Morphogen::SonicHedgehog).unwrap_or(&0.0);
        let nodal = *self.gradients.get(&Morphogen::Nodal).unwrap_or(&0.0);

        // Colinéarité : Activation séquentielle selon les seuils
        if bicoid > 10.0 {
            self.active_hox_genes.push(HoxGene::HoxA);
        }
        if shh > 15.0 {
            self.active_hox_genes.push(HoxGene::HoxB);
        }
        if nodal > 20.0 {
            self.active_hox_genes.push(HoxGene::HoxC);
        }
        if shh > 30.0 && nodal > 30.0 {
            self.active_hox_genes.push(HoxGene::HoxD);
        }

        // Tri pour assurer l'ordre antéro-postérieur
        self.active_hox_genes.sort();
        self.active_hox_genes.dedup();
    }

    /// Applique la Dominance Postérieure pour déterminer le destin cellulaire final
    pub fn determine_fate(&mut self) -> Specialization {
        self.pattern_formation();
        self.positional_identity_locked = true;

        // Dominance Postérieure : Le gène Hox le plus "postérieur" (le plus élevé dans l'enum)
        // supprime ou écrase l'identité des gènes antérieurs.
        if let Some(dominant_hox) = self.active_hox_genes.last() {
            match dominant_hox {
                HoxGene::HoxD => Specialization::Custom("ToolExecutor".to_string()), // Outils extrêmes
                HoxGene::HoxC => Specialization::Custom("MemoryB".to_string()),      // Stockage / RAG (Endoderme)
                HoxGene::HoxB => Specialization::Custom("Router_CRAG_Neo4J".to_string()), // Routage & Filtre Hippocampe (CRAG)
                HoxGene::HoxA => Specialization::Custom("Planner".to_string()),      // Tête / Planification
            }
        } else {
            Specialization::Undefined
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_gradient_thresholds_and_colinearity() {
        let mut morpho = MorphogenesisSystem::default();
        
        // Gradient modéré de Bicoid (Tête)
        morpho.receive_morphogen(Morphogen::Bicoid, 12.0);
        morpho.pattern_formation();
        
        assert_eq!(morpho.active_hox_genes, vec![HoxGene::HoxA]);
        
        // Ajout d'un fort gradient de Shh
        morpho.receive_morphogen(Morphogen::SonicHedgehog, 20.0);
        morpho.pattern_formation();
        
        // Colinéarité : HoxA et HoxB sont actifs
        assert_eq!(morpho.active_hox_genes, vec![HoxGene::HoxA, HoxGene::HoxB]);
    }

    #[test]
    fn test_posterior_dominance() {
        let mut morpho = MorphogenesisSystem::default();
        
        // Hautes concentrations activant presque tout
        morpho.receive_morphogen(Morphogen::Bicoid, 50.0);
        morpho.receive_morphogen(Morphogen::SonicHedgehog, 50.0);
        morpho.receive_morphogen(Morphogen::Nodal, 50.0);
        
        let fate = morpho.determine_fate();
        
        // Le gène HoxD (ToolExecutor) doit dominer les gènes HoxA (Planner) et HoxB (Router)
        assert_eq!(fate, Specialization::Custom("ToolExecutor".to_string()), "La dominance postérieure n'a pas fonctionné");
        assert!(morpho.positional_identity_locked);
    }
}

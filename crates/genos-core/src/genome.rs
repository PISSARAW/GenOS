use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use uuid::Uuid;

/// L'ADN immuable d'un agent.
/// Attention : On utilise `BTreeMap` et non `HashMap` pour les dictionnaires !
/// Pourquoi ? Parce que l'ordre des clés dans un HashMap est aléatoire en Rust (SipHash).
/// Pour garantir que le JSON sérialisé (et donc le Hash SHA256) soit toujours strictement identique
/// pour les mêmes données, le BTreeMap trie alphabétiquement ses clés.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct Genome {
    pub genome_id: Uuid,
    /// Pour tracer l'arbre généalogique (quel agent a muté pour donner celui-ci ?)
    pub lineage_id: Uuid,
    pub version: String,
    
    /// Le code génétique de base (Le prompt système inaltérable)
    pub base_system_prompt: String,
    
    /// Le modèle assigné à la naissance (ex: "gpt-4o")
    pub base_model_id: String,
    
    /// Traits inhérents de l'agent (ex: "verbosity" -> "low", "logic" -> "strict")
    /// Utilisation de BTreeMap pour le déterminisme cryptographique.
    pub base_traits: BTreeMap<String, String>,
    
    /// Les niveaux de tolérance épigénétique de base (les seuils naturels de l'agent).
    /// Ex: "stress_tolerance" -> 0.8
    pub drive_baselines: BTreeMap<String, String>,
}

impl Genome {
    /// Crée un nouveau génome racine (Adam/Ève)
    pub fn new(prompt: &str, model: &str) -> Self {
        let id = Uuid::new_v4();
        Self {
            genome_id: id,
            lineage_id: id,
            version: "1.0.0".to_string(),
            base_system_prompt: prompt.to_string(),
            base_model_id: model.to_string(),
            base_traits: BTreeMap::new(),
            drive_baselines: BTreeMap::new(),
        }
    }

    /// Calcule l'empreinte génétique absolue (SHA256).
    /// Si un seul trait ou une seule lettre du prompt change, le Hash change.
    pub fn hash_dna(&self) -> String {
        // La sérialisation est déterministe grâce au BTreeMap
        let serialized = serde_json::to_string(self).expect("Genome must be serializable");
        let mut hasher = Sha256::new();
        hasher.update(serialized.as_bytes());
        let mut hex_string = String::with_capacity(64);
        for byte in hasher.finalize() {
            use std::fmt::Write;
            write!(&mut hex_string, "{:02x}", byte).unwrap();
        }
        hex_string
    }

    /// Opération biologique : La Mutation.
    /// Crée un nouvel agent enfant avec un trait modifié.
    pub fn mutate_trait(&self, trait_key: &str, new_value: &str) -> Self {
        let mut child_traits = self.base_traits.clone();
        child_traits.insert(trait_key.to_string(), new_value.to_string());
        
        Self {
            genome_id: Uuid::new_v4(), // Nouvel individu = nouvel ID
            lineage_id: self.lineage_id, // Mais même lignée !
            version: format!("{}-mutated", self.version),
            base_system_prompt: self.base_system_prompt.clone(),
            base_model_id: self.base_model_id.clone(),
            base_traits: child_traits,
            drive_baselines: self.drive_baselines.clone(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_genome_deterministic_hashing() {
        let mut genome1 = Genome::new("You are a helper", "gpt-4");
        genome1.base_traits.insert("logic".to_string(), "strict".to_string());
        genome1.base_traits.insert("creative".to_string(), "low".to_string());

        let genome2 = genome1.clone();
        // Même si on insérait dans un ordre différent, le BTreeMap trie les clés.
        // On vérifie que les deux clones exacts ont le même hash.
        assert_eq!(genome1.hash_dna(), genome2.hash_dna());

        // Test de mutation
        let mutant = genome1.mutate_trait("creative", "high");
        
        // Le hash DOIT être différent
        assert_ne!(genome1.hash_dna(), mutant.hash_dna());
        // Mais ils font partie de la même famille
        assert_eq!(genome1.lineage_id, mutant.lineage_id);
    }
}

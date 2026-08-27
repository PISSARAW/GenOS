//! Mémoire immunitaire : registre d'anticorps matures (réponses secondaires).

use super::detectors::{rbf_affinity, Antibody};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// Registre de mémoire immunitaire : anticorps matures commis par signature de menace.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct ImmuneMemoryRegistry {
    entries: BTreeMap<String, Antibody>,
    pub max_entries: usize,
}

impl ImmuneMemoryRegistry {
    pub fn new(max_entries: usize) -> Self {
        Self {
            entries: BTreeMap::new(),
            max_entries: max_entries.max(1),
        }
    }

    /// Commet un anticorps mature en mémoire immunitaire.
    /// Politique LRU simplifiée : au-delà de la capacité, la plus ancienne clé est évincée.
    pub fn remember(&mut self, threat_signature: &str, antibody: Antibody) {
        if !self.entries.contains_key(threat_signature) && self.entries.len() >= self.max_entries {
            let oldest = self.entries.keys().next().cloned();
            if let Some(oldest) = oldest {
                self.entries.remove(&oldest);
            }
        }
        self.entries.insert(threat_signature.to_string(), antibody);
    }

    /// Rappel exact par signature de menace (réponse secondaire, O(log n)).
    pub fn recall(&self, threat_signature: &str) -> Option<&Antibody> {
        self.entries.get(threat_signature)
    }

    /// Rappel croisé : anticorps mémorisé reconnaissant un nouvel antigène
    /// au-delà du seuil de réactivité croisée (immunité hétérologue).
    pub fn recall_cross_reactive(
        &self,
        antigen: &[f32],
        gamma: f32,
        cross_reactivity: f32,
    ) -> Option<(&String, &Antibody)> {
        self.entries
            .iter()
            .filter(|(_, a)| rbf_affinity(&a.centroid, antigen, gamma) >= cross_reactivity)
            .last()
    }

    pub fn len(&self) -> usize {
        self.entries.len()
    }

    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn antibody(x: f32) -> Antibody {
        Antibody {
            id: format!("ab-{x}"),
            centroid: vec![x, x],
            radius: 0.2,
            generation: 1,
        }
    }

    #[test]
    fn immune_memory_supports_exact_and_cross_reactive_recall() {
        let mut registry = ImmuneMemoryRegistry::new(4);
        registry.remember("sql-injection", antibody(0.1));
        registry.remember("prompt-exfiltration", antibody(0.9));
        assert_eq!(registry.len(), 2);
        assert!(!registry.is_empty());
        assert!(registry.recall("sql-injection").is_some());
        assert!(registry.recall("unknown").is_none());

        // Rappel croisé : un antigène voisin de l'injection SQL est reconnu.
        let cross = registry.recall_cross_reactive(&[0.12, 0.11], 8.0, 0.5);
        assert!(cross.is_some());
        assert_eq!(cross.unwrap().0, "sql-injection");

        // Un antigène sans voisin mémorisé ne déclenche rien.
        assert!(registry
            .recall_cross_reactive(&[0.5, 0.5], 8.0, 0.99)
            .is_none());
    }

    #[test]
    fn registry_evicts_oldest_entry_beyond_capacity() {
        let mut registry = ImmuneMemoryRegistry::new(3);
        for i in 0..5 {
            registry.remember(&format!("threat-{i}"), antibody(i as f32 / 10.0));
        }
        assert!(registry.len() <= registry.max_entries);
        // Les plus anciennes signatures ont été évincées.
        assert!(registry.recall("threat-0").is_none());
        assert!(registry.recall("threat-4").is_some());
        // Ré-écrire une signature existante ne déclenche pas d'éviction.
        registry.remember("threat-4", antibody(0.42));
        assert_eq!(registry.len(), 3);
    }
}

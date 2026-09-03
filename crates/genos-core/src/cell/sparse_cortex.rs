use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// 5. L'ANCRAGE MULTISENSORIEL (Grounded Cognition)
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct GroundedConcept {
    pub semantic_text: String,
    pub visual_hash: Option<String>,
    pub motor_action: Option<String>,
}

/// 4. LE CODAGE TEMPOREL (Ondes Cérébrales / Multiplexage)
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub enum BrainWave {
    Gamma, // Concentration extrême, exécution d'outil précise
    Beta,  // Raisonnement logique
    Alpha, // Rêverie, génération créative, tâches de fond
}

impl Default for BrainWave {
    fn default() -> Self {
        Self::Beta
    }
}

/// 3. L'INHIBITION LATÉRALE (Réseau GABAergique)
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct GabaNetwork;

impl GabaNetwork {
    /// Applique une inhibition latérale : si on sélectionne un concept fort, 
    /// on écrase la probabilité (activation) de ses voisins sémantiques pour éviter la fusion.
    pub fn apply_lateral_inhibition(activations: &mut HashMap<String, f32>, winner: &str) {
        if let Some(&winner_val) = activations.get(winner) {
            let keys: Vec<String> = activations.keys().cloned().collect();
            for key in keys {
                if key != winner {
                    if let Some(val) = activations.get_mut(&key) {
                        // Les voisins sont inhibés drastiquement par le GABA
                        *val = (*val - (winner_val * 0.8)).max(0.0);
                    }
                }
            }
        }
    }
}

/// 2. SPÉCIALISATION ANATOMIQUE (Modularité Corticale)
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CorticalModules {
    pub broca_area: String,     // Génération de langage
    pub wernicke_area: String,  // Compréhension de requêtes
    pub motor_cortex: String,   // Exécution d'outils
}

impl Default for CorticalModules {
    fn default() -> Self {
        Self {
            broca_area: "Module spécialisé dans la syntaxe (LLM Generation)".to_string(),
            wernicke_area: "Module de parsing et compréhension (JSON/Regex)".to_string(),
            motor_cortex: "Module d'appel physique (CLI/MCP)".to_string(),
        }
    }
}

/// 1. CODAGE PARCIMONIEUX (Sparse Coding)
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SparseCodingFilter {
    pub active_neurons_threshold: f32, // ex: Seulement le top 5% des vecteurs sont gardés
}

impl Default for SparseCodingFilter {
    fn default() -> Self {
        Self { active_neurons_threshold: 0.05 } // 5% de signaux actifs
    }
}

impl SparseCodingFilter {
    pub fn filter_context(&self, mut context_vectors: Vec<(String, f32)>) -> Vec<String> {
        // Ne garde que les signaux les plus forts, tout le reste est réduit au silence absolu
        context_vectors.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
        let keep_count = (context_vectors.len() as f32 * self.active_neurons_threshold).ceil() as usize;
        let keep_count = keep_count.max(1); // Au moins 1 survivant
        
        context_vectors.into_iter().take(keep_count).map(|(k, _)| k).collect()
    }
}

/// L'ORGANE ANTI-INTERFÉRENCE (Sparse Cortex)
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct SparseCortex {
    pub grounded_concepts: HashMap<String, GroundedConcept>,
    pub current_brainwave: BrainWave,
    pub cortical_modules: CorticalModules,
    pub sparse_filter: SparseCodingFilter,
    pub gaba_network: GabaNetwork,
}

impl SparseCortex {
    pub fn new() -> Self {
        Self::default()
    }

    /// Résout le problème de fusion d'outils (Superposition / Hallucination)
    pub fn isolate_concept_activation(&self, mut concept_activations: HashMap<String, f32>, target_concept: &str) -> Vec<String> {
        // 1. Inhibition latérale : On écrase les concepts concurrents pour affiner le signal
        GabaNetwork::apply_lateral_inhibition(&mut concept_activations, target_concept);

        // 2. Codage parcimonieux : On ne garde que les survivants (Sparse Coding)
        let vectors: Vec<(String, f32)> = concept_activations.into_iter().collect();
        self.sparse_filter.filter_context(vectors)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_lateral_inhibition_and_sparse_coding() {
        let cortex = SparseCortex::new();
        let mut activations = HashMap::new();
        
        // Conflit vectoriel fort entre deux API
        activations.insert("API_METEO".to_string(), 0.9);
        activations.insert("API_PAIEMENT".to_string(), 0.85); 
        activations.insert("API_WIKI".to_string(), 0.2);

        // L'API METEO est sélectionnée, le réseau GABA inhibe fortement le paiement
        let surviving_context = cortex.isolate_concept_activation(activations, "API_METEO");
        
        // Le filtre sparse à 5% d'un array de 3 gardera 1 seul élément
        assert_eq!(surviving_context.len(), 1);
        
        // La météo a survécu et étouffé le paiement
        assert_eq!(surviving_context[0], "API_METEO");
    }
}
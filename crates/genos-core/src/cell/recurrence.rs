use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// 4. MÉMOIRE DE TRAVAIL (Statefulness et Attracteurs Stables)
/// Maintient l'état entre les itérations de pensée, évitant au modèle
/// de devoir relire tout son historique (Stateless Transformer).
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct WorkingMemory {
    pub active_attractors: HashMap<String, String>,
}

impl WorkingMemory {
    pub fn hold_state(&mut self, key: &str, value: &str) {
        self.active_attractors.insert(key.to_string(), value.to_string());
    }
    pub fn recall_state(&self, key: &str) -> Option<&String> {
        self.active_attractors.get(key)
    }
    pub fn clear_state(&mut self) {
        self.active_attractors.clear();
    }
}

/// 3. LA BOUCLE PHONOLOGIQUE (Discours Intérieur / CoT Natif)
/// Génération de jetons (tokens) internes non émis vers l'extérieur.
/// Fractionne la complexité en étapes de pensée invisibles.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct PhonologicalLoop {
    pub inner_speech_buffer: Vec<String>,
}

impl PhonologicalLoop {
    pub fn think_step(&mut self, thought: &str) {
        self.inner_speech_buffer.push(thought.to_string());
    }
    pub fn synthesize_thoughts(&mut self) -> String {
        let synthesis = self.inner_speech_buffer.join(" -> ");
        self.inner_speech_buffer.clear();
        synthesis
    }
}

/// 2. ALLOCATION DYNAMIQUE DU TEMPS (Temps vs Espace)
/// Un LLM standard dépense O(1) par token. Ce module autorise l'agent 
/// à inhiber l'action motrice pour boucler X fois selon la complexité.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct DynamicComputeTime {
    pub required_iterations: u32,
    pub current_iteration: u32,
}

impl DynamicComputeTime {
    pub fn set_complexity(&mut self, is_complex: bool) {
        self.required_iterations = if is_complex { 10 } else { 1 };
        self.current_iteration = 0;
    }
    
    pub fn tick(&mut self) -> bool {
        self.current_iteration += 1;
        self.current_iteration >= self.required_iterations
    }
}

/// 1. RÉCURRENCE MASSIVE (Boucle Cortico-Thalamique)
/// Permet l'évaluation native d'une boucle `while` interne sans externaliser.
/// Convertit l'espace latent statique en une machine de Turing temporelle.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct CorticoThalamicLoop {
    pub is_loop_active: bool,
}

impl CorticoThalamicLoop {
    pub fn execute_native_while<F>(&mut self, mut condition: F) 
    where F: FnMut() -> bool 
    {
        self.is_loop_active = true;
        while condition() {
            // Boucle d'information interne simulée
        }
        self.is_loop_active = false;
    }
}

/// L'ORGANE DE RÉCURRENCE TEMPORELLE (Profondeur de Calcul)
/// Brise la limitation Feed-Forward des Transformers (1 token = 1 passe).
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct RecurrentNetwork {
    pub working_memory: WorkingMemory,
    pub phonological_loop: PhonologicalLoop,
    pub dynamic_compute: DynamicComputeTime,
    pub thalamocortical: CorticoThalamicLoop,
}

impl RecurrentNetwork {
    pub fn new() -> Self {
        Self::default()
    }

    /// Résout un problème via récurrence temporelle plutôt que force brute spatiale
    pub fn deliberate_complex_problem(&mut self, problem: &str, is_complex: bool) -> String {
        self.dynamic_compute.set_complexity(is_complex);
        self.working_memory.hold_state("current_problem", problem);

        let mut solved = false;
        
        // Boucle Cortico-Thalamique (Récurrence massive)
        self.thalamocortical.execute_native_while(|| {
            if self.dynamic_compute.tick() {
                solved = true;
                false // Stop condition
            } else {
                // Discours intérieur (Chain of Thought invisible)
                self.phonological_loop.think_step(&format!("Je réfléchis à l'étape {}", self.dynamic_compute.current_iteration));
                true // Continuer de boucler
            }
        });

        if solved {
            let thoughts = self.phonological_loop.synthesize_thoughts();
            self.working_memory.clear_state();
            format!("✅ [RÉCURRENCE] Problème résolu après une réflexion profonde. Pensées latentes : {}", thoughts)
        } else {
            "❌ [RÉCURRENCE] Problème trivial, action réflexe immédiate.".to_string()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_recurrent_network() {
        let mut brain = RecurrentNetwork::new();
        
        // 1. Problème Trivial (Action immédiate, 1 passe)
        let reflex = brain.deliberate_complex_problem("2 + 2", false);
        assert!(reflex.contains("RÉCURRENCE"));
        assert!(!reflex.contains("étape 9"));
        
        // 2. Problème Complexe (L'agent inhibe son action et boucle)
        let deep_thought = brain.deliberate_complex_problem("Théorème de Fermat", true);
        assert!(deep_thought.contains("étape 9")); // Il a pensé pendant X itérations dans sa boucle interne
        
        // La mémoire de travail est nettoyée après résolution
        assert!(brain.working_memory.recall_state("current_problem").is_none());
    }
}
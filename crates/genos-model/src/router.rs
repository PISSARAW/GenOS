use crate::inference::{InferenceBackend, InferenceResult};

/// Tiers de tâches définissant le niveau du modèle à engager pour une exécution optimale.
pub enum TaskTier {
    /// Tâches simples ou initiales (triage, schéma) pouvant être exécutées par un SLM local.
    Tier0,
    /// Raisonnement complexe nécessitant l'escalade vers un modèle Frontier.
    Tier2,
}

/// Moteur de routage adaptatif qui décide dynamiquement quel backend d'inférence utiliser 
/// (SLM vs Frontier) en fonction de l'entropie sémantique calculée.
pub struct ModelRouter {
    /// Le modèle de petit langage (SLM) local exécuté en premier ressort.
    pub slm: Box<dyn InferenceBackend>,
    /// Le modèle Frontier de repli utilisé en cas de forte incertitude.
    pub frontier: Box<dyn InferenceBackend>,
    /// Seuil d'entropie au-delà duquel la tâche est escaladée au modèle Frontier.
    pub entropy_threshold: f32,
}

impl ModelRouter {
    /// Aiguille et exécute la requête : tente l'inférence via le SLM local, 
    /// puis escalade vers le modèle Frontier si l'entropie générée dépasse `entropy_threshold`.
    pub fn route_and_execute(&self, prompt: &str) -> Result<InferenceResult, std::io::Error> {
        let slm_result = self.slm.generate(prompt)?;
        
        if slm_result.semantic_entropy > self.entropy_threshold {
            return self.frontier.generate(prompt);
        }
        
        Ok(slm_result)
    }
}

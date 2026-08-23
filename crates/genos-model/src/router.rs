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
        let slm_result = match self.slm.generate(prompt) {
            Ok(result) => result,
            Err(_) => return self.frontier.generate(prompt),
        };

        if !slm_result.semantic_entropy.is_finite()
            || !self.entropy_threshold.is_finite()
            || slm_result.semantic_entropy > self.entropy_threshold
        {
            return self.frontier.generate(prompt);
        }

        Ok(slm_result)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io;
    struct Backend(ResultEntropy);
    enum ResultEntropy {
        Value(f32, &'static str),
        Failure,
    }
    impl InferenceBackend for Backend {
        fn generate(&self, _: &str) -> Result<InferenceResult, io::Error> {
            match self.0 {
                ResultEntropy::Value(entropy, text) => Ok(InferenceResult {
                    text: text.into(),
                    semantic_entropy: entropy,
                }),
                ResultEntropy::Failure => Err(io::Error::other("offline")),
            }
        }
    }
    #[test]
    fn slm_failure_and_non_finite_entropy_escalate() {
        for slm in [
            ResultEntropy::Failure,
            ResultEntropy::Value(f32::NAN, "unsafe"),
        ] {
            let router = ModelRouter {
                slm: Box::new(Backend(slm)),
                frontier: Box::new(Backend(ResultEntropy::Value(0.1, "frontier"))),
                entropy_threshold: 0.5,
            };
            assert_eq!(router.route_and_execute("prompt").unwrap().text, "frontier");
        }
    }
}

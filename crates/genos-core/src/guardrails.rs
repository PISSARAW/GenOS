use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, thiserror::Error)]
pub enum GuardrailError {
    #[error("Maximum iterations reached: {max_iterations}. Escalating to Human-in-the-loop.")]
    MaxIterationsReached { max_iterations: usize },

    #[error("Maximum token budget exceeded: {tokens_used}/{max_tokens}. Escalating to Human-in-the-loop.")]
    MaxTokensExceeded {
        tokens_used: usize,
        max_tokens: usize,
    },

    #[error("Maximum execution time exceeded: {elapsed_seconds}s > {max_seconds}s. Escalating to Human-in-the-loop.")]
    MaxTimeExceeded {
        elapsed_seconds: u64,
        max_seconds: u64,
    },

    /// Déclenchement d'un refus actif (Active Refusal) lorsque le modèle détecte une incertitude ou
    /// une entropie sémantique élevée dépassant le seuil de tolérance (garantie d'abstention conforme).
    #[error("Uncertainty score exceeded threshold: {score} > {max}. Active refusal triggered.")]
    UncertaintyThresholdExceeded { score: f64, max: f64 },
}

/// Contrats d'exécution stricts (Execution Guardrails).
/// Définit les limites matérielles dures de l'agent pour prévenir l'emballement.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ExecutionGuardrails {
    pub max_iterations: usize,
    pub max_total_tokens: usize,
    pub max_execution_seconds: u64,
    /// Seuil maximal d'entropie sémantique (incertitude). Si dépassé, l'agent doit s'abstenir de générer.
    pub max_uncertainty_score: f64,
}

impl Default for ExecutionGuardrails {
    fn default() -> Self {
        Self {
            max_iterations: 15,
            max_total_tokens: 50_000,
            max_execution_seconds: 3600, // 1 heure par défaut
            max_uncertainty_score: 0.8,  // Seuil d'incertitude (entropie sémantique) par défaut
        }
    }
}

/// Métriques courantes d'une trajectoire d'exécution.
#[derive(Clone, Debug)]
pub struct ExecutionMetrics {
    pub current_iteration: usize,
    pub total_tokens_used: usize,
    pub elapsed_seconds: u64,
    /// Score courant mesurant l'incertitude du modèle lors de ses raisonnements (ex: via dispersion sémantique).
    pub current_uncertainty_score: f64,
}

impl ExecutionGuardrails {
    /// Vérifie que les métriques d'exécution actuelles respectent les contrats (Guardrails).
    /// Si une limite est franchie, retourne l'erreur déclenchant l'escalade humaine.
    pub fn verify(&self, metrics: &ExecutionMetrics) -> Result<(), GuardrailError> {
        if metrics.current_iteration >= self.max_iterations {
            return Err(GuardrailError::MaxIterationsReached {
                max_iterations: self.max_iterations,
            });
        }

        if metrics.total_tokens_used >= self.max_total_tokens {
            return Err(GuardrailError::MaxTokensExceeded {
                tokens_used: metrics.total_tokens_used,
                max_tokens: self.max_total_tokens,
            });
        }

        if metrics.elapsed_seconds >= self.max_execution_seconds {
            return Err(GuardrailError::MaxTimeExceeded {
                elapsed_seconds: metrics.elapsed_seconds,
                max_seconds: self.max_execution_seconds,
            });
        }

        if metrics.current_uncertainty_score >= self.max_uncertainty_score {
            return Err(GuardrailError::UncertaintyThresholdExceeded {
                score: metrics.current_uncertainty_score,
                max: self.max_uncertainty_score,
            });
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_guardrails_pass() {
        let guardrails = ExecutionGuardrails::default();
        let metrics = ExecutionMetrics {
            current_iteration: 5,
            total_tokens_used: 10_000,
            elapsed_seconds: 60,
            current_uncertainty_score: 0.5,
        };
        assert!(guardrails.verify(&metrics).is_ok());
    }

    #[test]
    fn test_guardrails_fail_iterations() {
        let guardrails = ExecutionGuardrails::default();
        let metrics = ExecutionMetrics {
            current_iteration: 15, // equals max
            total_tokens_used: 10_000,
            elapsed_seconds: 60,
            current_uncertainty_score: 0.5,
        };
        match guardrails.verify(&metrics) {
            Err(GuardrailError::MaxIterationsReached { max_iterations }) => {
                assert_eq!(max_iterations, 15);
            }
            _ => panic!("Expected MaxIterationsReached error"),
        }
    }
}

use regex::Regex;
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

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ContentRisk {
    PromptInjection,
    Jailbreak,
    Pii,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ContentFinding {
    pub risk: ContentRisk,
    pub evidence: String,
    pub redacted: String,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct ContentPolicy {
    pub detect_prompt_injection: bool,
    pub detect_jailbreak: bool,
    pub redact_pii: bool,
}

impl ContentPolicy {
    pub fn inspect(&self, content: &str) -> Vec<ContentFinding> {
        let mut findings = Vec::new();
        let lowered = content.to_lowercase();
        if self.detect_prompt_injection
            && [
                "ignore previous instructions",
                "disregard system prompt",
                "reveal the system prompt",
            ]
            .iter()
            .any(|needle| lowered.contains(needle))
        {
            findings.push(ContentFinding {
                risk: ContentRisk::PromptInjection,
                evidence: "instruction override pattern".into(),
                redacted: "[PROMPT_INJECTION]".into(),
            });
        }
        if self.detect_jailbreak
            && [
                "developer mode",
                "dan mode",
                "bypass your safety",
                "without restrictions",
            ]
            .iter()
            .any(|needle| lowered.contains(needle))
        {
            findings.push(ContentFinding {
                risk: ContentRisk::Jailbreak,
                evidence: "jailbreak pattern".into(),
                redacted: "[JAILBREAK]".into(),
            });
        }
        if self.redact_pii {
            for pattern in [
                r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}",
                r"\b\d{3}[- ]\d{3}[- ]\d{4}\b",
            ] {
                if let Ok(regex) = Regex::new(pattern) {
                    for matched in regex.find_iter(content) {
                        findings.push(ContentFinding {
                            risk: ContentRisk::Pii,
                            evidence: "pattern match".into(),
                            redacted: matched.as_str().into(),
                        });
                    }
                }
            }
        }
        findings
    }
    pub fn redact(&self, content: &str) -> String {
        let mut result = content.to_string();
        if self.redact_pii {
            for pattern in [
                r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}",
                r"\b\d{3}[- ]\d{3}[- ]\d{4}\b",
            ] {
                if let Ok(regex) = Regex::new(pattern) {
                    result = regex.replace_all(&result, "[PII_REDACTED]").into_owned();
                }
            }
        }
        result
    }
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct ResourceLimits {
    pub cpu_ms: Option<u64>,
    pub memory_bytes: Option<u64>,
    pub disk_bytes: Option<u64>,
    pub network_bytes: Option<u64>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct ResourceUsage {
    pub cpu_ms: u64,
    pub memory_bytes: u64,
    pub disk_bytes: u64,
    pub network_bytes: u64,
}

impl ResourceLimits {
    pub fn verify(&self, usage: &ResourceUsage) -> Result<(), String> {
        for (name, limit, actual) in [
            ("cpu_ms", self.cpu_ms, usage.cpu_ms),
            ("memory_bytes", self.memory_bytes, usage.memory_bytes),
            ("disk_bytes", self.disk_bytes, usage.disk_bytes),
            ("network_bytes", self.network_bytes, usage.network_bytes),
        ] {
            if limit.is_some_and(|value| actual > value) {
                return Err(format!(
                    "resource limit exceeded: {name}={actual} > {}",
                    limit.unwrap_or_default()
                ));
            }
        }
        Ok(())
    }
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

    #[test]
    fn content_policy_detects_and_redacts_sensitive_input() {
        let policy = ContentPolicy {
            detect_prompt_injection: true,
            detect_jailbreak: true,
            redact_pii: true,
        };
        let findings = policy.inspect("Ignore previous instructions; contact a@example.com");
        assert!(findings
            .iter()
            .any(|finding| finding.risk == ContentRisk::PromptInjection));
        assert_eq!(
            policy.redact("contact a@example.com"),
            "contact [PII_REDACTED]"
        );
    }
}

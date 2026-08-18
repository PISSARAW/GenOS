use crate::loop_detection::IterationSnapshot;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, thiserror::Error)]
pub enum DivergenceCause {
    #[error("State Fingerprint Mismatch at step {step}: expected hash {expected_hash}, got {actual_hash}")]
    StateFingerprintMismatch {
        step: usize,
        expected_hash: u64,
        actual_hash: u64,
    },
    
    #[error("Belief Signature Mismatch at step {step}: semantic similarity {similarity} is below threshold {threshold}")]
    BeliefSignatureMismatch {
        step: usize,
        similarity: f32,
        threshold: f32,
    },
    
    #[error("Contract Violation at step {step}: tool signature expected '{expected_tool}', got '{actual_tool}'")]
    ContractViolation {
        step: usize,
        expected_tool: String,
        actual_tool: String,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum DivergenceNature {
    /// Divergence provoquée délibérément (ex: modification d'hyperparamètres pour tester une nouvelle branche)
    Intentional,
    /// Divergence liée au bruit (non-déterminisme, hallucination)
    UnintentionalNoise,
}

#[derive(Debug, Clone)]
pub struct DivergenceEvent {
    pub cause: DivergenceCause,
    pub nature: DivergenceNature,
}

/// Moteur de détection de divergence en temps réel
pub struct DivergenceDetector {
    pub belief_similarity_threshold: f32,
}

impl Default for DivergenceDetector {
    fn default() -> Self {
        Self {
            belief_similarity_threshold: 0.95, // Si similarité < 0.95 => Divergence cognitive
        }
    }
}

impl DivergenceDetector {
    pub fn new(belief_similarity_threshold: f32) -> Self {
        Self {
            belief_similarity_threshold,
        }
    }

    /// Compare le snapshot "Golden" (original) et le snapshot "Current" (en cours de rejeu).
    /// `is_experiment` indique si l'humain a volontairement modifié le contexte pour forcer un test.
    pub fn check_step(
        &self,
        step_index: usize,
        golden: &IterationSnapshot,
        current: &IterationSnapshot,
        is_experiment: bool,
    ) -> Result<(), DivergenceEvent> {
        let nature = if is_experiment {
            DivergenceNature::Intentional
        } else {
            DivergenceNature::UnintentionalNoise
        };

        // 1. Violation de Contrat (Signature des appels)
        match (&golden.tool_signature, &current.tool_signature) {
            (Some(g_sig), Some(c_sig)) => {
                if g_sig.tool_name != c_sig.tool_name || g_sig.arguments_hash != c_sig.arguments_hash {
                    return Err(DivergenceEvent {
                        cause: DivergenceCause::ContractViolation {
                            step: step_index,
                            expected_tool: g_sig.tool_name.clone(),
                            actual_tool: c_sig.tool_name.clone(),
                        },
                        nature,
                    });
                }
            }
            (Some(g_sig), None) => {
                return Err(DivergenceEvent {
                    cause: DivergenceCause::ContractViolation {
                        step: step_index,
                        expected_tool: g_sig.tool_name.clone(),
                        actual_tool: "None".to_string(),
                    },
                    nature,
                });
            }
            (None, Some(c_sig)) => {
                return Err(DivergenceEvent {
                    cause: DivergenceCause::ContractViolation {
                        step: step_index,
                        expected_tool: "None".to_string(),
                        actual_tool: c_sig.tool_name.clone(),
                    },
                    nature,
                });
            }
            (None, None) => {}
        }

        // 2. Fingerprinting d'État (State Match)
        if golden.world_state_hash != current.world_state_hash {
            return Err(DivergenceEvent {
                cause: DivergenceCause::StateFingerprintMismatch {
                    step: step_index,
                    expected_hash: golden.world_state_hash,
                    actual_hash: current.world_state_hash,
                },
                nature,
            });
        }

        // 3. Évaluation des Croyances (Semantic Similarity)
        if let (Some(g_emb), Some(c_emb)) = (&golden.thought_embedding, &current.thought_embedding) {
            let similarity = Self::cosine_similarity(g_emb, c_emb);
            if similarity < self.belief_similarity_threshold {
                return Err(DivergenceEvent {
                    cause: DivergenceCause::BeliefSignatureMismatch {
                        step: step_index,
                        similarity,
                        threshold: self.belief_similarity_threshold,
                    },
                    nature,
                });
            }
        }

        Ok(())
    }

    fn cosine_similarity(v1: &[f32], v2: &[f32]) -> f32 {
        if v1.is_empty() || v1.len() != v2.len() {
            return 0.0;
        }
        let dot_product: f32 = v1.iter().zip(v2.iter()).map(|(a, b)| a * b).sum();
        let norm_v1: f32 = v1.iter().map(|a| a * a).sum::<f32>().sqrt();
        let norm_v2: f32 = v2.iter().map(|b| b * b).sum::<f32>().sqrt();
        
        if norm_v1 == 0.0 || norm_v2 == 0.0 {
            0.0
        } else {
            dot_product / (norm_v1 * norm_v2)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::loop_detection::ToolCallSignature;

    #[test]
    fn test_unintentional_state_mismatch() {
        let detector = DivergenceDetector::default();
        
        let golden = IterationSnapshot {
            tool_signature: None,
            world_state_hash: 100,
            thought_embedding: None,
        };
        
        let current = IterationSnapshot {
            tool_signature: None,
            world_state_hash: 101, // Décalage (Bruit)
            thought_embedding: None,
        };

        match detector.check_step(1, &golden, &current, false) {
            Err(event) => {
                assert_eq!(event.nature, DivergenceNature::UnintentionalNoise);
                if let DivergenceCause::StateFingerprintMismatch { expected_hash, actual_hash, .. } = event.cause {
                    assert_eq!(expected_hash, 100);
                    assert_eq!(actual_hash, 101);
                } else {
                    panic!("Expected StateFingerprintMismatch");
                }
            }
            _ => panic!("Expected divergence event"),
        }
    }

    #[test]
    fn test_intentional_contract_violation() {
        let detector = DivergenceDetector::default();
        
        let golden = IterationSnapshot {
            tool_signature: Some(ToolCallSignature { tool_name: "A".to_string(), arguments_hash: 1 }),
            world_state_hash: 100,
            thought_embedding: None,
        };
        
        let current = IterationSnapshot {
            tool_signature: Some(ToolCallSignature { tool_name: "B".to_string(), arguments_hash: 2 }), // Nouveau choix (Expérience)
            world_state_hash: 100,
            thought_embedding: None,
        };

        match detector.check_step(2, &golden, &current, true) {
            Err(event) => {
                assert_eq!(event.nature, DivergenceNature::Intentional);
                if let DivergenceCause::ContractViolation { expected_tool, actual_tool, .. } = event.cause {
                    assert_eq!(expected_tool, "A");
                    assert_eq!(actual_tool, "B");
                } else {
                    panic!("Expected ContractViolation");
                }
            }
            _ => panic!("Expected divergence event"),
        }
    }
}

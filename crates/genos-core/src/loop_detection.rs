use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, thiserror::Error)]
pub enum CognitiveLoopError {
    #[error("Exact signature match loop detected: tool '{tool_name}' called {count} times with identical arguments.")]
    ExactSignatureMatch {
        tool_name: String,
        count: usize,
    },
    #[error("State stagnation detected: no state change observed for {count} iterations.")]
    StateStagnation {
        count: usize,
    },
    #[error("Semantic loop detected: thought similarity exceeded threshold ({similarity} > {threshold}).")]
    SemanticSimilarity {
        similarity: f32,
        threshold: f32,
    },
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ToolCallSignature {
    pub tool_name: String,
    pub arguments_hash: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct IterationSnapshot {
    pub tool_signature: Option<ToolCallSignature>,
    pub world_state_hash: u64,
    /// Représentation JSON de l'état (utile pour la normalisation du bruit).
    pub world_state_content: Option<String>,
    /// Vectorized representation of the thought for similarity checks.
    pub thought_embedding: Option<Vec<f32>>,
}

pub struct CircuitBreaker {
    pub history: Vec<IterationSnapshot>,
    pub exact_match_threshold: usize,
    pub stagnation_threshold: usize,
    pub semantic_similarity_threshold: f32,
}

impl Default for CircuitBreaker {
    fn default() -> Self {
        Self {
            history: Vec::new(),
            exact_match_threshold: 3,
            stagnation_threshold: 5,
            semantic_similarity_threshold: 0.95,
        }
    }
}

impl CircuitBreaker {
    pub fn new(exact_match: usize, stagnation: usize, semantic_similarity: f32) -> Self {
        Self {
            history: Vec::new(),
            exact_match_threshold: exact_match,
            stagnation_threshold: stagnation,
            semantic_similarity_threshold: semantic_similarity,
        }
    }

    pub fn record_iteration(&mut self, snapshot: IterationSnapshot) {
        self.history.push(snapshot);
    }

    pub fn check_for_loops(&self) -> Result<(), CognitiveLoopError> {
        self.check_exact_signature_match()?;
        self.check_state_stagnation()?;
        self.check_semantic_similarity()?;
        Ok(())
    }

    fn check_exact_signature_match(&self) -> Result<(), CognitiveLoopError> {
        if self.history.len() < self.exact_match_threshold {
            return Ok(());
        }

        let mut consecutive_matches = 1;
        let mut last_sig: Option<&ToolCallSignature> = None;

        for snapshot in self.history.iter().rev() {
            if let Some(sig) = &snapshot.tool_signature {
                if let Some(last) = last_sig {
                    if last.tool_name == sig.tool_name && last.arguments_hash == sig.arguments_hash {
                        consecutive_matches += 1;
                        if consecutive_matches >= self.exact_match_threshold {
                            return Err(CognitiveLoopError::ExactSignatureMatch {
                                tool_name: sig.tool_name.clone(),
                                count: consecutive_matches,
                            });
                        }
                    } else {
                        break;
                    }
                } else {
                    last_sig = Some(sig);
                }
            } else {
                break;
            }
        }

        Ok(())
    }

    fn check_state_stagnation(&self) -> Result<(), CognitiveLoopError> {
        if self.history.len() < self.stagnation_threshold {
            return Ok(());
        }

        let last_hash = self.history.last().unwrap().world_state_hash;
        let mut stagnant_count = 0;

        for snapshot in self.history.iter().rev() {
            if snapshot.world_state_hash == last_hash {
                stagnant_count += 1;
                if stagnant_count >= self.stagnation_threshold {
                    return Err(CognitiveLoopError::StateStagnation {
                        count: stagnant_count,
                    });
                }
            } else {
                break;
            }
        }

        Ok(())
    }

    fn check_semantic_similarity(&self) -> Result<(), CognitiveLoopError> {
        let len = self.history.len();
        if len < 3 {
            return Ok(());
        }

        let current = &self.history[len - 1];
        let previous_alternate = &self.history[len - 3]; // Compare N with N-2

        if let (Some(emb1), Some(emb2)) = (&current.thought_embedding, &previous_alternate.thought_embedding) {
            let similarity = Self::cosine_similarity(emb1, emb2);
            if similarity >= self.semantic_similarity_threshold {
                return Err(CognitiveLoopError::SemanticSimilarity {
                    similarity,
                    threshold: self.semantic_similarity_threshold,
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

    #[test]
    fn test_exact_signature_match() {
        let mut breaker = CircuitBreaker::default();
        let sig = ToolCallSignature {
            tool_name: "edit_file".to_string(),
            arguments_hash: 12345,
        };

        for _ in 0..2 {
            breaker.record_iteration(IterationSnapshot {
                tool_signature: Some(sig.clone()),
                world_state_hash: 0,
                world_state_content: None,
                thought_embedding: None,
            });
        }
        assert!(breaker.check_for_loops().is_ok());

        breaker.record_iteration(IterationSnapshot {
            tool_signature: Some(sig.clone()),
            world_state_hash: 0,
            world_state_content: None,
            thought_embedding: None,
        });

        match breaker.check_for_loops() {
            Err(CognitiveLoopError::ExactSignatureMatch { tool_name, count }) => {
                assert_eq!(tool_name, "edit_file");
                assert_eq!(count, 3);
            }
            _ => panic!("Expected ExactSignatureMatch error"),
        }
    }

    #[test]
    fn test_state_stagnation() {
        let mut breaker = CircuitBreaker::new(10, 3, 0.95);
        for i in 0..2 {
            breaker.record_iteration(IterationSnapshot {
                tool_signature: None,
                world_state_hash: 42,
                world_state_content: None,
                thought_embedding: None,
            });
        }
        assert!(breaker.check_for_loops().is_ok());

        breaker.record_iteration(IterationSnapshot {
            tool_signature: None,
            world_state_hash: 42,
            world_state_content: None,
            thought_embedding: None,
        });

        match breaker.check_for_loops() {
            Err(CognitiveLoopError::StateStagnation { count }) => {
                assert_eq!(count, 3);
            }
            _ => panic!("Expected StateStagnation error"),
        }
    }

    #[test]
    fn test_semantic_similarity() {
        let mut breaker = CircuitBreaker::new(10, 10, 0.90);
        breaker.record_iteration(IterationSnapshot {
            tool_signature: None,
            world_state_hash: 1,
            world_state_content: None,
            thought_embedding: Some(vec![1.0, 0.0, 0.0]),
        });
        breaker.record_iteration(IterationSnapshot {
            tool_signature: None,
            world_state_hash: 2,
            world_state_content: None,
            thought_embedding: Some(vec![0.0, 1.0, 0.0]),
        });
        breaker.record_iteration(IterationSnapshot {
            tool_signature: None,
            world_state_hash: 3,
            world_state_content: None,
            thought_embedding: Some(vec![0.9, 0.1, 0.0]), // Highly similar to N-2
        });

        match breaker.check_for_loops() {
            Err(CognitiveLoopError::SemanticSimilarity { similarity, .. }) => {
                assert!(similarity > 0.90);
            }
            _ => panic!("Expected SemanticSimilarity error"),
        }
    }
}

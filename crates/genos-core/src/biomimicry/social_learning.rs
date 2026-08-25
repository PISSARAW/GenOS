//! Social Learning mapped to cross-agent pedagogical replay.
//!
//! Biological mechanism: Young animals learn complex skills (hunting, vocalization)
//! not by trial and error, but by observing and mimicking experienced adults.
//! GenOS mapping: A "Junior" agent bypasses expensive MCTS exploration by 
//! downloading and replaying the successful causal DAGs (macros) of a "Senior" agent.

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LearningStatus {
    Observing,
    Mimicking,
    Mastered,
}

#[derive(Debug, Clone)]
pub struct SocialLearning {
    pub junior_id: String,
    pub senior_id: String,
    pub status: LearningStatus,
}

impl SocialLearning {
    pub fn new(junior_id: String, senior_id: String) -> Self {
        Self {
            junior_id,
            senior_id,
            status: LearningStatus::Observing,
        }
    }

    /// Evaluates if the junior agent has successfully integrated the senior's macro
    pub fn attempt_mimicry(&mut self, alignment_score: f64) -> Result<LearningStatus, String> {
        self.status = LearningStatus::Mimicking;
        
        if alignment_score >= 0.95 {
            self.status = LearningStatus::Mastered;
            Ok(LearningStatus::Mastered)
        } else {
            Err(format!("Mimicry failed (score: {:.2}). Needs more observation.", alignment_score))
        }
    }
}

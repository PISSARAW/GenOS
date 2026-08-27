//! Ecological Succession mapped to multi-stage agent deployment.
//!
//! Biological mechanism: Ecosystems develop from barren land via Pioneer species
//! (fast, robust), which alter the environment to allow Intermediate species,
//! eventually reaching a stable Climax community (complex, specialized).
//! GenOS mapping: For a large task, the swarm deploys Pioneer agents (cheap models,
//! high temperature) to explore/index. Then Intermediate agents (builders).
//! Finally, Climax agents (expensive models, low temp) to polish and maintain.

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SuccessionStage {
    Barren,
    Pioneer,
    Intermediate,
    Climax,
}

#[derive(Debug, Clone)]
pub struct EcologicalSuccession {
    pub project_id: String,
    pub current_stage: SuccessionStage,
}

impl EcologicalSuccession {
    pub fn new(project_id: String) -> Self {
        Self {
            project_id,
            current_stage: SuccessionStage::Barren,
        }
    }

    /// Advances the succession stage based on completion metrics
    pub fn advance_succession(&mut self, coverage: f64, stability: f64) -> SuccessionStage {
        match self.current_stage {
            SuccessionStage::Barren => {
                // Immediately start pioneer phase
                self.current_stage = SuccessionStage::Pioneer;
            }
            SuccessionStage::Pioneer => {
                // Pioneers just need to explore/map (coverage > 0.6)
                if coverage > 0.6 {
                    self.current_stage = SuccessionStage::Intermediate;
                }
            }
            SuccessionStage::Intermediate => {
                // Intermediates build structure, need stability and high coverage
                if coverage > 0.9 && stability > 0.7 {
                    self.current_stage = SuccessionStage::Climax;
                }
            }
            SuccessionStage::Climax => {
                // Reached stable state
            }
        }
        self.current_stage.clone()
    }
}

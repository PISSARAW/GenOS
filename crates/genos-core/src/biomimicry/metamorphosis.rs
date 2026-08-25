//! Metamorphosis mapped to radical agent architecture transitions.
//!
//! Biological mechanism: Metamorphosis is a drastic structural change from one
//! life stage to another (e.g., larva to imago). The organism destroys obsolete
//! tissues and builds new ones for an entirely different ecological niche.
//! GenOS mapping: When an agent transitions from an Exploration/Training phase
//! to a Production/Serving phase, it undergoes a metamorphosis. It sheds heavy
//! learning tools and debug drives, and equips lean, hardened production tools,
//! while retaining its core identity and accumulated memories.

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LifeStage {
    Larval,
    Pupal,
    Imago,
}

#[derive(Debug, Clone)]
pub struct MetamorphosisEngine {
    pub agent_id: String,
    pub current_stage: LifeStage,
}

impl MetamorphosisEngine {
    pub fn new(agent_id: String, initial_stage: LifeStage) -> Self {
        Self { agent_id, current_stage: initial_stage }
    }

    /// Triggers the transition. In Pupal stage, the agent is inactive and
    /// undergoes structural replacement.
    pub fn trigger_transition(&mut self) -> Result<LifeStage, String> {
        match self.current_stage {
            LifeStage::Larval => {
                self.current_stage = LifeStage::Pupal;
                Ok(LifeStage::Pupal)
            }
            LifeStage::Pupal => {
                self.current_stage = LifeStage::Imago;
                Ok(LifeStage::Imago)
            }
            LifeStage::Imago => {
                Err("Agent is already in its final (Imago) stage.".to_string())
            }
        }
    }

    /// Evaluates which tools must be shed or acquired during the transition.
    /// In a real implementation, this references the genome's metamorphosis triggers.
    pub fn compute_tissue_changes(
        &self, 
        current_tools: &[String], 
        target_niche_tools: &[String]
    ) -> (Vec<String>, Vec<String>) {
        let current_set: std::collections::HashSet<_> = current_tools.iter().cloned().collect();
        let target_set: std::collections::HashSet<_> = target_niche_tools.iter().cloned().collect();

        let to_shed: Vec<String> = current_set.difference(&target_set).cloned().collect();
        let to_acquire: Vec<String> = target_set.difference(&current_set).cloned().collect();

        (to_shed, to_acquire)
    }
}

use crate::state::AgentState;
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BoundaryState {
    Pending,
    Committed,
    RolledBack,
}

/// Garantit l'isolation causale en encapsulant l'exécution de l'agent.
/// Permet le rejeu, le fork et le rollback en délimitant ce que l'agent peut modifier.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct CausalBoundary {
    pub boundary_id: String,

    /// Pour remonter l'arbre causal
    pub parent_boundary_id: Option<String>,

    /// État du monde avant l'IA (instantané)
    pub state_snapshot_before: Option<AgentState>,

    /// État du monde après l'IA (instantané)
    pub state_snapshot_after: Option<AgentState>,

    /// Historique ou trace des décisions prises dans cette frontière
    pub decisions_made: Vec<String>,

    pub status: BoundaryState,
}

impl CausalBoundary {
    pub fn new(boundary_id: String, parent_boundary_id: Option<String>) -> Self {
        Self {
            boundary_id,
            parent_boundary_id,
            state_snapshot_before: None,
            state_snapshot_after: None,
            decisions_made: Vec::new(),
            status: BoundaryState::Pending,
        }
    }

    /// Enregistre l'état initial avant l'exécution de la tâche.
    pub fn begin(&mut self, state: AgentState) {
        self.state_snapshot_before = Some(state);
        self.status = BoundaryState::Pending;
    }

    /// Enregistre l'état final après l'exécution réussie.
    pub fn commit(&mut self, state: AgentState) {
        self.state_snapshot_after = Some(state);
        self.status = BoundaryState::Committed;
    }

    /// Annule toutes les conséquences causales de cette boundary et renvoie l'état précédent.
    pub fn rollback(&mut self) -> Option<AgentState> {
        self.status = BoundaryState::RolledBack;
        self.state_snapshot_before.clone()
    }

    /// Crée une réalité alternative (Fork) à partir de cet instant précis.
    pub fn fork(&self, new_boundary_id: String) -> Self {
        CausalBoundary::new(new_boundary_id, Some(self.boundary_id.clone()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ids::{BranchId, GenomeId, WorldId};
    use crate::state::*;

    fn dummy_agent_state() -> AgentState {
        AgentState {
            genome: GenomeRef {
                genome_id: GenomeId::new(),
                version: "1".to_string(),
            },
            working_memory: WorkingMemory { items: vec![] },
            semantic_memory: SemanticMemory { refs: vec![] },
            episodic_memory: EpisodicMemory { refs: vec![] },
            memories: vec![],
            tool_outputs: vec![],
            beliefs: vec![],
            active_goals: vec![],
            world_id: WorldId::new(),
            event_cursor: EventCursor {
                branch_id: BranchId::new(),
                sequence: 0,
                last_event_id: None,
            },
            execution: ExecutionMetadata {
                step: 0,
                last_model_provider: None,
            },
            artifact_refs: vec![],
        }
    }

    #[test]
    fn test_causal_boundary_lifecycle() {
        let mut boundary = CausalBoundary::new("b1".to_string(), None);
        assert_eq!(boundary.status, BoundaryState::Pending);

        let initial_state = dummy_agent_state();
        boundary.begin(initial_state.clone());
        assert!(boundary.state_snapshot_before.is_some());

        let mut final_state = dummy_agent_state();
        final_state.execution.step = 1;
        boundary.commit(final_state);

        assert_eq!(boundary.status, BoundaryState::Committed);
        assert!(boundary.state_snapshot_after.is_some());

        // Test Rollback
        let restored_state = boundary.rollback().unwrap();
        assert_eq!(boundary.status, BoundaryState::RolledBack);
        assert_eq!(restored_state.execution.step, 0); // Should be the initial state
    }

    #[test]
    fn test_causal_boundary_fork() {
        let boundary = CausalBoundary::new("b1".to_string(), None);
        let fork = boundary.fork("b1_fork".to_string());

        assert_eq!(fork.boundary_id, "b1_fork");
        assert_eq!(fork.parent_boundary_id, Some("b1".to_string()));
    }
}

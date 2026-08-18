use crate::{AgentSnapshot, BranchId, CapsuleId, EventId, SnapshotId, WorldId};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RestorationMode {
    Snapshot,
    Reconstruct,
    External,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct RestorableComponent {
    pub name: String,
    pub mode: RestorationMode,
    pub digest: Option<String>,
    pub manifest: Option<String>,
    #[serde(default)]
    pub nondeterminism: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CapsuleLifecycle {
    Created,
    Running,
    Paused,
    Completed,
    Failed,
    Cancelled,
    BudgetExhausted,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct CapsuleBudget {
    pub steps_remaining: u64,
    pub duration_ms_remaining: Option<u64>,
    pub cost_remaining: Option<f64>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CapsuleRelation {
    Genesis,
    Fork,
    Checkpoint,
    Restore,
    Replay,
    Mutation,
    Merge,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct AgentWorldCapsule {
    pub capsule_id: CapsuleId,
    pub branch_id: BranchId,
    pub agent_snapshot: AgentSnapshot,
    pub world_snapshot_id: SnapshotId,
    pub live_world_id: Option<WorldId>,
    pub event_stream_id: String,
    pub components: Vec<RestorableComponent>,
    pub budget: CapsuleBudget,
    pub lifecycle: CapsuleLifecycle,
    pub parent_capsule: Option<CapsuleId>,
    pub relation: CapsuleRelation,
    pub created_at: DateTime<Utc>,
    pub checkpointed_at: DateTime<Utc>,
    pub integrity_digest: String,
}

impl AgentWorldCapsule {
    pub fn new(
        agent_snapshot: AgentSnapshot,
        world_snapshot_id: SnapshotId,
        live_world_id: Option<WorldId>,
        components: Vec<RestorableComponent>,
        parent_capsule: Option<CapsuleId>,
        relation: CapsuleRelation,
    ) -> Self {
        let now = Utc::now();
        let mut capsule = Self {
            capsule_id: CapsuleId::new(),
            branch_id: agent_snapshot.branch_id.clone(),
            event_stream_id: agent_snapshot.branch_id.0.clone(),
            budget: CapsuleBudget {
                steps_remaining: agent_snapshot.runtime_metadata.budget_steps_remaining,
                duration_ms_remaining: None,
                cost_remaining: None,
            },
            agent_snapshot,
            world_snapshot_id,
            live_world_id,
            components,
            lifecycle: CapsuleLifecycle::Created,
            parent_capsule,
            relation,
            created_at: now,
            checkpointed_at: now,
            integrity_digest: String::new(),
        };
        capsule.reseal();
        capsule
    }

    pub fn verify_integrity(&self) -> bool {
        self.integrity_digest == self.calculate_digest()
    }

    pub fn transition(&mut self, next: CapsuleLifecycle) -> Result<(), String> {
        let allowed = matches!(
            (&self.lifecycle, &next),
            (CapsuleLifecycle::Created, CapsuleLifecycle::Running)
                | (CapsuleLifecycle::Running, CapsuleLifecycle::Paused)
                | (CapsuleLifecycle::Paused, CapsuleLifecycle::Running)
                | (CapsuleLifecycle::Running, CapsuleLifecycle::Completed)
                | (CapsuleLifecycle::Running, CapsuleLifecycle::Failed)
                | (CapsuleLifecycle::Running, CapsuleLifecycle::Cancelled)
                | (CapsuleLifecycle::Running, CapsuleLifecycle::BudgetExhausted)
                | (CapsuleLifecycle::Paused, CapsuleLifecycle::Cancelled)
        );
        if !allowed {
            return Err(format!(
                "invalid capsule transition {:?} -> {:?}",
                self.lifecycle, next
            ));
        }
        self.lifecycle = next;
        self.checkpointed_at = Utc::now();
        self.reseal();
        Ok(())
    }

    pub fn checkpoint(&self, world_snapshot_id: SnapshotId) -> Self {
        let mut checkpoint = self.clone();
        checkpoint.capsule_id = CapsuleId::new();
        checkpoint.parent_capsule = Some(self.capsule_id.clone());
        checkpoint.relation = CapsuleRelation::Checkpoint;
        checkpoint.world_snapshot_id = world_snapshot_id;
        checkpoint.checkpointed_at = Utc::now();
        checkpoint.reseal();
        checkpoint
    }

    /// Consume one bounded execution step while preserving the capsule's
    /// integrity seal. A running capsule with no remaining steps cannot run.
    pub fn consume_step(&mut self, event_id: EventId) -> Result<(), String> {
        if self.lifecycle != CapsuleLifecycle::Running {
            return Err(format!(
                "only a running capsule can consume a step (current: {:?})",
                self.lifecycle
            ));
        }
        if self.budget.steps_remaining == 0 {
            return Err("capsule execution budget is exhausted".to_string());
        }
        self.budget.steps_remaining -= 1;
        self.agent_snapshot.runtime_metadata.budget_steps_remaining = self.budget.steps_remaining;
        self.agent_snapshot.state.execution.step += 1;
        self.agent_snapshot.state.event_cursor.sequence += 1;
        self.agent_snapshot.state.event_cursor.last_event_id = Some(event_id);
        self.checkpointed_at = Utc::now();
        self.reseal();
        Ok(())
    }

    fn reseal(&mut self) {
        self.integrity_digest = self.calculate_digest();
    }

    fn calculate_digest(&self) -> String {
        let payload = serde_json::json!({
            "capsule_id": self.capsule_id,
            "branch_id": self.branch_id,
            "agent_snapshot": self.agent_snapshot,
            "world_snapshot_id": self.world_snapshot_id,
            "live_world_id": self.live_world_id,
            "event_stream_id": self.event_stream_id,
            "components": self.components,
            "budget": self.budget,
            "lifecycle": self.lifecycle,
            "parent_capsule": self.parent_capsule,
            "relation": self.relation,
            "created_at": self.created_at,
            "checkpointed_at": self.checkpointed_at,
        });
        format!(
            "sha256:{:x}",
            Sha256::digest(serde_json::to_vec(&payload).expect("capsule must serialize"))
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn capsule_lifecycle_is_checked_and_resealed() {
        let snapshot = crate::snapshot::tests::parent_snapshot(0);
        let mut capsule = AgentWorldCapsule::new(
            snapshot,
            SnapshotId::new(),
            None,
            vec![],
            None,
            CapsuleRelation::Genesis,
        );
        let original = capsule.integrity_digest.clone();
        capsule.transition(CapsuleLifecycle::Running).unwrap();
        capsule.transition(CapsuleLifecycle::Paused).unwrap();
        assert!(capsule.verify_integrity());
        assert_ne!(capsule.integrity_digest, original);
        assert!(capsule.transition(CapsuleLifecycle::Completed).is_err());
    }

    #[test]
    fn capsule_step_budget_is_consumed_and_resealed() {
        let mut snapshot = crate::snapshot::tests::parent_snapshot(0);
        snapshot.runtime_metadata.budget_steps_remaining = 2;
        let mut capsule = AgentWorldCapsule::new(
            snapshot,
            SnapshotId::new(),
            None,
            vec![],
            None,
            CapsuleRelation::Genesis,
        );
        capsule.transition(CapsuleLifecycle::Running).unwrap();
        let before = capsule.budget.steps_remaining;
        let event_id = EventId::new();
        capsule.consume_step(event_id.clone()).unwrap();
        assert_eq!(capsule.budget.steps_remaining, before - 1);
        assert_eq!(
            capsule
                .agent_snapshot
                .runtime_metadata
                .budget_steps_remaining,
            before - 1
        );
        assert_eq!(capsule.agent_snapshot.state.execution.step, 1);
        assert_eq!(capsule.agent_snapshot.state.event_cursor.sequence, 1);
        assert_eq!(
            capsule.agent_snapshot.state.event_cursor.last_event_id,
            Some(event_id)
        );
        assert!(capsule.verify_integrity());
    }
}

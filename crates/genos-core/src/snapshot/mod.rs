pub mod checkpoint;
pub mod compare;
pub mod fork;
pub mod restore;

#[cfg(test)]
pub(crate) mod tests;

#[cfg(test)]
#[path = "../snapshot_restore_tests.rs"]
mod snapshot_restore_tests;

#[cfg(test)]
#[path = "../snapshot_checkpoint_tests.rs"]
mod snapshot_checkpoint_tests;

pub use checkpoint::*;
pub use compare::*;
pub use fork::*;
pub use restore::*;

use crate::ids::{AgentId, BranchId, SnapshotId, WorldId};
use crate::{AgentGenome, AgentState};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Snapshot fields that carry logical state, i.e. everything a fork inherits
/// unchanged from its parent. Identity fields (`snapshot_id`, `agent_id`,
/// `branch_id`, `state.event_cursor.branch_id`) and `created_at` are excluded on
/// purpose: two sibling forks must differ there.
pub const LOGICAL_STATE_FIELDS: [&str; 16] = [
    "genome",
    "state.genome",
    "state.working_memory",
    "state.semantic_memory",
    "state.episodic_memory",
    "state.memories",
    "state.beliefs",
    "state.active_goals",
    "state.world_id",
    "state.event_cursor.sequence",
    "state.event_cursor.last_event_id",
    "state.execution",
    "state.artifact_refs",
    "world_id",
    "tool_state",
    "runtime_metadata",
];

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct RuntimeMetadata {
    pub runtime_version: String,
    pub budget_steps_remaining: u64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ToolState {
    pub active_tools: Vec<String>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct BranchMetadata {
    pub label: Option<String>,
    pub hypothesis: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct AgentSnapshot {
    pub snapshot_id: SnapshotId,
    pub agent_id: AgentId,
    pub branch_id: BranchId,
    #[serde(default)]
    pub branch_metadata: BranchMetadata,
    pub genome: AgentGenome,
    pub state: AgentState,
    pub world_id: WorldId,
    pub tool_state: ToolState,
    pub runtime_metadata: RuntimeMetadata,
    pub created_at: DateTime<Utc>,
}

impl AgentSnapshot {
    /// Applies epigenetic modulators to the base genome drives based on current state.
    pub fn active_drives(&self) -> std::collections::BTreeMap<String, f32> {
        let mut current_drives = self.genome.cognition.clone_drives();

        for regulator in &self.genome.cognition.regulators {
            if crate::epigenetics::evaluate_condition(&regulator.condition, &self.state) {
                if let Some(val) = current_drives.get_mut(&regulator.modulated_drive) {
                    *val = (*val + regulator.modulation_offset).clamp(0.0, 1.0);
                }
            }
        }

        current_drives
    }
}

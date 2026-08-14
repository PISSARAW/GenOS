use crate::ids::{AgentId, BranchId, SnapshotId, WorldId};
use crate::{AgentGenome, AgentState};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct RuntimeMetadata {
    pub runtime_version: String,
    pub budget_steps_remaining: u64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ToolState {
    pub active_tools: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct AgentSnapshot {
    pub snapshot_id: SnapshotId,
    pub agent_id: AgentId,
    pub branch_id: BranchId,
    pub genome: AgentGenome,
    pub state: AgentState,
    pub world_id: WorldId,
    pub tool_state: ToolState,
    pub runtime_metadata: RuntimeMetadata,
    pub created_at: DateTime<Utc>,
}

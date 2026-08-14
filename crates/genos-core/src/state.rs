use crate::artifact::ArtifactRef;
use crate::ids::{BeliefId, BranchId, EventId, MemoryId, WorldId};
use crate::ids::GenomeId;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct GenomeRef {
    pub genome_id: GenomeId,
    pub version: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct WorkingMemoryItem {
    pub key: String,
    pub value: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct WorkingMemory {
    pub items: Vec<WorkingMemoryItem>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct SemanticMemory {
    pub refs: Vec<MemoryId>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct EpisodicMemory {
    pub refs: Vec<MemoryId>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Goal {
    pub key: String,
    pub description: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct EventCursor {
    pub branch_id: BranchId,
    pub sequence: u64,
    pub last_event_id: Option<EventId>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BeliefStatus {
    Observation,
    Hypothesis,
    Inferred,
    Verified,
    Disputed,
    Rejected,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Belief {
    pub id: BeliefId,
    pub subject: String,
    pub predicate: String,
    pub object_value: String,
    pub confidence: f32,
    pub status: BeliefStatus,
    pub evidence: Vec<String>,
    pub contradicts: Vec<BeliefId>,
    pub created_in: BranchId,
    pub created_at: DateTime<Utc>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ExecutionMetadata {
    pub step: u64,
    pub last_model_provider: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct AgentState {
    pub genome: GenomeRef,
    pub working_memory: WorkingMemory,
    pub semantic_memory: SemanticMemory,
    pub episodic_memory: EpisodicMemory,
    pub beliefs: Vec<Belief>,
    pub active_goals: Vec<Goal>,
    pub world_id: WorldId,
    pub event_cursor: EventCursor,
    pub execution: ExecutionMetadata,
    pub artifact_refs: Vec<ArtifactRef>,
}

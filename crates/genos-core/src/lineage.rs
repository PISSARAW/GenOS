use crate::ids::SnapshotId;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum LineageRelation {
    Fork,
    Restore,
    Replay,
    Mutation,
    Import,
    Merge,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct LineageEdge {
    pub parent_snapshot: SnapshotId,
    pub child_snapshot: SnapshotId,
    pub relation: LineageRelation,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub metadata: serde_json::Value,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct LineageDag {
    pub edges: Vec<LineageEdge>,
}

impl LineageDag {
    pub fn parents_of(&self, snapshot: &SnapshotId) -> Vec<&SnapshotId> {
        self.edges
            .iter()
            .filter(|e| &e.child_snapshot == snapshot)
            .map(|e| &e.parent_snapshot)
            .collect()
    }

    pub fn children_of(&self, snapshot: &SnapshotId) -> Vec<&SnapshotId> {
        self.edges
            .iter()
            .filter(|e| &e.parent_snapshot == snapshot)
            .map(|e| &e.child_snapshot)
            .collect()
    }
}

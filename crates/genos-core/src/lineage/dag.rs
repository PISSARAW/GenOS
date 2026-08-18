use crate::events::{AgentEvent, AgentEventType};
use crate::ids::SnapshotId;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, HashSet, VecDeque};

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
    pub created_at: DateTime<Utc>,
    pub metadata: Value,
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

    /// Find the closest shared ancestor of two snapshots. For a DAG, ties are
    /// resolved deterministically by the combined parent distance, then id.
    pub fn nearest_common_ancestor(
        &self,
        left: &SnapshotId,
        right: &SnapshotId,
    ) -> Option<SnapshotId> {
        let left_ancestors = self.ancestor_distances(left);
        let right_ancestors = self.ancestor_distances(right);

        left_ancestors
            .iter()
            .filter_map(|(candidate, left_distance)| {
                right_ancestors.get(candidate).map(|right_distance| {
                    (
                        candidate.clone(),
                        (*left_distance).max(*right_distance),
                        left_distance + right_distance,
                    )
                })
            })
            .min_by(|a, b| a.1.cmp(&b.1).then(a.2.cmp(&b.2)).then(a.0 .0.cmp(&b.0 .0)))
            .map(|(candidate, _, _)| candidate)
    }

    fn ancestor_distances(&self, start: &SnapshotId) -> HashMap<SnapshotId, u64> {
        let mut distances = HashMap::new();
        let mut queue = VecDeque::from([(start.clone(), 0)]);
        while let Some((snapshot, distance)) = queue.pop_front() {
            if distances.insert(snapshot.clone(), distance).is_some() {
                continue;
            }
            for parent in self.parents_of(&snapshot) {
                queue.push_back((parent.clone(), distance + 1));
            }
        }
        distances
    }

    /// Pick a snapshot with no parents in the dag (a root). On ties,
    /// pick the one whose earliest outgoing edge has the smallest
    /// `created_at`. Returns `None` when the dag is empty.
    pub fn auto_root(&self) -> Option<SnapshotId> {
        let child_set: HashSet<&SnapshotId> =
            self.edges.iter().map(|e| &e.child_snapshot).collect();
        let mut candidates: Vec<&SnapshotId> = self
            .edges
            .iter()
            .map(|e| &e.parent_snapshot)
            .filter(|p| !child_set.contains(p))
            .collect();
        candidates.sort_by_key(|p| {
            self.edges
                .iter()
                .find(|e| &e.parent_snapshot == *p)
                .map(|e| e.created_at)
                .unwrap_or_else(Utc::now)
        });
        candidates.first().map(|p| (*p).clone())
    }
}

/// Fold a stream of [`AgentEvent`]s into a [`LineageDag`].
pub fn build_lineage_dag(events: &[AgentEvent]) -> LineageDag {
    let mut edges: Vec<LineageEdge> = Vec::new();
    for event in events {
        let payload = &event.payload;
        match event.event_type {
            AgentEventType::SnapshotCreated => {
                if let Some((parent, child)) =
                    read_parent_child(payload, "parent_snapshot_id", "child_snapshot_id")
                {
                    edges.push(LineageEdge {
                        parent_snapshot: parent,
                        child_snapshot: child,
                        relation: LineageRelation::Mutation,
                        created_at: event.timestamp,
                        metadata: payload.clone(),
                    });
                }
            }
            AgentEventType::Restored => {
                if let Some((source, target)) =
                    read_parent_child(payload, "source_snapshot_id", "target_snapshot_id")
                {
                    edges.push(LineageEdge {
                        parent_snapshot: source,
                        child_snapshot: target,
                        relation: LineageRelation::Restore,
                        created_at: event.timestamp,
                        metadata: payload.clone(),
                    });
                }
            }
            AgentEventType::ForkCreated => {
                if let Some((parent, fork)) =
                    read_parent_child(payload, "parent_snapshot_id", "fork_snapshot_id")
                {
                    edges.push(LineageEdge {
                        parent_snapshot: parent,
                        child_snapshot: fork,
                        relation: LineageRelation::Fork,
                        created_at: event.timestamp,
                        metadata: payload.clone(),
                    });
                }
            }
            _ => {}
        }
    }
    LineageDag { edges }
}

fn read_parent_child(
    payload: &Value,
    parent_key: &str,
    child_key: &str,
) -> Option<(SnapshotId, SnapshotId)> {
    let parent = payload.get(parent_key).and_then(|v| v.as_str())?;
    let child = payload.get(child_key).and_then(|v| v.as_str())?;
    Some((
        SnapshotId(parent.to_string()),
        SnapshotId(child.to_string()),
    ))
}

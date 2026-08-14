use crate::events::{AgentEvent, AgentEventType};
use crate::ids::{BranchId, SnapshotId};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, VecDeque};

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
            .min_by(|a, b| a.1.cmp(&b.1).then(a.2.cmp(&b.2)).then(a.0.0.cmp(&b.0.0)))
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
}

/// Fold a stream of [`AgentEvent`]s into a [`LineageDag`].
///
/// Recognised event types:
/// - `SnapshotCreated` (emitted by [`crate::snapshot::checkpoint_snapshot`])
///   carries `parent_snapshot_id` and `child_snapshot_id`; rendered as a
///   `Mutation` edge.
/// - `Restored` (emitted by [`crate::snapshot::restore_snapshot`]) carries
///   `source_snapshot_id` and `target_snapshot_id`; rendered as a
///   `Restore` edge.
/// - `ForkCreated` (emitted by `agent fork-from-snapshot`) carries
///   `parent_snapshot_id` and `fork_snapshot_id`; rendered as a `Fork`
///   edge.
///
/// Events with missing payload fields are silently skipped — the dag is
/// a best-effort reconstruction from the audit trail.
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

/// Tree node the `snapshot lineage` command renders, mirroring the
/// data shape of [`crate::beliefs::provenance::ProvenanceNode`].
#[derive(Clone, Debug, Serialize)]
pub struct LineageNode {
    pub snapshot_id: String,
    /// Short label (first 8 chars of the snapshot id) by default.
    pub label: String,
    pub branch_id: Option<String>,
    pub created_at: DateTime<Utc>,
    pub children: Vec<LineageChild>,
}

/// Edge-attached child in a [`LineageNode`]. Carries the relation label
/// so the renderer can show `mutation` / `fork` / `restore` next to the
/// connector.
#[derive(Clone, Debug, Serialize)]
pub struct LineageChild {
    pub snapshot_id: String,
    pub relation: String,
    pub label: String,
    pub created_at: DateTime<Utc>,
    pub children: Vec<LineageChild>,
}

impl LineageDag {
    /// Build a sub-tree rooted at `root`. Children are sorted by
    /// connecting-edge `created_at` (oldest first), ties broken by
    /// `child_snapshot` for determinism.
    ///
    /// **Multiple incoming edges**: when the same child has more than
    /// one parent in the dag (e.g. a checkpoint-minted child later
    /// rewound by a restore), the child is anchored under the *earliest*
    /// parent by `created_at`. The later edge remains on the dag as an
    /// audit-trail note but doesn't re-parent the child in the rendered
    /// tree. This matches chronological intuition: a snapshot's origin
    /// is the edge that minted it, not the one that rewound it.
    pub fn tree_at(&self, root: &SnapshotId) -> LineageNode {
        let earliest = self
            .edges
            .iter()
            .filter(|e| &e.parent_snapshot == root)
            .map(|e| e.created_at)
            .min()
            .unwrap_or_else(Utc::now);
        let children = self.build_children(root);
        LineageNode {
            snapshot_id: root.0.clone(),
            label: short_id(&root.0),
            branch_id: None,
            created_at: earliest,
            children,
        }
    }

    fn build_children(&self, parent: &SnapshotId) -> Vec<LineageChild> {
        // Edges are pre-grouped by child so we know which parent each
        // child was "first anchored under" — i.e. the earliest edge
        // whose child_snapshot is the same id. Children whose earliest
        // incoming edge is *not* from `parent` are re-parented away and
        // get skipped here; they'll appear under their earliest parent
        // instead.
        let earliest_parent = earliest_parent_index(&self.edges);
        let mut out: Vec<(LineageChild, DateTime<Utc>)> = self
            .edges
            .iter()
            .filter(|e| &e.parent_snapshot == parent)
            .filter(|e| earliest_parent.get(&e.child_snapshot) == Some(&e.parent_snapshot))
            .map(|e| {
                let child = LineageChild {
                    snapshot_id: e.child_snapshot.0.clone(),
                    relation: relation_label(&e.relation).to_string(),
                    label: short_id(&e.child_snapshot.0),
                    created_at: e.created_at,
                    children: self.build_children(&e.child_snapshot),
                };
                (child, e.created_at)
            })
            .collect();
        out.sort_by(|a, b| {
            a.1.cmp(&b.1)
                .then_with(|| a.0.snapshot_id.cmp(&b.0.snapshot_id))
        });
        out.into_iter().map(|(c, _)| c).collect()
    }

    /// Pick a snapshot with no parents in the dag (a root). On ties,
    /// pick the one whose earliest outgoing edge has the smallest
    /// `created_at`. Returns `None` when the dag is empty.
    pub fn auto_root(&self) -> Option<SnapshotId> {
        let child_set: std::collections::HashSet<&SnapshotId> =
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

fn relation_label(relation: &LineageRelation) -> &'static str {
    match relation {
        LineageRelation::Fork => "fork",
        LineageRelation::Restore => "restore",
        LineageRelation::Replay => "replay",
        LineageRelation::Mutation => "mutation",
        LineageRelation::Import => "import",
        LineageRelation::Merge => "merge",
    }
}

fn short_id(id: &str) -> String {
    id.chars().take(8).collect()
}

/// Build a map: child_snapshot -> the parent_snapshot of its earliest
/// incoming edge. The tree builder uses this to decide which parent
/// "owns" a child when the dag has multiple incoming edges to the same
/// node.
fn earliest_parent_index(
    edges: &[LineageEdge],
) -> std::collections::HashMap<SnapshotId, SnapshotId> {
    let mut index: std::collections::HashMap<SnapshotId, SnapshotId> =
        std::collections::HashMap::new();
    for edge in edges {
        match index.get(&edge.child_snapshot) {
            None => {
                index.insert(edge.child_snapshot.clone(), edge.parent_snapshot.clone());
            }
            Some(existing_parent) => {
                // Find the existing edge's created_at. We don't have the
                // edge here, only the parent id, so a linear scan is
                // fine for the shallow dags we render.
                let existing_ts = edges
                    .iter()
                    .find(|e| {
                        e.child_snapshot == edge.child_snapshot
                            && &e.parent_snapshot == existing_parent
                    })
                    .map(|e| e.created_at);
                if existing_ts.is_none_or(|t| edge.created_at < t) {
                    index.insert(edge.child_snapshot.clone(), edge.parent_snapshot.clone());
                }
            }
        }
    }
    index
}

// Pull in `BranchId` so the unused-import lint stays quiet on crates
// that disable `dead_code` for it through the lineage re-export path.
const _: fn() = || {
    let _ = BranchId::new;
};

#[cfg(test)]
mod tests {
    use super::*;
    use crate::events::{AgentEvent, AgentEventType};
    use crate::ids::{AgentId, BranchId, EventId};
    use serde_json::json;

    fn evt(
        event_type: AgentEventType,
        payload: Value,
        ts_secs: i64,
        branch_id: BranchId,
    ) -> AgentEvent {
        AgentEvent {
            event_id: EventId::new(),
            agent_id: AgentId::new(),
            branch_id: Some(branch_id),
            sequence: 1,
            timestamp: DateTime::<Utc>::from_timestamp(ts_secs, 0).unwrap(),
            event_type,
            payload,
            causation_id: None,
            correlation_id: None,
        }
    }

    #[test]
    fn build_lineage_dag_extracts_all_three_edge_types() {
        let branch = BranchId::new();
        let events = vec![
            evt(
                AgentEventType::SnapshotCreated,
                json!({
                    "parent_snapshot_id": "snap-0",
                    "child_snapshot_id": "snap-1",
                }),
                100,
                branch.clone(),
            ),
            evt(
                AgentEventType::ForkCreated,
                json!({
                    "parent_snapshot_id": "snap-1",
                    "fork_snapshot_id": "snap-x1",
                    "fork_index": 0,
                }),
                200,
                branch.clone(),
            ),
            evt(
                AgentEventType::Restored,
                json!({
                    "source_snapshot_id": "snap-1",
                    "target_snapshot_id": "snap-3",
                }),
                300,
                branch,
            ),
        ];

        let dag = build_lineage_dag(&events);
        assert_eq!(dag.edges.len(), 3);

        let mut relations: Vec<(&str, &str, &str)> = dag
            .edges
            .iter()
            .map(|e| {
                (
                    match e.relation {
                        LineageRelation::Mutation => "M",
                        LineageRelation::Fork => "F",
                        LineageRelation::Restore => "R",
                        _ => "?",
                    },
                    e.parent_snapshot.0.as_str(),
                    e.child_snapshot.0.as_str(),
                )
            })
            .collect();
        relations.sort();
        assert_eq!(
            relations,
            vec![
                ("F", "snap-1", "snap-x1"),
                ("M", "snap-0", "snap-1"),
                ("R", "snap-1", "snap-3")
            ]
        );
    }

    #[test]
    fn manual_recursive_forks_render_at_multiple_lineage_levels() {
        let branch = BranchId::new();
        let events = vec![
            evt(AgentEventType::ForkCreated, json!({
                "parent_snapshot_id": "S0", "fork_snapshot_id": "A"
            }), 100, branch.clone()),
            evt(AgentEventType::ForkCreated, json!({
                "parent_snapshot_id": "S0", "fork_snapshot_id": "B"
            }), 200, branch.clone()),
            evt(AgentEventType::ForkCreated, json!({
                "parent_snapshot_id": "A", "fork_snapshot_id": "A1"
            }), 300, branch.clone()),
            evt(AgentEventType::ForkCreated, json!({
                "parent_snapshot_id": "A", "fork_snapshot_id": "A2"
            }), 400, branch),
        ];

        let dag = build_lineage_dag(&events);
        let tree = dag.tree_at(&SnapshotId("S0".to_string()));
        let a = tree.children.iter().find(|child| child.snapshot_id == "A").unwrap();
        assert_eq!(tree.children.len(), 2);
        assert_eq!(a.children.iter().map(|child| child.snapshot_id.as_str()).collect::<Vec<_>>(), vec!["A1", "A2"]);
        assert!(tree.children.iter().any(|child| child.snapshot_id == "B"));
    }

    #[test]
    fn nearest_common_ancestor_finds_a_for_a1x_and_a2() {
        let branch = BranchId::new();
        let events = vec![
            evt(AgentEventType::ForkCreated, json!({
                "parent_snapshot_id": "S0", "fork_snapshot_id": "A"
            }), 100, branch.clone()),
            evt(AgentEventType::ForkCreated, json!({
                "parent_snapshot_id": "A", "fork_snapshot_id": "A1"
            }), 200, branch.clone()),
            evt(AgentEventType::ForkCreated, json!({
                "parent_snapshot_id": "A1", "fork_snapshot_id": "A1x"
            }), 300, branch.clone()),
            evt(AgentEventType::ForkCreated, json!({
                "parent_snapshot_id": "A", "fork_snapshot_id": "A2"
            }), 400, branch),
        ];
        let dag = build_lineage_dag(&events);

        assert_eq!(
            dag.nearest_common_ancestor(
                &SnapshotId("A1x".to_string()),
                &SnapshotId("A2".to_string()),
            ),
            Some(SnapshotId("A".to_string()))
        );
    }

    #[test]
    fn build_lineage_dag_ignores_unrelated_event_types() {
        let branch = BranchId::new();
        let events = vec![
            evt(
                AgentEventType::ModelResponded,
                json!({ "irrelevant": true }),
                100,
                branch.clone(),
            ),
            evt(
                AgentEventType::SnapshotCreated,
                json!({
                    "parent_snapshot_id": "snap-0",
                    "child_snapshot_id": "snap-1",
                }),
                200,
                branch,
            ),
        ];

        let dag = build_lineage_dag(&events);
        assert_eq!(dag.edges.len(), 1);
        assert_eq!(dag.edges[0].relation, LineageRelation::Mutation);
    }

    #[test]
    fn build_lineage_dag_skips_events_with_missing_payload_fields() {
        let branch = BranchId::new();
        let events = vec![evt(
            AgentEventType::SnapshotCreated,
            json!({ "parent_snapshot_id": "snap-0" }),
            100,
            branch,
        )];

        let dag = build_lineage_dag(&events);
        assert!(dag.edges.is_empty());
    }

    #[test]
    fn tree_at_root_renders_two_children_under_s1() {
        let branch = BranchId::new();
        // The demo's five edges: S0->S1 mutation, S1->S2 mutation,
        // S2->S3 mutation, S1->X1 fork, S1->S3 restore.
        let events = vec![
            evt(
                AgentEventType::SnapshotCreated,
                json!({"parent_snapshot_id": "s0", "child_snapshot_id": "s1"}),
                100,
                branch.clone(),
            ),
            evt(
                AgentEventType::SnapshotCreated,
                json!({"parent_snapshot_id": "s1", "child_snapshot_id": "s2"}),
                200,
                branch.clone(),
            ),
            evt(
                AgentEventType::SnapshotCreated,
                json!({"parent_snapshot_id": "s2", "child_snapshot_id": "s3"}),
                300,
                branch.clone(),
            ),
            evt(
                AgentEventType::ForkCreated,
                json!({"parent_snapshot_id": "s1", "fork_snapshot_id": "x1"}),
                400,
                branch.clone(),
            ),
            evt(
                AgentEventType::Restored,
                json!({"source_snapshot_id": "s1", "target_snapshot_id": "s3"}),
                500,
                branch,
            ),
        ];

        let dag = build_lineage_dag(&events);
        let tree = dag.tree_at(&SnapshotId("s0".to_string()));

        assert_eq!(tree.snapshot_id, "s0");
        assert_eq!(tree.children.len(), 1);
        let s1 = &tree.children[0];
        assert_eq!(s1.snapshot_id, "s1");
        assert_eq!(s1.relation, "mutation");
        assert_eq!(s1.children.len(), 2);
        // Children of S1, sorted by edge created_at: S2 (mutation, ts=200)
        // before X1 (fork, ts=400). The restore edge to S3 is anchored
        // under S2 because that's the earlier parent.
        assert_eq!(s1.children[0].snapshot_id, "s2");
        assert_eq!(s1.children[0].relation, "mutation");
        assert_eq!(s1.children[1].snapshot_id, "x1");
        assert_eq!(s1.children[1].relation, "fork");

        let s2 = &s1.children[0];
        assert_eq!(s2.children.len(), 1);
        assert_eq!(s2.children[0].snapshot_id, "s3");
        assert_eq!(s2.children[0].relation, "mutation");

        // The fork X1 has no children.
        let x1 = &s1.children[1];
        assert!(x1.children.is_empty());

        // S3 (leaf) has no children.
        let s3 = &s2.children[0];
        assert!(s3.children.is_empty());
    }

    #[test]
    fn tree_at_middle_node_anchor_excludes_parents() {
        let branch = BranchId::new();
        let events = vec![
            evt(
                AgentEventType::SnapshotCreated,
                json!({"parent_snapshot_id": "s0", "child_snapshot_id": "s1"}),
                100,
                branch.clone(),
            ),
            evt(
                AgentEventType::SnapshotCreated,
                json!({"parent_snapshot_id": "s1", "child_snapshot_id": "s2"}),
                200,
                branch,
            ),
        ];
        let dag = build_lineage_dag(&events);

        let tree = dag.tree_at(&SnapshotId("s1".to_string()));
        assert_eq!(tree.snapshot_id, "s1");
        // S0 must not appear anywhere in the sub-tree.
        fn no_s0(node: &LineageNode) -> bool {
            if node.snapshot_id == "s0" {
                return false;
            }
            node.children.iter().all(no_s0_child)
        }
        fn no_s0_child(node: &LineageChild) -> bool {
            if node.snapshot_id == "s0" {
                return false;
            }
            node.children.iter().all(no_s0_child)
        }
        assert!(no_s0(&tree));
    }

    #[test]
    fn tree_at_handles_no_edges_with_single_root() {
        let dag = LineageDag::default();
        let tree = dag.tree_at(&SnapshotId("only".to_string()));
        assert_eq!(tree.snapshot_id, "only");
        assert!(tree.children.is_empty());
    }

    #[test]
    fn auto_root_returns_unique_parentless_node() {
        let branch = BranchId::new();
        let events = vec![
            evt(
                AgentEventType::SnapshotCreated,
                json!({"parent_snapshot_id": "s0", "child_snapshot_id": "s1"}),
                100,
                branch.clone(),
            ),
            evt(
                AgentEventType::ForkCreated,
                json!({"parent_snapshot_id": "s1", "fork_snapshot_id": "x1"}),
                200,
                branch,
            ),
        ];
        let dag = build_lineage_dag(&events);
        assert_eq!(dag.auto_root(), Some(SnapshotId("s0".to_string())));
    }

    #[test]
    fn auto_root_returns_none_on_empty_dag() {
        let dag = LineageDag::default();
        assert!(dag.auto_root().is_none());
    }
}

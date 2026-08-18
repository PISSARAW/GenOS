use crate::ids::SnapshotId;
use crate::lineage::dag::{LineageDag, LineageEdge, LineageRelation};
use chrono::{DateTime, Utc};
use serde::Serialize;
use std::collections::HashMap;

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
}

pub fn relation_label(relation: &LineageRelation) -> &'static str {
    match relation {
        LineageRelation::Fork => "fork",
        LineageRelation::Restore => "restore",
        LineageRelation::Replay => "replay",
        LineageRelation::Mutation => "mutation",
        LineageRelation::Import => "import",
        LineageRelation::Merge => "merge",
    }
}

pub fn short_id(id: &str) -> String {
    id.chars().take(8).collect()
}

/// Build a map: child_snapshot -> the parent_snapshot of its earliest
/// incoming edge.
pub fn earliest_parent_index(
    edges: &[LineageEdge],
) -> HashMap<SnapshotId, SnapshotId> {
    let mut index: HashMap<SnapshotId, SnapshotId> = HashMap::new();
    for edge in edges {
        match index.get(&edge.child_snapshot) {
            None => {
                index.insert(edge.child_snapshot.clone(), edge.parent_snapshot.clone());
            }
            Some(existing_parent) => {
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

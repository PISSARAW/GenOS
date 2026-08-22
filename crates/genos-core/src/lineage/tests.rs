use super::*;
use crate::events::{AgentEvent, AgentEventType};
use crate::ids::{AgentId, BranchId, EventId, SnapshotId};
use chrono::{DateTime, Utc};
use serde_json::{json, Value};

#[allow(clippy::too_many_arguments)]
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
        evt(
            AgentEventType::ForkCreated,
            json!({
                "parent_snapshot_id": "S0", "fork_snapshot_id": "A"
            }),
            100,
            branch.clone(),
        ),
        evt(
            AgentEventType::ForkCreated,
            json!({
                "parent_snapshot_id": "S0", "fork_snapshot_id": "B"
            }),
            200,
            branch.clone(),
        ),
        evt(
            AgentEventType::ForkCreated,
            json!({
                "parent_snapshot_id": "A", "fork_snapshot_id": "A1"
            }),
            300,
            branch.clone(),
        ),
        evt(
            AgentEventType::ForkCreated,
            json!({
                "parent_snapshot_id": "A", "fork_snapshot_id": "A2"
            }),
            400,
            branch,
        ),
    ];

    let dag = build_lineage_dag(&events);
    let tree = dag.tree_at(&SnapshotId("S0".to_string()));
    let a = tree
        .children
        .iter()
        .find(|child| child.snapshot_id == "A")
        .unwrap();
    assert_eq!(tree.children.len(), 2);
    assert_eq!(
        a.children
            .iter()
            .map(|child| child.snapshot_id.as_str())
            .collect::<Vec<_>>(),
        vec!["A1", "A2"]
    );
    assert!(tree.children.iter().any(|child| child.snapshot_id == "B"));
}

#[test]
fn nearest_common_ancestor_finds_a_for_a1x_and_a2() {
    let branch = BranchId::new();
    let events = vec![
        evt(
            AgentEventType::ForkCreated,
            json!({
                "parent_snapshot_id": "S0", "fork_snapshot_id": "A"
            }),
            100,
            branch.clone(),
        ),
        evt(
            AgentEventType::ForkCreated,
            json!({
                "parent_snapshot_id": "A", "fork_snapshot_id": "A1"
            }),
            200,
            branch.clone(),
        ),
        evt(
            AgentEventType::ForkCreated,
            json!({
                "parent_snapshot_id": "A1", "fork_snapshot_id": "A1x"
            }),
            300,
            branch.clone(),
        ),
        evt(
            AgentEventType::ForkCreated,
            json!({
                "parent_snapshot_id": "A", "fork_snapshot_id": "A2"
            }),
            400,
            branch,
        ),
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
    assert_eq!(s1.children[0].snapshot_id, "s2");
    assert_eq!(s1.children[0].relation, "mutation");
    assert_eq!(s1.children[1].snapshot_id, "x1");
    assert_eq!(s1.children[1].relation, "fork");

    let s2 = &s1.children[0];
    assert_eq!(s2.children.len(), 1);
    assert_eq!(s2.children[0].snapshot_id, "s3");
    assert_eq!(s2.children[0].relation, "mutation");

    let x1 = &s1.children[1];
    assert!(x1.children.is_empty());

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

//! Snapshot-only output structs. Split out of `output.rs` so that file
//! stays under the 400-line ceiling as the snapshot subcommand set grows.

use genos_core::{AgentSnapshot, LineageNode};
use serde::Serialize;

#[derive(Serialize)]
pub struct SnapshotSaveOutput {
    pub store_path: String,
    pub snapshot_id: String,
}

#[derive(Serialize)]
pub struct SnapshotRestoreOutput {
    /// The rewound snapshot's id (same as the target's, since restore
    /// preserves identity).
    pub target_snapshot_id: String,
    pub agent_id: String,
    pub branch_id: String,
    /// The saved snapshot's id (the one whose state was copied onto the
    /// target).
    pub source_snapshot_id: String,
    /// Names of the [`LOGICAL_STATE_FIELDS`] that actually differed between
    /// target and source before the restore — i.e. the fields the restore
    /// rewrote. Empty when target and source were already identical.
    pub restored_fields: Vec<String>,
    /// `restored` event id, when `--emit-events` was passed.
    pub event_id: Option<String>,
    /// Sequence of the `restored` event on the branch (target's previous
    /// cursor + 1).
    pub event_sequence: u64,
    /// Cursor sequence on the target *before* the restore — useful for
    /// the demo's `last_sequence = N + 1` assertion.
    pub previous_sequence: u64,
    pub out_path: Option<String>,
    pub snapshot_store_path: Option<String>,
    pub event_store_path: Option<String>,
}

#[derive(Serialize)]
pub struct SnapshotGetOutput {
    pub store_path: String,
    pub snapshot_id: String,
    pub found: bool,
    pub snapshot: Option<AgentSnapshot>,
}

#[derive(Serialize)]
pub struct SnapshotListOutput {
    pub store_path: String,
    pub count: usize,
    pub snapshot_ids: Vec<String>,
}

#[derive(Serialize)]
pub struct SnapshotCheckpointOutput {
    /// The source snapshot's id — the one whose state was checkpointed.
    pub source_snapshot_id: String,
    /// The new snapshot's id (freshly minted by the checkpoint).
    pub snapshot_id: String,
    pub agent_id: String,
    pub branch_id: String,
    /// `snapshot_created` event id, when `--emit-events` was passed.
    pub event_id: Option<String>,
    /// Sequence of the `snapshot_created` event on the branch.
    pub event_sequence: u64,
    pub out_path: String,
    pub snapshot_store_path: Option<String>,
    pub event_store_path: Option<String>,
}

#[derive(Serialize)]
pub struct SnapshotLineageOutput {
    pub root_snapshot_id: String,
    /// Number of edges in the dag the tree was built from — useful as a
    /// sanity check that the event stream produced the expected topology.
    pub edges: usize,
    pub tree: LineageNode,
}

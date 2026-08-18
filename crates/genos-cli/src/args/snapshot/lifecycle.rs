use super::{ArgsMacro, LineageFormat, OutputFormat};
use std::path::PathBuf;

#[derive(ArgsMacro, Debug)]
pub struct SnapshotCreateArgs {
    #[arg(long)]
    pub agent: PathBuf,
    #[arg(long)]
    pub out: Option<PathBuf>,
    /// Seed a working memory item, as `key=value`. Repeatable.
    #[arg(long, value_name = "KEY=VALUE")]
    pub memory: Vec<String>,
    /// Seed a semantic memory reference. Repeatable.
    #[arg(long, value_name = "MEMORY_ID")]
    pub semantic_ref: Vec<String>,
    /// Seed an episodic memory reference. Repeatable.
    #[arg(long, value_name = "MEMORY_ID")]
    pub episodic_ref: Vec<String>,
    #[arg(long, value_enum, default_value_t = OutputFormat::Json)]
    pub format: OutputFormat,
}

#[derive(ArgsMacro, Debug)]
pub struct SnapshotCompareArgs {
    /// First snapshot: file path or snapshot id resolved in the snapshot store.
    #[arg(long)]
    pub a: String,
    /// Second snapshot: file path or snapshot id resolved in the snapshot store.
    #[arg(long)]
    pub b: String,
    #[arg(long, default_value = ".genos")]
    pub root: PathBuf,
    #[arg(long)]
    pub store: Option<PathBuf>,
    /// Exit non-zero unless every logical state field is identical.
    #[arg(long)]
    pub expect_same_state: bool,
    /// Exit non-zero unless snapshot, agent and branch ids all differ.
    #[arg(long)]
    pub expect_distinct_identity: bool,
    /// Exit non-zero unless the logical state fields that differ are exactly
    /// these. Repeatable, and mutually exclusive with `--expect-same-state`.
    #[arg(
        long = "expect-differing-field",
        value_name = "FIELD",
        conflicts_with = "expect_same_state"
    )]
    pub expect_differing_fields: Vec<String>,
    #[arg(long, value_enum, default_value_t = OutputFormat::Json)]
    pub format: OutputFormat,
}

#[derive(ArgsMacro, Debug)]
pub struct SnapshotSaveArgs {
    #[arg(long)]
    pub snapshot: PathBuf,
    #[arg(long, default_value = ".genos")]
    pub root: PathBuf,
    #[arg(long)]
    pub store: Option<PathBuf>,
    #[arg(long, value_enum, default_value_t = OutputFormat::Json)]
    pub format: OutputFormat,
}

#[derive(ArgsMacro, Debug)]
pub struct SnapshotGetArgs {
    #[arg(long)]
    pub snapshot_id: String,
    #[arg(long, default_value = ".genos")]
    pub root: PathBuf,
    #[arg(long)]
    pub store: Option<PathBuf>,
    #[arg(long, value_enum, default_value_t = OutputFormat::Json)]
    pub format: OutputFormat,
}

#[derive(ArgsMacro, Debug)]
pub struct SnapshotListArgs {
    #[arg(long, default_value = ".genos")]
    pub root: PathBuf,
    #[arg(long)]
    pub store: Option<PathBuf>,
    #[arg(long, value_enum, default_value_t = OutputFormat::Json)]
    pub format: OutputFormat,
}

#[derive(ArgsMacro, Debug)]
pub struct SnapshotRestoreArgs {
    /// Snapshot to rewind: file path or snapshot id resolved in the store.
    /// Its logical state will be replaced by the source's; its identity
    /// (snapshot_id, agent_id, branch_id) is preserved.
    #[arg(long)]
    pub snapshot: String,
    /// Saved snapshot whose state the target will be rewound to. Must live
    /// on the same branch as `--snapshot`.
    #[arg(long)]
    pub source: String,
    #[arg(long, default_value = ".genos")]
    pub root: PathBuf,
    /// Snapshot store used to resolve `--snapshot` and `--source` by id and
    /// to persist the rewritten target with `--save`.
    #[arg(long)]
    pub snapshots: Option<PathBuf>,
    /// Write the rewound target here. Defaults to the file the target was
    /// loaded from.
    #[arg(long)]
    pub out: Option<PathBuf>,
    /// Append the rewound target to the snapshot store.
    #[arg(long)]
    pub save: bool,
    /// Event store receiving the `restored` event with `--emit-events`.
    #[arg(long)]
    pub events: Option<PathBuf>,
    /// Append the `restored` event on the snapshot's own branch.
    #[arg(long)]
    pub emit_events: bool,
    /// Exit non-zero unless the rewound target's logical state matches the
    /// source's (counter == 10 in the demo).
    #[arg(long)]
    pub expect_same_state: bool,
    #[arg(long, value_enum, default_value_t = OutputFormat::Json)]
    pub format: OutputFormat,
}

#[derive(ArgsMacro, Debug)]
pub struct SnapshotCheckpointArgs {
    /// Snapshot to checkpoint: file path or snapshot id resolved in the
    /// store. Its logical state will be copied into a fresh `snapshot_id`;
    /// its `branch_id` and `agent_id` are preserved (this is *not* a fork).
    #[arg(long)]
    pub snapshot: String,
    #[arg(long, default_value = ".genos")]
    pub root: PathBuf,
    /// Snapshot store used to resolve `--snapshot` by id and to persist
    /// the new checkpoint with `--save`.
    #[arg(long)]
    pub snapshots: Option<PathBuf>,
    /// Write the checkpoint here. Defaults to the file the source snapshot
    /// was loaded from when `--snapshot` is a file path.
    #[arg(long)]
    pub out: Option<PathBuf>,
    /// Append the new checkpoint to the snapshot store (default: on).
    #[arg(long, default_value_t = true)]
    pub save: bool,
    /// Event store receiving the `snapshot_created` event with
    /// `--emit-events`.
    #[arg(long)]
    pub events: Option<PathBuf>,
    /// Append the `snapshot_created` event on the snapshot's own branch.
    #[arg(long)]
    pub emit_events: bool,
    /// Exit non-zero unless the new snapshot has a different `snapshot_id`
    /// than the source.
    #[arg(long)]
    pub expect_fresh_id: bool,
    /// Exit non-zero unless the new snapshot shares `branch_id` with the
    /// source.
    #[arg(long)]
    pub expect_same_branch: bool,
    #[arg(long, value_enum, default_value_t = OutputFormat::Json)]
    pub format: OutputFormat,
}

#[derive(ArgsMacro, Debug)]
pub struct SnapshotLineageArgs {
    /// Anchor the tree at this snapshot file or id. When given as a file
    /// path, the file's `snapshot_id` is used; when given as an id, the
    /// snapshot store resolves it. Children include only nodes reachable
    /// from here via the lineage dag. Mutually exclusive with `--root`.
    #[arg(long, conflicts_with = "root")]
    pub snapshot: Option<String>,
    /// Anchor the tree at this snapshot id (the id form of `--snapshot`).
    /// Mutually exclusive with `--snapshot`.
    #[arg(long)]
    pub root: Option<String>,
    /// Event store to walk. Defaults to the per-root event store.
    #[arg(long)]
    pub events: Option<PathBuf>,
    /// Snapshot store used to resolve `--snapshot` / `--root` by id.
    #[arg(long)]
    pub snapshots: Option<PathBuf>,
    #[arg(long, default_value = ".genos")]
    pub root_dir: PathBuf,
    #[arg(long, value_enum, default_value_t = LineageFormat::Json)]
    pub format: LineageFormat,
    /// Print the full `snapshot_id` instead of the first 8 chars.
    #[arg(long)]
    pub full_id: bool,
}

pub mod lifecycle;
pub mod mutation;

pub use lifecycle::*;
pub use mutation::*;

use super::{ArgsMacro, MemoryKindArg, OutputFormat};
use clap::ValueEnum;

#[derive(Clone, Copy, Debug, Eq, PartialEq, ValueEnum)]
pub enum LineageFormat {
    /// Pretty-printed JSON: the structured tree, suitable for scripts.
    Json,
    /// YAML form of the same tree.
    Yaml,
    /// Plain text rendered with `â”œâ”€â”€` / `â””â”€â”€` connectors.
    Text,
}

#[derive(ArgsMacro, Debug)]
pub struct SnapshotCommand {
    #[command(subcommand)]
    pub command: SnapshotSubcommands,
}

#[derive(clap::Subcommand, Debug)]
pub enum SnapshotSubcommands {
    Create(SnapshotCreateArgs),
    Save(SnapshotSaveArgs),
    Get(SnapshotGetArgs),
    List(SnapshotListArgs),
    /// Compare two snapshots as counterfactual siblings.
    Compare(SnapshotCompareArgs),
    /// Write a branch-local variable on a snapshot's own branch.
    SetVar(SnapshotSetVarArgs),
    /// Check that sibling branches wrote the same variable differently and that
    /// no write escaped its branch.
    CheckVar(SnapshotCheckVarArgs),
    /// Tune the genome's cognition values on one snapshot.
    SetCognition(SnapshotSetCognitionArgs),
    /// Record a memory on a snapshot's own branch.
    AddMemory(SnapshotAddMemoryArgs),
    /// Insert-or-update a (subject, predicate, object) belief on a snapshot's
    /// own branch. A belief whose triple already exists on this branch has its
    /// `confidence` overwritten in place rather than appended as a parallel
    /// record.
    SetBelief(SnapshotSetBeliefArgs),
    /// Record a tool call on a snapshot's own branch. Emits a `ToolRequested`
    /// and then a `ToolCompleted` (or `ToolFailed`) event for the call, and
    /// makes the call's output available as evidence for a subsequent
    /// `set-belief --evidence`.
    RecordToolCall(SnapshotRecordToolCallArgs),
    /// Rewind a snapshot's logical state to match a previously saved snapshot
    /// on the same branch. The target keeps its `snapshot_id`, `agent_id`,
    /// and `branch_id`; only the logical state is replaced. A `restored`
    /// event is stamped on the branch so the audit trail records the
    /// rewind. History stays visible because the event store is append-only.
    Restore(SnapshotRestoreArgs),
    /// Mint a fresh `snapshot_id` carrying the current logical state on the
    /// same branch. Unlike `snapshot save` (id-stable round-trip), `checkpoint`
    /// advances the timeline so a series of writes can be recorded as
    /// distinct snapshots `S0 â†’ S1 â†’ S2 â†’ ...` on one branch. Emits a
    /// `snapshot_created` event whose payload references the prior id.
    Checkpoint(SnapshotCheckpointArgs),
    /// Build a lineage tree of snapshots and the relations between them by
    /// walking the event store. Renders as text or JSON; the JSON form lets
    /// scripts assert tree shape.
    Lineage(SnapshotLineageArgs),
}


use super::{ArgsMacro, MemoryKindArg, OutputFormat};
use clap::ValueEnum;
use std::path::PathBuf;

#[derive(Clone, Copy, Debug, Eq, PartialEq, ValueEnum)]
pub enum LineageFormat {
    /// Pretty-printed JSON: the structured tree, suitable for scripts.
    Json,
    /// YAML form of the same tree.
    Yaml,
    /// Plain text rendered with `├──` / `└──` connectors.
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
    /// distinct snapshots `S0 → S1 → S2 → ...` on one branch. Emits a
    /// `snapshot_created` event whose payload references the prior id.
    Checkpoint(SnapshotCheckpointArgs),
    /// Build a lineage tree of snapshots and the relations between them by
    /// walking the event store. Renders as text or JSON; the JSON form lets
    /// scripts assert tree shape.
    Lineage(SnapshotLineageArgs),
}

#[derive(ArgsMacro, Debug)]
pub struct SnapshotAddMemoryArgs {
    /// Snapshot to record on: file path or snapshot id resolved in the store.
    #[arg(long)]
    pub snapshot: String,
    #[arg(long, value_enum, default_value_t = MemoryKindArg::Semantic)]
    pub kind: MemoryKindArg,
    #[arg(long)]
    pub content: String,
    /// Where the content came from: a tool, an observation, a document.
    #[arg(long)]
    pub source: Option<String>,
    #[arg(long, default_value = ".genos")]
    pub root: PathBuf,
    #[arg(long)]
    pub snapshots: Option<PathBuf>,
    /// Write the updated snapshot here. Defaults to the `--snapshot` file.
    #[arg(long)]
    pub out: Option<PathBuf>,
    /// Append the updated snapshot to the snapshot store.
    #[arg(long)]
    pub save: bool,
    /// Event store receiving the `memory_created` event with `--emit-events`.
    #[arg(long)]
    pub events: Option<PathBuf>,
    /// Append the `memory_created` event on the snapshot's own branch.
    #[arg(long)]
    pub emit_events: bool,
    #[arg(long, value_enum, default_value_t = OutputFormat::Json)]
    pub format: OutputFormat,
}

fn parse_key_val<T, U>(s: &str) -> Result<(T, U), Box<dyn std::error::Error + Send + Sync + 'static>>
where
    T: std::str::FromStr,
    T::Err: std::error::Error + Send + Sync + 'static,
    U: std::str::FromStr,
    U::Err: std::error::Error + Send + Sync + 'static,
{
    let pos = s
        .find('=')
        .ok_or_else(|| format!("invalid KEY=value: no `=` found in `{s}`"))?;
    Ok((s[..pos].parse()?, s[pos + 1..].parse()?))
}

#[derive(ArgsMacro, Debug)]
pub struct SnapshotSetCognitionArgs {
    /// Snapshot to change: file path or snapshot id resolved in the store.
    #[arg(long)]
    pub snapshot: String,
    #[arg(long = "drive", value_parser = parse_key_val::<String, f32>)]
    pub drives: Vec<(String, f32)>,
    #[arg(long)]
    pub planning_depth: Option<u32>,
    #[arg(long, default_value = ".genos")]
    pub root: PathBuf,
    #[arg(long)]
    pub snapshots: Option<PathBuf>,
    /// Write the updated snapshot here. Defaults to the `--snapshot` file.
    #[arg(long)]
    pub out: Option<PathBuf>,
    /// Append the updated snapshot to the snapshot store.
    #[arg(long)]
    pub save: bool,
    #[arg(long, value_enum, default_value_t = OutputFormat::Json)]
    pub format: OutputFormat,
}

#[derive(ArgsMacro, Debug)]
pub struct SnapshotSetVarArgs {
    /// Snapshot to write on: file path or snapshot id resolved in the snapshot store.
    #[arg(long)]
    pub snapshot: String,
    #[arg(long)]
    pub key: String,
    #[arg(long)]
    pub value: String,
    #[arg(long, default_value = ".genos")]
    pub root: PathBuf,
    /// Snapshot store used to resolve `--snapshot` by id and to persist with `--save`.
    #[arg(long)]
    pub snapshots: Option<PathBuf>,
    /// Write the updated snapshot here. Defaults to the `--snapshot` file itself,
    /// since the write advances that branch's own state.
    #[arg(long)]
    pub out: Option<PathBuf>,
    /// Append the updated snapshot to the snapshot store.
    #[arg(long)]
    pub save: bool,
    /// Event store receiving the write event with `--emit-events`.
    #[arg(long)]
    pub events: Option<PathBuf>,
    /// Append the `memory_created`/`memory_updated` event on the snapshot's own branch.
    #[arg(long)]
    pub emit_events: bool,
    #[arg(long, value_enum, default_value_t = OutputFormat::Json)]
    pub format: OutputFormat,
}

#[derive(ArgsMacro, Debug)]
pub struct SnapshotSetBeliefArgs {
    /// Snapshot to write on: file path or snapshot id resolved in the snapshot store.
    #[arg(long)]
    pub snapshot: String,
    /// Subject of the belief — what the claim is *about*.
    #[arg(long)]
    pub subject: String,
    /// Predicate of the belief — what relation is being asserted.
    #[arg(long)]
    pub predicate: String,
    /// Object of the belief — what the subject is claimed to relate to.
    #[arg(long = "object")]
    pub object_value: String,
    /// Confidence in [0.0, 1.0]. A later call with the same triple overwrites
    /// the previous confidence and emits a `memory_updated` event.
    #[arg(long, value_parser = crate::resolve::unit_interval)]
    pub confidence: f32,
    /// Evidence link to a `ToolOutputId` recorded on this branch. Repeatable.
    /// Supplying evidence flips the new belief's status to `inferred` unless
    /// an explicit `--status` is provided. The evidence must resolve to a
    /// record on the snapshot's own branch.
    #[arg(long = "evidence", value_name = "TOOL_OUTPUT_ID")]
    pub evidence: Vec<String>,
    #[arg(long, default_value = ".genos")]
    pub root: PathBuf,
    /// Snapshot store used to resolve `--snapshot` by id and to persist with `--save`.
    #[arg(long)]
    pub snapshots: Option<PathBuf>,
    /// Write the updated snapshot here. Defaults to the `--snapshot` file itself,
    /// since the write advances that branch's own state.
    #[arg(long)]
    pub out: Option<PathBuf>,
    /// Append the updated snapshot to the snapshot store.
    #[arg(long)]
    pub save: bool,
    /// Event store receiving the belief event with `--emit-events`.
    #[arg(long)]
    pub events: Option<PathBuf>,
    /// Append the `memory_created`/`memory_updated` event on the snapshot's own branch.
    #[arg(long)]
    pub emit_events: bool,
    #[arg(long, value_enum, default_value_t = OutputFormat::Json)]
    pub format: OutputFormat,
}

#[derive(ArgsMacro, Debug)]
pub struct SnapshotRecordToolCallArgs {
    /// Snapshot to record on: file path or snapshot id resolved in the snapshot store.
    #[arg(long)]
    pub snapshot: String,
    /// Name of the tool invoked (e.g. `db_query`).
    #[arg(long = "tool-name")]
    pub tool_name: String,
    /// Tool input, encoded as JSON. Falls back to a JSON string when parsing fails.
    #[arg(long)]
    pub input: Option<String>,
    /// Tool output, encoded as JSON. Falls back to a JSON string when parsing fails.
    #[arg(long)]
    pub output: Option<String>,
    /// Whether the tool call succeeded. Defaults to `true`. `false` flips the
    /// completion event to `tool_failed` and the record's `success` field.
    #[arg(long, default_value_t = true)]
    pub success: bool,
    #[arg(long, default_value = ".genos")]
    pub root: PathBuf,
    /// Snapshot store used to resolve `--snapshot` by id and to persist with `--save`.
    #[arg(long)]
    pub snapshots: Option<PathBuf>,
    /// Write the updated snapshot here. Defaults to the `--snapshot` file.
    #[arg(long)]
    pub out: Option<PathBuf>,
    /// Append the updated snapshot to the snapshot store.
    #[arg(long)]
    pub save: bool,
    /// Event store receiving the `tool_requested` and `tool_completed` events.
    #[arg(long)]
    pub events: Option<PathBuf>,
    /// Append the tool-call events on the snapshot's own branch.
    #[arg(long)]
    pub emit_events: bool,
    #[arg(long, value_enum, default_value_t = OutputFormat::Json)]
    pub format: OutputFormat,
}

#[derive(ArgsMacro, Debug)]
pub struct SnapshotCheckVarArgs {
    /// Variable the branches are expected to have written.
    #[arg(long)]
    pub key: String,
    /// Snapshot the branches were forked from: file path or snapshot id.
    #[arg(long)]
    pub parent: String,
    /// Value the parent held before the branches wrote. Defaults to the value it
    /// currently holds, which only checks the branches against each other.
    #[arg(long)]
    pub expect_parent: Option<String>,
    /// Expect the variable to be absent from the parent.
    #[arg(long, conflicts_with = "expect_parent")]
    pub expect_parent_absent: bool,
    /// Branch snapshot: file path or snapshot id. Repeatable.
    #[arg(long = "branch", value_name = "SNAPSHOT")]
    pub branches: Vec<String>,
    /// Value the matching `--branch` wrote, in the same order. Repeatable.
    #[arg(long = "expect", value_name = "VALUE")]
    pub expects: Vec<String>,
    #[arg(long, default_value = ".genos")]
    pub root: PathBuf,
    #[arg(long)]
    pub store: Option<PathBuf>,
    /// Exit non-zero unless every branch kept its own write, the parent kept its
    /// pre-fork value, and no two branches ended on the same value.
    #[arg(long)]
    pub expect_isolated: bool,
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

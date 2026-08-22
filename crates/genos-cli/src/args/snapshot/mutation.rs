use super::{ArgsMacro, MemoryKindArg, OutputFormat};
use std::path::PathBuf;

pub fn parse_key_val<T, U>(
    s: &str,
) -> Result<(T, U), Box<dyn std::error::Error + Send + Sync + 'static>>
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
    /// Subject of the belief â€” what the claim is *about*.
    #[arg(long)]
    pub subject: String,
    /// Predicate of the belief â€” what relation is being asserted.
    #[arg(long)]
    pub predicate: String,
    /// Object of the belief â€” what the subject is claimed to relate to.
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

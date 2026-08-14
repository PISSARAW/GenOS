use anyhow::{bail, Context, Result};
use chrono::Utc;
use clap::{Args, Parser, Subcommand, ValueEnum};
use genos_core::{
    check_variable_isolation, compare_snapshots, diff_snapshots, fork_first_event_sequence,
    fork_snapshot, write_variable_on_branch, AgentDiff, AgentEvent, AgentEventType, AgentGenome,
    AgentId, AgentSnapshot, AgentState, BranchId, Capability, CognitionConfig, CorrelationId,
    EpisodicMemory, EventCursor, EventId, ExecutionMetadata, GenomeId, GenomeRef, GenomeVersion,
    Goal, Identity, MemoryId, MemoryPolicy, ModelPolicy, Objective, Policy, RuntimeMetadata,
    SemanticMemory, SnapshotComparison, SnapshotId, ToolPermission, ToolPolicy, ToolState,
    VariableExpectation, VariableIsolationReport, WorkingMemory, WorkingMemoryItem, WorldId,
};
use genos_store::{
    basic_state_from_snapshot, replay_basic_state_from, EventStore, LocalEventStore,
    LocalSnapshotStore, SnapshotStore,
};
use genos_world::{
    check_file_isolation, DestroyOutcome, DirectoryWorldProvider, FileIsolationReport,
    GitWorktreeWorldProvider, WorldFileExpectation, WorldProvider,
};
use serde::Serialize;
use serde_json::json;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Parser, Debug)]
#[command(name = "genos")]
#[command(about = "Genome Operating System for Agents")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand, Debug)]
enum Commands {
    Init,
    Agent(AgentCommand),
    Snapshot(SnapshotCommand),
    World(WorldCommand),
    Replay(ReplayCommand),
    /// Diff the logical state of two snapshots. Identity fields are excluded,
    /// so two untouched forks of one snapshot diff to nothing.
    Diff(DiffArgs),
}

#[derive(Args, Debug)]
struct DiffArgs {
    /// Left side: file path or snapshot id resolved in the snapshot store.
    a: String,
    /// Right side: file path or snapshot id resolved in the snapshot store.
    b: String,
    #[arg(long, default_value = ".genos")]
    root: PathBuf,
    #[arg(long)]
    store: Option<PathBuf>,
    /// Exit non-zero unless the two snapshots are semantically identical.
    #[arg(long)]
    expect_empty: bool,
    /// Exit non-zero unless the changed paths are exactly these. Repeatable,
    /// and mutually exclusive with `--expect-empty`.
    #[arg(
        long = "expect-changed-path",
        value_name = "PATH",
        conflicts_with = "expect_empty"
    )]
    expect_changed_paths: Vec<String>,
    /// `text` prints one section header per changed area, then each path with
    /// its old and new value.
    #[arg(long, value_enum, default_value_t = DiffFormat::Json)]
    format: DiffFormat,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, ValueEnum)]
enum DiffFormat {
    Json,
    Yaml,
    Text,
}

#[derive(Args, Debug)]
struct AgentCommand {
    #[command(subcommand)]
    command: AgentSubcommands,
}

#[derive(Subcommand, Debug)]
enum AgentSubcommands {
    Create(AgentCreateArgs),
    Inspect(AgentInspectArgs),
    /// Derive counterfactual forks from an existing snapshot, without any model call.
    ForkFromSnapshot(AgentForkFromSnapshotArgs),
}

#[derive(Args, Debug)]
struct AgentCreateArgs {
    #[arg(long)]
    name: String,
    #[arg(long)]
    role: String,
    #[arg(long)]
    out: Option<PathBuf>,
    #[arg(long, value_enum, default_value_t = OutputFormat::Yaml)]
    format: OutputFormat,
}

#[derive(Args, Debug)]
struct AgentInspectArgs {
    path: PathBuf,
    #[arg(long, value_enum, default_value_t = OutputFormat::Yaml)]
    format: OutputFormat,
}

#[derive(Args, Debug)]
struct AgentForkFromSnapshotArgs {
    /// Parent snapshot: either a file path or a snapshot id resolved in the snapshot store.
    #[arg(long)]
    snapshot: String,
    /// Number of sibling forks to derive.
    #[arg(long, default_value_t = 2)]
    count: u32,
    #[arg(long, default_value = ".genos")]
    root: PathBuf,
    /// Snapshot store used to resolve `--snapshot` by id and to persist forks with `--save`.
    #[arg(long)]
    snapshots: Option<PathBuf>,
    /// Append each fork to the snapshot store.
    #[arg(long)]
    save: bool,
    /// Event store receiving one `fork_created` event per fork with `--emit-events`.
    #[arg(long)]
    events: Option<PathBuf>,
    /// Append one `fork_created` event per fork, on the fork's own branch.
    #[arg(long)]
    emit_events: bool,
    /// Write each fork as `<out-prefix>-<n>.json` into this directory.
    #[arg(long)]
    out_dir: Option<PathBuf>,
    #[arg(long, default_value = "fork")]
    out_prefix: String,
    #[arg(long, value_enum, default_value_t = OutputFormat::Json)]
    format: OutputFormat,
}

#[derive(Args, Debug)]
struct SnapshotCommand {
    #[command(subcommand)]
    command: SnapshotSubcommands,
}

#[derive(Subcommand, Debug)]
enum SnapshotSubcommands {
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
}

#[derive(Args, Debug)]
struct SnapshotSetCognitionArgs {
    /// Snapshot to change: file path or snapshot id resolved in the store.
    #[arg(long)]
    snapshot: String,
    #[arg(long, value_parser = unit_interval)]
    exploration: Option<f32>,
    #[arg(long, value_parser = unit_interval)]
    verification_threshold: Option<f32>,
    #[arg(long)]
    planning_depth: Option<u32>,
    #[arg(long, default_value = ".genos")]
    root: PathBuf,
    #[arg(long)]
    snapshots: Option<PathBuf>,
    /// Write the updated snapshot here. Defaults to the `--snapshot` file.
    #[arg(long)]
    out: Option<PathBuf>,
    /// Append the updated snapshot to the snapshot store.
    #[arg(long)]
    save: bool,
    #[arg(long, value_enum, default_value_t = OutputFormat::Json)]
    format: OutputFormat,
}

#[derive(Args, Debug)]
struct SnapshotSetVarArgs {
    /// Snapshot to write on: file path or snapshot id resolved in the snapshot store.
    #[arg(long)]
    snapshot: String,
    #[arg(long)]
    key: String,
    #[arg(long)]
    value: String,
    #[arg(long, default_value = ".genos")]
    root: PathBuf,
    /// Snapshot store used to resolve `--snapshot` by id and to persist with `--save`.
    #[arg(long)]
    snapshots: Option<PathBuf>,
    /// Write the updated snapshot here. Defaults to the `--snapshot` file itself,
    /// since the write advances that branch's own state.
    #[arg(long)]
    out: Option<PathBuf>,
    /// Append the updated snapshot to the snapshot store.
    #[arg(long)]
    save: bool,
    /// Event store receiving the write event with `--emit-events`.
    #[arg(long)]
    events: Option<PathBuf>,
    /// Append the `memory_created`/`memory_updated` event on the snapshot's own branch.
    #[arg(long)]
    emit_events: bool,
    #[arg(long, value_enum, default_value_t = OutputFormat::Json)]
    format: OutputFormat,
}

#[derive(Args, Debug)]
struct SnapshotCheckVarArgs {
    /// Variable the branches are expected to have written.
    #[arg(long)]
    key: String,
    /// Snapshot the branches were forked from: file path or snapshot id.
    #[arg(long)]
    parent: String,
    /// Value the parent held before the branches wrote. Defaults to the value it
    /// currently holds, which only checks the branches against each other.
    #[arg(long)]
    expect_parent: Option<String>,
    /// Expect the variable to be absent from the parent.
    #[arg(long, conflicts_with = "expect_parent")]
    expect_parent_absent: bool,
    /// Branch snapshot: file path or snapshot id. Repeatable.
    #[arg(long = "branch", value_name = "SNAPSHOT")]
    branches: Vec<String>,
    /// Value the matching `--branch` wrote, in the same order. Repeatable.
    #[arg(long = "expect", value_name = "VALUE")]
    expects: Vec<String>,
    #[arg(long, default_value = ".genos")]
    root: PathBuf,
    #[arg(long)]
    store: Option<PathBuf>,
    /// Exit non-zero unless every branch kept its own write, the parent kept its
    /// pre-fork value, and no two branches ended on the same value.
    #[arg(long)]
    expect_isolated: bool,
    #[arg(long, value_enum, default_value_t = OutputFormat::Json)]
    format: OutputFormat,
}

#[derive(Args, Debug)]
struct SnapshotCreateArgs {
    #[arg(long)]
    agent: PathBuf,
    #[arg(long)]
    out: Option<PathBuf>,
    /// Seed a working memory item, as `key=value`. Repeatable.
    #[arg(long, value_name = "KEY=VALUE")]
    memory: Vec<String>,
    /// Seed a semantic memory reference. Repeatable.
    #[arg(long, value_name = "MEMORY_ID")]
    semantic_ref: Vec<String>,
    /// Seed an episodic memory reference. Repeatable.
    #[arg(long, value_name = "MEMORY_ID")]
    episodic_ref: Vec<String>,
    #[arg(long, value_enum, default_value_t = OutputFormat::Json)]
    format: OutputFormat,
}

#[derive(Args, Debug)]
struct SnapshotCompareArgs {
    /// First snapshot: file path or snapshot id resolved in the snapshot store.
    #[arg(long)]
    a: String,
    /// Second snapshot: file path or snapshot id resolved in the snapshot store.
    #[arg(long)]
    b: String,
    #[arg(long, default_value = ".genos")]
    root: PathBuf,
    #[arg(long)]
    store: Option<PathBuf>,
    /// Exit non-zero unless every logical state field is identical.
    #[arg(long)]
    expect_same_state: bool,
    /// Exit non-zero unless snapshot, agent and branch ids all differ.
    #[arg(long)]
    expect_distinct_identity: bool,
    /// Exit non-zero unless the logical state fields that differ are exactly
    /// these. Repeatable, and mutually exclusive with `--expect-same-state`.
    #[arg(
        long = "expect-differing-field",
        value_name = "FIELD",
        conflicts_with = "expect_same_state"
    )]
    expect_differing_fields: Vec<String>,
    #[arg(long, value_enum, default_value_t = OutputFormat::Json)]
    format: OutputFormat,
}

#[derive(Args, Debug)]
struct SnapshotSaveArgs {
    #[arg(long)]
    snapshot: PathBuf,
    #[arg(long, default_value = ".genos")]
    root: PathBuf,
    #[arg(long)]
    store: Option<PathBuf>,
    #[arg(long, value_enum, default_value_t = OutputFormat::Json)]
    format: OutputFormat,
}

#[derive(Args, Debug)]
struct SnapshotGetArgs {
    #[arg(long)]
    snapshot_id: String,
    #[arg(long, default_value = ".genos")]
    root: PathBuf,
    #[arg(long)]
    store: Option<PathBuf>,
    #[arg(long, value_enum, default_value_t = OutputFormat::Json)]
    format: OutputFormat,
}

#[derive(Args, Debug)]
struct SnapshotListArgs {
    #[arg(long, default_value = ".genos")]
    root: PathBuf,
    #[arg(long)]
    store: Option<PathBuf>,
    #[arg(long, value_enum, default_value_t = OutputFormat::Json)]
    format: OutputFormat,
}

#[derive(Args, Debug)]
struct ReplayCommand {
    #[command(subcommand)]
    command: ReplaySubcommands,
}

#[derive(Subcommand, Debug)]
enum ReplaySubcommands {
    Basic(ReplayBasicArgs),
    FromSnapshot(ReplayFromSnapshotArgs),
}

#[derive(Args, Debug)]
struct ReplayBasicArgs {
    #[arg(long, default_value = ".genos")]
    root: PathBuf,
    #[arg(long)]
    events: Option<PathBuf>,
    #[arg(long, conflicts_with = "snapshot")]
    branch_id: Option<String>,
    /// Replay the branch owned by this snapshot (file path or snapshot id) and
    /// assert the replayed stream stays bound to that snapshot's agent.
    #[arg(long)]
    snapshot: Option<String>,
    /// Snapshot store used to resolve `--snapshot` by id.
    #[arg(long)]
    snapshots: Option<PathBuf>,
    /// Exit non-zero unless the replayed state ends on this agent id.
    #[arg(long)]
    expect_agent_id: Option<String>,
    /// Exit non-zero unless the replayed state ends on this branch id.
    #[arg(long)]
    expect_branch_id: Option<String>,
    /// Exit non-zero unless the replayed state ends on this sequence number.
    #[arg(long)]
    expect_last_sequence: Option<u64>,
    #[arg(long, value_enum, default_value_t = OutputFormat::Json)]
    format: OutputFormat,
}

#[derive(Args, Debug)]
struct ReplayFromSnapshotArgs {
    #[arg(long)]
    snapshot_id: String,
    #[arg(long, default_value = ".genos")]
    root: PathBuf,
    #[arg(long)]
    snapshots: Option<PathBuf>,
    #[arg(long)]
    events: Option<PathBuf>,
    #[arg(long, value_enum, default_value_t = OutputFormat::Json)]
    format: OutputFormat,
}

#[derive(Args, Debug)]
struct WorldCommand {
    #[command(subcommand)]
    command: WorldSubcommands,
}

#[derive(Subcommand, Debug)]
enum WorldSubcommands {
    Create(WorldCreateArgs),
    Snapshot(WorldSnapshotArgs),
    Fork(WorldForkArgs),
    Diff(WorldDiffArgs),
    Destroy(WorldDestroyArgs),
    /// Read a world-relative file from inside a world.
    ReadFile(WorldReadFileArgs),
    /// Write a world-relative file inside a world.
    WriteFile(WorldWriteFileArgs),
    /// Check that forked worlds wrote the same file differently and that no
    /// write escaped its world.
    CheckFile(WorldCheckFileArgs),
}

#[derive(Args, Debug)]
struct WorldReadFileArgs {
    #[arg(long, value_enum)]
    provider: WorldProviderKind,
    #[arg(long, default_value = ".genos/world")]
    root: PathBuf,
    #[arg(long)]
    world_id: String,
    /// World-relative path, for example `hello.txt`.
    #[arg(long)]
    path: String,
    #[arg(long)]
    repo: Option<PathBuf>,
    #[arg(long, value_enum, default_value_t = OutputFormat::Json)]
    format: OutputFormat,
}

#[derive(Args, Debug)]
struct WorldWriteFileArgs {
    #[arg(long, value_enum)]
    provider: WorldProviderKind,
    #[arg(long, default_value = ".genos/world")]
    root: PathBuf,
    #[arg(long)]
    world_id: String,
    /// World-relative path, for example `hello.txt`.
    #[arg(long)]
    path: String,
    #[arg(long)]
    contents: String,
    #[arg(long)]
    repo: Option<PathBuf>,
    #[arg(long, value_enum, default_value_t = OutputFormat::Json)]
    format: OutputFormat,
}

#[derive(Args, Debug)]
struct WorldCheckFileArgs {
    #[arg(long, value_enum)]
    provider: WorldProviderKind,
    #[arg(long, default_value = ".genos/world")]
    root: PathBuf,
    /// World-relative path the forks are expected to have written.
    #[arg(long)]
    path: String,
    /// World the branches were forked from.
    #[arg(long)]
    parent: String,
    /// Contents the parent held before the forks were written to. Defaults to
    /// what it currently holds, which only checks the forks against each other.
    #[arg(long)]
    expect_parent: Option<String>,
    /// Expect the file to be absent from the parent world.
    #[arg(long, conflicts_with = "expect_parent")]
    expect_parent_absent: bool,
    /// Forked world id. Repeatable.
    #[arg(long = "branch", value_name = "WORLD_ID")]
    branches: Vec<String>,
    /// Contents the matching `--branch` wrote, in the same order. Repeatable.
    #[arg(long = "expect", value_name = "CONTENTS")]
    expects: Vec<String>,
    /// Exit non-zero unless every world kept its own write, the parent kept its
    /// pre-fork contents, and no two worlds ended on the same contents.
    #[arg(long)]
    expect_isolated: bool,
    #[arg(long)]
    repo: Option<PathBuf>,
    #[arg(long, value_enum, default_value_t = OutputFormat::Json)]
    format: OutputFormat,
}

#[derive(Args, Debug)]
struct WorldCreateArgs {
    #[arg(long, value_enum)]
    provider: WorldProviderKind,
    #[arg(long, default_value = ".genos/world")]
    root: PathBuf,
    #[arg(long)]
    seed: Option<PathBuf>,
    #[arg(long)]
    repo: Option<PathBuf>,
    #[arg(long, value_enum, default_value_t = OutputFormat::Json)]
    format: OutputFormat,
}

#[derive(Args, Debug)]
struct WorldSnapshotArgs {
    #[arg(long, value_enum)]
    provider: WorldProviderKind,
    #[arg(long, default_value = ".genos/world")]
    root: PathBuf,
    #[arg(long)]
    world_id: String,
    #[arg(long)]
    repo: Option<PathBuf>,
    #[arg(long, value_enum, default_value_t = OutputFormat::Json)]
    format: OutputFormat,
}

#[derive(Args, Debug)]
struct WorldForkArgs {
    #[arg(long, value_enum)]
    provider: WorldProviderKind,
    #[arg(long, default_value = ".genos/world")]
    root: PathBuf,
    #[arg(long)]
    snapshot_id: String,
    #[arg(long, default_value_t = 1)]
    count: u32,
    #[arg(long)]
    repo: Option<PathBuf>,
    #[arg(long, value_enum, default_value_t = OutputFormat::Json)]
    format: OutputFormat,
}

#[derive(Args, Debug)]
struct WorldDiffArgs {
    #[arg(long, value_enum)]
    provider: WorldProviderKind,
    #[arg(long, default_value = ".genos/world")]
    root: PathBuf,
    #[arg(long)]
    world_a: String,
    #[arg(long)]
    world_b: String,
    #[arg(long)]
    repo: Option<PathBuf>,
    #[arg(long, value_enum, default_value_t = OutputFormat::Json)]
    format: OutputFormat,
}

#[derive(Args, Debug)]
struct WorldDestroyArgs {
    #[arg(long, value_enum)]
    provider: WorldProviderKind,
    #[arg(long, default_value = ".genos/world")]
    root: PathBuf,
    #[arg(long)]
    world_id: String,
    #[arg(long)]
    repo: Option<PathBuf>,
    #[arg(long, value_enum, default_value_t = OutputFormat::Json)]
    format: OutputFormat,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, ValueEnum)]
enum WorldProviderKind {
    Directory,
    GitWorktree,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, ValueEnum)]
enum OutputFormat {
    Json,
    Yaml,
}

#[derive(Serialize)]
struct WorldCreateOutput {
    provider: String,
    world_id: String,
}

#[derive(Serialize)]
struct WorldSnapshotOutput {
    provider: String,
    world_id: String,
    snapshot_id: String,
}

#[derive(Serialize)]
struct WorldForkOutput {
    provider: String,
    parent_snapshot_id: String,
    world_ids: Vec<String>,
}

#[derive(Serialize)]
struct WorldDiffOutput {
    provider: String,
    world_a: String,
    world_b: String,
    files_changed: usize,
}

#[derive(Serialize)]
struct WorldDestroyOutput {
    provider: String,
    world_id: String,
    status: String,
}

#[derive(Serialize)]
struct WorldReadFileOutput {
    provider: String,
    world_id: String,
    path: String,
    found: bool,
    contents: Option<String>,
}

#[derive(Serialize)]
struct WorldWriteFileOutput {
    provider: String,
    world_id: String,
    path: String,
    previous_contents: Option<String>,
    contents: String,
    created: bool,
}

#[derive(Serialize)]
struct WorldCheckFileOutput {
    provider: String,
    parent_world_id: String,
    branch_count: usize,
    report: FileIsolationReport,
}

#[derive(Serialize)]
struct ReplayBasicOutput {
    store_path: String,
    branch_id: Option<String>,
    anchor_snapshot_id: Option<String>,
    state: genos_store::BasicReplayState,
}

#[derive(Serialize)]
struct AgentForkOutput {
    parent_snapshot_id: String,
    parent_agent_id: String,
    parent_branch_id: String,
    count: usize,
    saved_to_store: bool,
    snapshot_store_path: Option<String>,
    event_store_path: Option<String>,
    forks: Vec<ForkEntry>,
}

#[derive(Serialize)]
struct ForkEntry {
    index: u32,
    snapshot_id: String,
    agent_id: String,
    branch_id: String,
    first_event_sequence: u64,
    path: Option<String>,
    fork_event_id: Option<String>,
}

#[derive(Serialize)]
struct SnapshotSetVarOutput {
    snapshot_id: String,
    agent_id: String,
    branch_id: String,
    key: String,
    previous_value: Option<String>,
    value: String,
    out_path: Option<String>,
    snapshot_store_path: Option<String>,
    event_store_path: Option<String>,
    event_id: Option<String>,
    event_sequence: u64,
}

#[derive(Serialize)]
struct CognitionChange {
    field: String,
    previous: String,
    value: String,
}

#[derive(Serialize)]
struct SnapshotSetCognitionOutput {
    snapshot_id: String,
    branch_id: String,
    genome_id: String,
    changed: Vec<CognitionChange>,
    out_path: Option<String>,
    snapshot_store_path: Option<String>,
}

#[derive(Serialize)]
struct SnapshotCheckVarOutput {
    parent_snapshot_id: String,
    branch_count: usize,
    report: VariableIsolationReport,
}

#[derive(Serialize)]
struct DiffOutput {
    a_snapshot_id: String,
    b_snapshot_id: String,
    /// True when the two snapshots carry the same logical state.
    empty: bool,
    entry_count: usize,
    changed_paths: Vec<String>,
    /// Reported for context only: identity is never part of the diff.
    identity: DiffIdentity,
    diff: AgentDiff,
}

#[derive(Serialize)]
struct DiffIdentity {
    distinct_snapshot_id: bool,
    distinct_agent_id: bool,
    distinct_branch_id: bool,
    distinct_identity: bool,
}

#[derive(Serialize)]
struct SnapshotCompareOutput {
    a_snapshot_id: String,
    b_snapshot_id: String,
    comparison: SnapshotComparison,
}

#[derive(Serialize)]
struct ReplayFromSnapshotOutput {
    snapshot_store_path: String,
    event_store_path: String,
    snapshot_id: String,
    branch_id: String,
    from_sequence_exclusive: u64,
    replayed_events: usize,
    state: genos_store::BasicReplayState,
}

#[derive(Serialize)]
struct SnapshotSaveOutput {
    store_path: String,
    snapshot_id: String,
}

#[derive(Serialize)]
struct SnapshotGetOutput {
    store_path: String,
    snapshot_id: String,
    found: bool,
    snapshot: Option<AgentSnapshot>,
}

#[derive(Serialize)]
struct SnapshotListOutput {
    store_path: String,
    count: usize,
    snapshot_ids: Vec<String>,
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();

    match cli.command {
        Commands::Init => cmd_init(),
        Commands::Agent(agent) => match agent.command {
            AgentSubcommands::Create(args) => cmd_agent_create(args),
            AgentSubcommands::Inspect(args) => cmd_agent_inspect(args),
            AgentSubcommands::ForkFromSnapshot(args) => cmd_agent_fork_from_snapshot(args).await,
        },
        Commands::Snapshot(snapshot) => match snapshot.command {
            SnapshotSubcommands::Create(args) => cmd_snapshot_create(args),
            SnapshotSubcommands::Save(args) => cmd_snapshot_save(args).await,
            SnapshotSubcommands::Get(args) => cmd_snapshot_get(args).await,
            SnapshotSubcommands::List(args) => cmd_snapshot_list(args).await,
            SnapshotSubcommands::Compare(args) => cmd_snapshot_compare(args).await,
            SnapshotSubcommands::SetVar(args) => cmd_snapshot_set_var(args).await,
            SnapshotSubcommands::CheckVar(args) => cmd_snapshot_check_var(args).await,
            SnapshotSubcommands::SetCognition(args) => cmd_snapshot_set_cognition(args).await,
        },
        Commands::World(world) => match world.command {
            WorldSubcommands::Create(args) => cmd_world_create(args).await,
            WorldSubcommands::Snapshot(args) => cmd_world_snapshot(args).await,
            WorldSubcommands::Fork(args) => cmd_world_fork(args).await,
            WorldSubcommands::Diff(args) => cmd_world_diff(args).await,
            WorldSubcommands::Destroy(args) => cmd_world_destroy(args).await,
            WorldSubcommands::ReadFile(args) => cmd_world_read_file(args).await,
            WorldSubcommands::WriteFile(args) => cmd_world_write_file(args).await,
            WorldSubcommands::CheckFile(args) => cmd_world_check_file(args).await,
        },
        Commands::Replay(replay) => match replay.command {
            ReplaySubcommands::Basic(args) => cmd_replay_basic(args).await,
            ReplaySubcommands::FromSnapshot(args) => cmd_replay_from_snapshot(args).await,
        },
        Commands::Diff(args) => cmd_diff(args).await,
    }
}

async fn cmd_diff(args: DiffArgs) -> Result<()> {
    let store = snapshot_store_from(args.store, &args.root);
    let a = resolve_snapshot_ref(&args.a, &store).await?;
    let b = resolve_snapshot_ref(&args.b, &store).await?;

    let diff = diff_snapshots(&a, &b);
    let comparison = compare_snapshots(&a, &b);

    let out = DiffOutput {
        a_snapshot_id: a.snapshot_id.0.clone(),
        b_snapshot_id: b.snapshot_id.0.clone(),
        empty: diff.is_empty(),
        entry_count: diff.len(),
        changed_paths: diff.changed_paths(),
        identity: DiffIdentity {
            distinct_snapshot_id: comparison.distinct_snapshot_id,
            distinct_agent_id: comparison.distinct_agent_id,
            distinct_branch_id: comparison.distinct_branch_id,
            distinct_identity: comparison.distinct_identity,
        },
        diff,
    };

    match args.format {
        DiffFormat::Json => print_serialized(&out, OutputFormat::Json)?,
        DiffFormat::Yaml => print_serialized(&out, OutputFormat::Yaml)?,
        DiffFormat::Text => print_diff_text(&out),
    }

    if args.expect_empty && !out.empty {
        bail!(
            "expected an empty diff, but these paths changed: {}",
            out.changed_paths.join(", ")
        );
    }

    if !args.expect_changed_paths.is_empty() {
        let mut expected = args.expect_changed_paths.clone();
        expected.sort();
        expected.dedup();
        let mut actual = out.changed_paths.clone();
        actual.sort();

        if expected != actual {
            bail!(
                "expected exactly these paths to change: [{}], got [{}]",
                expected.join(", "),
                actual.join(", ")
            );
        }
    }

    Ok(())
}

fn cmd_init() -> Result<()> {
    fs::create_dir_all(".genos/agents")?;
    fs::create_dir_all(".genos/snapshots")?;
    fs::create_dir_all(".genos/world")?;
    println!("initialized .genos workspace");
    Ok(())
}

fn cmd_agent_create(args: AgentCreateArgs) -> Result<()> {
    let genome = AgentGenome {
        id: GenomeId::new(),
        version: GenomeVersion("0.1.0".to_string()),
        identity: Identity {
            name: args.name.clone(),
            role: args.role,
        },
        cognition: CognitionConfig {
            exploration: 0.7,
            verification_threshold: 0.8,
            planning_depth: 6,
        },
        objectives: vec![Objective {
            key: "tests_pass".to_string(),
            description: "Run tests before completion".to_string(),
        }],
        policies: vec![Policy {
            key: "evidence_before_claim".to_string(),
            description: "Claims require evidence".to_string(),
        }],
        capabilities: vec![Capability {
            name: "counterfactual_forking".to_string(),
            enabled: false,
        }],
        memory_policy: MemoryPolicy {
            working_max_items: 100,
            episodic_enabled: true,
            semantic_enabled: true,
        },
        model_policy: ModelPolicy {
            strategy: "provider-agnostic".to_string(),
            preferred_providers: vec![],
            allow_local: true,
        },
        tool_policy: ToolPolicy {
            permissions: vec![
                ToolPermission {
                    tool: "filesystem".to_string(),
                    scope: "workspace".to_string(),
                    enabled: true,
                },
                ToolPermission {
                    tool: "shell".to_string(),
                    scope: "sandboxed".to_string(),
                    enabled: true,
                },
                ToolPermission {
                    tool: "network".to_string(),
                    scope: "denied".to_string(),
                    enabled: false,
                },
            ],
        },
    };

    let path = args
        .out
        .unwrap_or_else(|| PathBuf::from(format!(".genos/agents/{}.yaml", args.name)));
    write_serialized(&path, &genome, args.format)?;
    println!("agent genome written to {}", path.display());
    Ok(())
}

fn cmd_agent_inspect(args: AgentInspectArgs) -> Result<()> {
    let genome: AgentGenome = read_genome(&args.path)?;
    print_serialized(&genome, args.format)
}

fn cmd_snapshot_create(args: SnapshotCreateArgs) -> Result<()> {
    let genome = read_genome(&args.agent)?;
    let agent_id = AgentId::new();
    let branch_id = BranchId::new();
    let world_id = WorldId::new();

    let state = AgentState {
        genome: GenomeRef {
            genome_id: genome.id.clone(),
            version: genome.version.0.clone(),
        },
        working_memory: WorkingMemory {
            items: parse_working_memory_items(&args.memory)?,
        },
        semantic_memory: SemanticMemory {
            refs: args
                .semantic_ref
                .iter()
                .map(|r| MemoryId(r.clone()))
                .collect(),
        },
        episodic_memory: EpisodicMemory {
            refs: args
                .episodic_ref
                .iter()
                .map(|r| MemoryId(r.clone()))
                .collect(),
        },
        beliefs: vec![],
        active_goals: vec![Goal {
            key: "bootstrap".to_string(),
            description: "Initialize first runtime step".to_string(),
        }],
        world_id: world_id.clone(),
        event_cursor: EventCursor {
            branch_id: branch_id.clone(),
            sequence: 0,
            last_event_id: None,
        },
        execution: ExecutionMetadata {
            step: 0,
            last_model_provider: None,
        },
        artifact_refs: vec![],
    };

    let snapshot = AgentSnapshot {
        snapshot_id: SnapshotId::new(),
        agent_id,
        branch_id,
        genome,
        state,
        world_id,
        tool_state: ToolState { active_tools: vec![] },
        runtime_metadata: RuntimeMetadata {
            runtime_version: "0.0.1".to_string(),
            budget_steps_remaining: 0,
        },
        created_at: Utc::now(),
    };

    let path = args
        .out
        .unwrap_or_else(|| PathBuf::from(".genos/snapshots/latest.json"));
    write_serialized(&path, &snapshot, args.format)?;
    println!("snapshot written to {}", path.display());
    Ok(())
}

async fn cmd_snapshot_save(args: SnapshotSaveArgs) -> Result<()> {
    let snapshot = read_snapshot(&args.snapshot)?;
    let store = snapshot_store_from(args.store, &args.root);

    let snapshot_id = snapshot.snapshot_id.0.clone();
    store.save_snapshot(snapshot).await?;

    let out = SnapshotSaveOutput {
        store_path: store.file_path().display().to_string(),
        snapshot_id,
    };
    print_serialized(&out, args.format)
}

async fn cmd_snapshot_get(args: SnapshotGetArgs) -> Result<()> {
    let store = snapshot_store_from(args.store, &args.root);

    let snapshot = store.get_snapshot(args.snapshot_id.clone()).await?;
    let out = SnapshotGetOutput {
        store_path: store.file_path().display().to_string(),
        snapshot_id: args.snapshot_id,
        found: snapshot.is_some(),
        snapshot,
    };

    print_serialized(&out, args.format)
}

async fn cmd_snapshot_list(args: SnapshotListArgs) -> Result<()> {
    let store = snapshot_store_from(args.store, &args.root);

    let snapshot_ids = store.list_snapshot_ids().await?;
    let out = SnapshotListOutput {
        store_path: store.file_path().display().to_string(),
        count: snapshot_ids.len(),
        snapshot_ids,
    };

    print_serialized(&out, args.format)
}

async fn cmd_snapshot_compare(args: SnapshotCompareArgs) -> Result<()> {
    let store = snapshot_store_from(args.store, &args.root);
    let a = resolve_snapshot_ref(&args.a, &store).await?;
    let b = resolve_snapshot_ref(&args.b, &store).await?;

    let comparison = compare_snapshots(&a, &b);
    let out = SnapshotCompareOutput {
        a_snapshot_id: a.snapshot_id.0.clone(),
        b_snapshot_id: b.snapshot_id.0.clone(),
        comparison,
    };
    print_serialized(&out, args.format)?;

    if args.expect_same_state && !out.comparison.same_logical_state {
        bail!(
            "expected identical logical state, but these fields differ: {}",
            out.comparison.differing_fields.join(", ")
        );
    }

    if args.expect_distinct_identity && !out.comparison.distinct_identity {
        bail!(
            "expected distinct identity, but snapshot_id_distinct={}, agent_id_distinct={}, branch_id_distinct={}",
            out.comparison.distinct_snapshot_id,
            out.comparison.distinct_agent_id,
            out.comparison.distinct_branch_id
        );
    }

    if !args.expect_differing_fields.is_empty() {
        let mut expected = args.expect_differing_fields.clone();
        expected.sort();
        expected.dedup();
        let mut actual = out.comparison.differing_fields.clone();
        actual.sort();

        if expected != actual {
            bail!(
                "expected exactly these fields to differ: [{}], got [{}]",
                expected.join(", "),
                actual.join(", ")
            );
        }
    }

    Ok(())
}

fn print_diff_text(out: &DiffOutput) {
    println!("diff a={} b={}", out.a_snapshot_id, out.b_snapshot_id);

    if out.empty {
        println!("no logical difference");

        // Worth saying out loud: the diff is empty even though these two are
        // different agents on different branches.
        let distinct: Vec<&str> = [
            ("snapshot_id", out.identity.distinct_snapshot_id),
            ("agent_id", out.identity.distinct_agent_id),
            ("branch_id", out.identity.distinct_branch_id),
        ]
        .into_iter()
        .filter_map(|(name, differs)| differs.then_some(name))
        .collect();

        if distinct.is_empty() {
            println!("identity: same snapshot on both sides");
        } else {
            println!("identity differs: {}", distinct.join(", "));
        }
        return;
    }

    print!("{}", out.diff.to_text());
    println!(
        "{} changed path{}",
        out.entry_count,
        if out.entry_count == 1 { "" } else { "s" }
    );
}

async fn cmd_snapshot_set_cognition(args: SnapshotSetCognitionArgs) -> Result<()> {
    let snapshot_store = snapshot_store_from(args.snapshots, &args.root);
    let mut snapshot = resolve_snapshot_ref(&args.snapshot, &snapshot_store).await?;

    let mut changed = Vec::new();

    if let Some(exploration) = args.exploration {
        changed.push(CognitionChange {
            field: "genome.cognition.exploration".to_string(),
            previous: snapshot.genome.cognition.exploration.to_string(),
            value: exploration.to_string(),
        });
        snapshot.genome.cognition.exploration = exploration;
    }

    if let Some(threshold) = args.verification_threshold {
        changed.push(CognitionChange {
            field: "genome.cognition.verification_threshold".to_string(),
            previous: snapshot.genome.cognition.verification_threshold.to_string(),
            value: threshold.to_string(),
        });
        snapshot.genome.cognition.verification_threshold = threshold;
    }

    if let Some(depth) = args.planning_depth {
        changed.push(CognitionChange {
            field: "genome.cognition.planning_depth".to_string(),
            previous: snapshot.genome.cognition.planning_depth.to_string(),
            value: depth.to_string(),
        });
        snapshot.genome.cognition.planning_depth = depth;
    }

    if changed.is_empty() {
        bail!(
            "nothing to change: pass at least one of --exploration, --verification-threshold, --planning-depth"
        );
    }

    // The genome id and version are left alone on purpose: this tunes a value
    // on one branch, it does not publish a new genome version.
    let out_path = args.out.or_else(|| {
        let path = PathBuf::from(&args.snapshot);
        path.is_file().then_some(path)
    });
    if let Some(path) = &out_path {
        write_serialized(path, &snapshot, OutputFormat::Json)?;
    }

    let out = SnapshotSetCognitionOutput {
        snapshot_id: snapshot.snapshot_id.0.clone(),
        branch_id: snapshot.branch_id.0.clone(),
        genome_id: snapshot.genome.id.0.clone(),
        changed,
        out_path: out_path.map(|path| path.display().to_string()),
        snapshot_store_path: args
            .save
            .then(|| snapshot_store.file_path().display().to_string()),
    };

    if args.save {
        snapshot_store.save_snapshot(snapshot).await?;
    }

    print_serialized(&out, args.format)
}

async fn cmd_snapshot_set_var(args: SnapshotSetVarArgs) -> Result<()> {
    let snapshot_store = snapshot_store_from(args.snapshots, &args.root);
    let mut snapshot = resolve_snapshot_ref(&args.snapshot, &snapshot_store).await?;

    let write = write_variable_on_branch(&mut snapshot, &args.key, &args.value);

    // A write advances the branch it happened on, so by default it lands back in
    // the file that snapshot came from.
    let out_path = args.out.or_else(|| {
        let path = PathBuf::from(&args.snapshot);
        path.is_file().then_some(path)
    });
    if let Some(path) = &out_path {
        write_serialized(path, &snapshot, OutputFormat::Json)?;
    }

    let event_store = if args.emit_events {
        Some(event_store_from(args.events, &args.root))
    } else {
        None
    };
    let event_id = match &event_store {
        Some(store) => {
            let event_id = write.event.event_id.0.clone();
            store.append(write.event.clone()).await?;
            Some(event_id)
        }
        None => None,
    };

    let out = SnapshotSetVarOutput {
        snapshot_id: snapshot.snapshot_id.0.clone(),
        agent_id: snapshot.agent_id.0.clone(),
        branch_id: snapshot.branch_id.0.clone(),
        key: write.key,
        previous_value: write.previous_value,
        value: write.value,
        out_path: out_path.map(|path| path.display().to_string()),
        snapshot_store_path: args
            .save
            .then(|| snapshot_store.file_path().display().to_string()),
        event_store_path: event_store
            .as_ref()
            .map(|store| store.file_path().display().to_string()),
        event_id,
        event_sequence: write.event.sequence,
    };

    if args.save {
        snapshot_store.save_snapshot(snapshot).await?;
    }

    print_serialized(&out, args.format)
}

async fn cmd_snapshot_check_var(args: SnapshotCheckVarArgs) -> Result<()> {
    if args.branches.is_empty() {
        bail!("--branch is required at least once");
    }
    if !args.expects.is_empty() && args.expects.len() != args.branches.len() {
        bail!(
            "--expect must be given once per --branch, in the same order: got {} --branch and {} --expect",
            args.branches.len(),
            args.expects.len()
        );
    }

    let store = snapshot_store_from(args.store, &args.root);
    let parent = resolve_snapshot_ref(&args.parent, &store).await?;

    let mut branches = Vec::with_capacity(args.branches.len());
    for spec in &args.branches {
        branches.push(resolve_snapshot_ref(spec, &store).await?);
    }

    // Without an explicit expectation, a snapshot is expected to hold what it
    // already holds: the check then only proves the branches diverged.
    let parent_expected: Option<String> = if args.expect_parent_absent {
        None
    } else {
        args.expect_parent
            .clone()
            .or_else(|| parent.variable(&args.key).map(str::to_string))
    };
    let branch_expected: Vec<Option<String>> = branches
        .iter()
        .enumerate()
        .map(|(index, branch)| match args.expects.get(index) {
            Some(expected) => Some(expected.clone()),
            None => branch.variable(&args.key).map(str::to_string),
        })
        .collect();

    let expectations: Vec<VariableExpectation<'_>> = branches
        .iter()
        .zip(branch_expected.iter())
        .map(|(branch, expected)| VariableExpectation {
            snapshot: branch,
            expected: expected.as_deref(),
        })
        .collect();

    let report = check_variable_isolation(
        &args.key,
        VariableExpectation {
            snapshot: &parent,
            expected: parent_expected.as_deref(),
        },
        &expectations,
    );

    let out = SnapshotCheckVarOutput {
        parent_snapshot_id: parent.snapshot_id.0.clone(),
        branch_count: branches.len(),
        report,
    };
    print_serialized(&out, args.format)?;

    if args.expect_isolated && !out.report.isolated {
        bail!(
            "variable '{}' is not isolated across branches: {}",
            args.key,
            out.report.violations.join("; ")
        );
    }

    Ok(())
}

async fn cmd_agent_fork_from_snapshot(args: AgentForkFromSnapshotArgs) -> Result<()> {
    if args.count == 0 {
        bail!("--count must be at least 1");
    }

    let snapshot_store = snapshot_store_from(args.snapshots, &args.root);
    let parent = resolve_snapshot_ref(&args.snapshot, &snapshot_store).await?;

    let event_store = if args.emit_events {
        Some(event_store_from(args.events, &args.root))
    } else {
        None
    };

    // One correlation id ties the whole fan-out together across the sibling branches.
    let correlation_id = CorrelationId::new();
    let mut forks = Vec::with_capacity(args.count as usize);

    for index in 1..=args.count {
        let fork = fork_snapshot(&parent);
        let first_event_sequence = fork_first_event_sequence(&fork);

        let path = match &args.out_dir {
            Some(dir) => {
                let path = dir.join(format!("{}-{index}.json", args.out_prefix));
                write_serialized(&path, &fork, OutputFormat::Json)?;
                Some(path.display().to_string())
            }
            None => None,
        };

        let fork_event_id = match &event_store {
            Some(store) => {
                let event = AgentEvent {
                    event_id: EventId::new(),
                    agent_id: fork.agent_id.clone(),
                    branch_id: Some(fork.branch_id.clone()),
                    sequence: first_event_sequence,
                    timestamp: Utc::now(),
                    event_type: AgentEventType::ForkCreated,
                    payload: json!({
                        "parent_snapshot_id": parent.snapshot_id.0,
                        "parent_agent_id": parent.agent_id.0,
                        "parent_branch_id": parent.branch_id.0,
                        "fork_index": index,
                        "fork_snapshot_id": fork.snapshot_id.0,
                    }),
                    causation_id: None,
                    correlation_id: Some(correlation_id.clone()),
                };
                let event_id = event.event_id.0.clone();
                store.append(event).await?;
                Some(event_id)
            }
            None => None,
        };

        forks.push(ForkEntry {
            index,
            snapshot_id: fork.snapshot_id.0.clone(),
            agent_id: fork.agent_id.0.clone(),
            branch_id: fork.branch_id.0.clone(),
            first_event_sequence,
            path,
            fork_event_id,
        });

        if args.save {
            snapshot_store.save_snapshot(fork).await?;
        }
    }

    let out = AgentForkOutput {
        parent_snapshot_id: parent.snapshot_id.0.clone(),
        parent_agent_id: parent.agent_id.0.clone(),
        parent_branch_id: parent.branch_id.0.clone(),
        count: forks.len(),
        saved_to_store: args.save,
        snapshot_store_path: args
            .save
            .then(|| snapshot_store.file_path().display().to_string()),
        event_store_path: event_store
            .as_ref()
            .map(|store| store.file_path().display().to_string()),
        forks,
    };

    print_serialized(&out, args.format)
}

async fn cmd_world_create(args: WorldCreateArgs) -> Result<()> {
    let provider = provider_from_args(args.provider, args.root, args.seed, args.repo)?;
    let world_id = provider.create(AgentId::new(), BranchId::new()).await?;

    let out = WorldCreateOutput {
        provider: provider_name(args.provider).to_string(),
        world_id: world_id.0,
    };
    print_serialized(&out, args.format)
}

async fn cmd_world_snapshot(args: WorldSnapshotArgs) -> Result<()> {
    let provider = provider_from_args(args.provider, args.root, None, args.repo)?;
    let world_id = WorldId(args.world_id.clone());
    let snapshot_id = provider.snapshot(world_id).await?;

    let out = WorldSnapshotOutput {
        provider: provider_name(args.provider).to_string(),
        world_id: args.world_id,
        snapshot_id: snapshot_id.0,
    };
    print_serialized(&out, args.format)
}

async fn cmd_world_fork(args: WorldForkArgs) -> Result<()> {
    let provider = provider_from_args(args.provider, args.root, None, args.repo)?;
    let snapshot_id = SnapshotId(args.snapshot_id.clone());
    let worlds = provider.fork_many(snapshot_id, args.count).await?;

    let out = WorldForkOutput {
        provider: provider_name(args.provider).to_string(),
        parent_snapshot_id: args.snapshot_id,
        world_ids: worlds.into_iter().map(|w| w.0).collect(),
    };
    print_serialized(&out, args.format)
}

async fn cmd_world_diff(args: WorldDiffArgs) -> Result<()> {
    let provider = provider_from_args(args.provider, args.root, None, args.repo)?;
    let world_a = WorldId(args.world_a.clone());
    let world_b = WorldId(args.world_b.clone());
    let diff = provider.diff(world_a, world_b).await?;

    let out = WorldDiffOutput {
        provider: provider_name(args.provider).to_string(),
        world_a: args.world_a,
        world_b: args.world_b,
        files_changed: diff.files_changed,
    };
    print_serialized(&out, args.format)
}

async fn cmd_world_destroy(args: WorldDestroyArgs) -> Result<()> {
    let provider = provider_from_args(args.provider, args.root, None, args.repo)?;
    let world_id = WorldId(args.world_id.clone());
    let outcome = provider.destroy(world_id).await?;

    let status = match outcome {
        DestroyOutcome::Destroyed => "destroyed",
        DestroyOutcome::AlreadyAbsent => "already_absent",
    };

    let out = WorldDestroyOutput {
        provider: provider_name(args.provider).to_string(),
        world_id: args.world_id,
        status: status.to_string(),
    };
    print_serialized(&out, args.format)
}

async fn cmd_world_read_file(args: WorldReadFileArgs) -> Result<()> {
    let provider = provider_from_args(args.provider, args.root, None, args.repo)?;
    let world_id = WorldId(args.world_id.clone());
    let contents = provider.read_file(&world_id, &args.path).await?;

    let out = WorldReadFileOutput {
        provider: provider_name(args.provider).to_string(),
        world_id: args.world_id,
        path: args.path,
        found: contents.is_some(),
        contents,
    };
    print_serialized(&out, args.format)
}

async fn cmd_world_write_file(args: WorldWriteFileArgs) -> Result<()> {
    let provider = provider_from_args(args.provider, args.root, None, args.repo)?;
    let world_id = WorldId(args.world_id.clone());

    let previous_contents = provider.read_file(&world_id, &args.path).await?;
    provider
        .write_file(&world_id, &args.path, &args.contents)
        .await?;

    let out = WorldWriteFileOutput {
        provider: provider_name(args.provider).to_string(),
        world_id: args.world_id,
        path: args.path,
        created: previous_contents.is_none(),
        previous_contents,
        contents: args.contents,
    };
    print_serialized(&out, args.format)
}

async fn cmd_world_check_file(args: WorldCheckFileArgs) -> Result<()> {
    if args.branches.is_empty() {
        bail!("--branch is required at least once");
    }
    if !args.expects.is_empty() && args.expects.len() != args.branches.len() {
        bail!(
            "--expect must be given once per --branch, in the same order: got {} --branch and {} --expect",
            args.branches.len(),
            args.expects.len()
        );
    }

    let provider = provider_from_args(args.provider, args.root, None, args.repo)?;
    let parent_world = WorldId(args.parent.clone());

    // Without an explicit expectation, a world is expected to hold what it
    // already holds: the check then only proves the forks diverged.
    let parent_expectation = WorldFileExpectation {
        expected: if args.expect_parent_absent {
            None
        } else {
            match &args.expect_parent {
                Some(expected) => Some(expected.clone()),
                None => provider.read_file(&parent_world, &args.path).await?,
            }
        },
        world_id: parent_world,
    };

    let mut branch_expectations = Vec::with_capacity(args.branches.len());
    for (index, branch) in args.branches.iter().enumerate() {
        let world_id = WorldId(branch.clone());
        let expected = match args.expects.get(index) {
            Some(expected) => Some(expected.clone()),
            None => provider.read_file(&world_id, &args.path).await?,
        };
        branch_expectations.push(WorldFileExpectation { world_id, expected });
    }

    let report = check_file_isolation(
        provider.as_ref(),
        &args.path,
        &parent_expectation,
        &branch_expectations,
    )
    .await?;

    let out = WorldCheckFileOutput {
        provider: provider_name(args.provider).to_string(),
        parent_world_id: args.parent,
        branch_count: branch_expectations.len(),
        report,
    };
    print_serialized(&out, args.format)?;

    if args.expect_isolated && !out.report.isolated {
        bail!(
            "file '{}' is not isolated across worlds: {}",
            args.path,
            out.report.violations.join("; ")
        );
    }

    Ok(())
}

async fn cmd_replay_basic(args: ReplayBasicArgs) -> Result<()> {
    let anchor = match &args.snapshot {
        Some(spec) => {
            let store = snapshot_store_from(args.snapshots, &args.root);
            Some(resolve_snapshot_ref(spec, &store).await?)
        }
        None => None,
    };

    let branch_id = match &anchor {
        Some(snapshot) => Some(snapshot.branch_id.0.clone()),
        None => args.branch_id.clone(),
    };

    let store = event_store_from(args.events, &args.root);
    let replay_state = store.replay_basic_state(branch_id.clone()).await?;

    let out = ReplayBasicOutput {
        store_path: store.file_path().display().to_string(),
        branch_id,
        anchor_snapshot_id: anchor
            .as_ref()
            .map(|snapshot| snapshot.snapshot_id.0.clone()),
        state: replay_state,
    };

    print_serialized(&out, args.format)?;

    // A branch replayed from its own snapshot must never surface another agent:
    // that would mean the sibling streams converged.
    if let (Some(snapshot), Some(replayed)) = (&anchor, &out.state.agent_id) {
        if *replayed != snapshot.agent_id {
            bail!(
                "branch {} replayed to agent {} but is owned by agent {} in snapshot {}",
                snapshot.branch_id,
                replayed,
                snapshot.agent_id,
                snapshot.snapshot_id
            );
        }
    }

    if let Some(expected) = &args.expect_agent_id {
        let actual = out.state.agent_id.as_ref().map(|id| id.0.as_str());
        if actual != Some(expected.as_str()) {
            bail!(
                "expected replayed agent_id {expected}, got {}",
                actual.unwrap_or("none")
            );
        }
    }

    if let Some(expected) = &args.expect_branch_id {
        let actual = out.state.branch_id.as_ref().map(|id| id.0.as_str());
        if actual != Some(expected.as_str()) {
            bail!(
                "expected replayed branch_id {expected}, got {}",
                actual.unwrap_or("none")
            );
        }
    }

    if let Some(expected) = args.expect_last_sequence {
        if out.state.last_sequence != expected {
            bail!(
                "expected replayed last_sequence {expected}, got {}",
                out.state.last_sequence
            );
        }
    }

    Ok(())
}

async fn cmd_replay_from_snapshot(args: ReplayFromSnapshotArgs) -> Result<()> {
    let snapshot_store = snapshot_store_from(args.snapshots, &args.root);
    let event_store = event_store_from(args.events, &args.root);

    let snapshot = snapshot_store
        .get_snapshot(args.snapshot_id.clone())
        .await?
        .with_context(|| format!("snapshot {} not found", args.snapshot_id))?;

    let branch_id = snapshot.branch_id.0.clone();
    let base = basic_state_from_snapshot(&snapshot);
    let from_sequence = base.last_sequence;

    let mut events = event_store.stream(Some(branch_id.clone())).await?;
    events.retain(|e| e.sequence > from_sequence);
    events.sort_by_key(|e| e.sequence);

    let state = replay_basic_state_from(base, &events);

    let out = ReplayFromSnapshotOutput {
        snapshot_store_path: snapshot_store.file_path().display().to_string(),
        event_store_path: event_store.file_path().display().to_string(),
        snapshot_id: args.snapshot_id,
        branch_id,
        from_sequence_exclusive: from_sequence,
        replayed_events: events.len(),
        state,
    };

    print_serialized(&out, args.format)
}

fn provider_name(kind: WorldProviderKind) -> &'static str {
    match kind {
        WorldProviderKind::Directory => "directory",
        WorldProviderKind::GitWorktree => "git_worktree",
    }
}

fn provider_from_args(
    kind: WorldProviderKind,
    root: PathBuf,
    seed: Option<PathBuf>,
    repo: Option<PathBuf>,
) -> Result<Box<dyn WorldProvider>> {
    fs::create_dir_all(&root)?;

    match kind {
        WorldProviderKind::Directory => {
            Ok(Box::new(DirectoryWorldProvider::new(root, seed)?) as Box<dyn WorldProvider>)
        }
        WorldProviderKind::GitWorktree => {
            let repo = repo.context("--repo is required for provider git-worktree")?;
            Ok(Box::new(GitWorktreeWorldProvider::new(root, repo)?) as Box<dyn WorldProvider>)
        }
    }
}

fn snapshot_store_from(store: Option<PathBuf>, root: &Path) -> LocalSnapshotStore {
    match store {
        Some(path) => LocalSnapshotStore::new(path),
        None => LocalSnapshotStore::from_root(root),
    }
}

fn event_store_from(events: Option<PathBuf>, root: &Path) -> LocalEventStore {
    match events {
        Some(path) => LocalEventStore::new(path),
        None => LocalEventStore::from_root(root),
    }
}

/// Resolve a snapshot reference given either as a file path or as a snapshot id
/// held in `store`, so callers can chain commands without knowing which form the
/// caller happens to have at hand.
async fn resolve_snapshot_ref(spec: &str, store: &LocalSnapshotStore) -> Result<AgentSnapshot> {
    let path = Path::new(spec);
    if path.is_file() {
        return read_snapshot(path);
    }

    store
        .get_snapshot(spec.to_string())
        .await?
        .with_context(|| {
            format!(
                "snapshot '{spec}' is neither an existing file nor a snapshot id in {}",
                store.file_path().display()
            )
        })
}

/// Cognition weights are probabilities, so anything outside `0..=1` is a typo
/// rather than a decision.
fn unit_interval(raw: &str) -> Result<f32, String> {
    let value: f32 = raw
        .parse()
        .map_err(|_| format!("'{raw}' is not a number"))?;

    if !(0.0..=1.0).contains(&value) {
        return Err(format!("'{raw}' is outside 0..=1"));
    }

    Ok(value)
}

fn parse_working_memory_items(entries: &[String]) -> Result<Vec<WorkingMemoryItem>> {
    entries
        .iter()
        .map(|entry| {
            let (key, value) = entry
                .split_once('=')
                .with_context(|| format!("--memory expects KEY=VALUE, got '{entry}'"))?;
            if key.is_empty() {
                bail!("--memory expects a non-empty key, got '{entry}'");
            }
            Ok(WorkingMemoryItem {
                key: key.to_string(),
                value: value.to_string(),
            })
        })
        .collect()
}

fn read_genome(path: &Path) -> Result<AgentGenome> {
    let raw = fs::read_to_string(path)
        .with_context(|| format!("failed reading genome file {}", path.display()))?;
    if path.extension().and_then(|s| s.to_str()) == Some("json") {
        Ok(serde_json::from_str(&raw)?)
    } else {
        Ok(serde_yaml::from_str(&raw)?)
    }
}

fn read_snapshot(path: &Path) -> Result<AgentSnapshot> {
    let raw = fs::read_to_string(path)
        .with_context(|| format!("failed reading snapshot file {}", path.display()))?;
    if path.extension().and_then(|s| s.to_str()) == Some("json") {
        Ok(serde_json::from_str(&raw)?)
    } else {
        Ok(serde_yaml::from_str(&raw)?)
    }
}

fn write_serialized<T: serde::Serialize>(path: &Path, value: &T, format: OutputFormat) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    match format {
        OutputFormat::Json => fs::write(path, serde_json::to_string_pretty(value)?)?,
        OutputFormat::Yaml => fs::write(path, serde_yaml::to_string(value)?)?,
    }
    Ok(())
}

fn print_serialized<T: serde::Serialize>(value: &T, format: OutputFormat) -> Result<()> {
    match format {
        OutputFormat::Json => println!("{}", serde_json::to_string_pretty(value)?),
        OutputFormat::Yaml => println!("{}", serde_yaml::to_string(value)?),
    }
    Ok(())
}

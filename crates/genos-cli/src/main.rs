use anyhow::{Context, Result};
use chrono::Utc;
use clap::{Args, Parser, Subcommand, ValueEnum};
use genos_core::{
    AgentGenome, AgentId, AgentSnapshot, AgentState, BranchId, Capability, CognitionConfig,
    EventCursor, ExecutionMetadata, GenomeId, GenomeRef, GenomeVersion, Goal, Identity,
    MemoryPolicy, ModelPolicy, Objective, Policy, SemanticMemory, SnapshotId, ToolPermission,
    ToolPolicy, ToolState, WorkingMemory, WorldId, EpisodicMemory, RuntimeMetadata,
};
use genos_store::LocalEventStore;
use genos_world::{DestroyOutcome, DirectoryWorldProvider, GitWorktreeWorldProvider, WorldProvider};
use serde::Serialize;
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
struct SnapshotCommand {
    #[command(subcommand)]
    command: SnapshotSubcommands,
}

#[derive(Subcommand, Debug)]
enum SnapshotSubcommands {
    Create(SnapshotCreateArgs),
}

#[derive(Args, Debug)]
struct SnapshotCreateArgs {
    #[arg(long)]
    agent: PathBuf,
    #[arg(long)]
    out: Option<PathBuf>,
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
}

#[derive(Args, Debug)]
struct ReplayBasicArgs {
    #[arg(long, default_value = ".genos")]
    root: PathBuf,
    #[arg(long)]
    events: Option<PathBuf>,
    #[arg(long)]
    branch_id: Option<String>,
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
struct ReplayBasicOutput {
    store_path: String,
    branch_id: Option<String>,
    state: genos_store::BasicReplayState,
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();

    match cli.command {
        Commands::Init => cmd_init(),
        Commands::Agent(agent) => match agent.command {
            AgentSubcommands::Create(args) => cmd_agent_create(args),
            AgentSubcommands::Inspect(args) => cmd_agent_inspect(args),
        },
        Commands::Snapshot(snapshot) => match snapshot.command {
            SnapshotSubcommands::Create(args) => cmd_snapshot_create(args),
        },
        Commands::World(world) => match world.command {
            WorldSubcommands::Create(args) => cmd_world_create(args).await,
            WorldSubcommands::Snapshot(args) => cmd_world_snapshot(args).await,
            WorldSubcommands::Fork(args) => cmd_world_fork(args).await,
            WorldSubcommands::Diff(args) => cmd_world_diff(args).await,
            WorldSubcommands::Destroy(args) => cmd_world_destroy(args).await,
        },
        Commands::Replay(replay) => match replay.command {
            ReplaySubcommands::Basic(args) => cmd_replay_basic(args).await,
        },
    }
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
        working_memory: WorkingMemory { items: vec![] },
        semantic_memory: SemanticMemory { refs: vec![] },
        episodic_memory: EpisodicMemory { refs: vec![] },
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

async fn cmd_replay_basic(args: ReplayBasicArgs) -> Result<()> {
    let store = if let Some(path) = args.events {
        LocalEventStore::new(path)
    } else {
        LocalEventStore::from_root(args.root)
    };

    let replay_state = store.replay_basic_state(args.branch_id.clone()).await?;

    let out = ReplayBasicOutput {
        store_path: store.file_path().display().to_string(),
        branch_id: args.branch_id,
        state: replay_state,
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

fn read_genome(path: &Path) -> Result<AgentGenome> {
    let raw = fs::read_to_string(path)
        .with_context(|| format!("failed reading genome file {}", path.display()))?;
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

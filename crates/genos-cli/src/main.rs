use anyhow::{Context, Result};
use chrono::Utc;
use clap::{Args, Parser, Subcommand, ValueEnum};
use genos_core::{
    AgentGenome, AgentId, AgentSnapshot, AgentState, BranchId, CognitionConfig, EventCursor,
    ExecutionMetadata, GenomeId, GenomeRef, GenomeVersion, Goal, Identity, MemoryPolicy,
    ModelPolicy, Objective, Policy, SemanticMemory, SnapshotId, ToolPermission, ToolPolicy,
    ToolState, WorkingMemory, WorldId, EpisodicMemory, Capability, RuntimeMetadata,
};
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

#[derive(Clone, Copy, Debug, Eq, PartialEq, ValueEnum)]
enum OutputFormat {
    Json,
    Yaml,
}

fn main() -> Result<()> {
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
    }
}

fn cmd_init() -> Result<()> {
    fs::create_dir_all(".genos/agents")?;
    fs::create_dir_all(".genos/snapshots")?;
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

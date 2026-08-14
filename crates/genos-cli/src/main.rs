mod args;
mod cmd_agent;
mod cmd_experiment;
mod cmd_inspect;
mod cmd_replay;
mod cmd_snapshot;
mod cmd_world;
mod output;
mod resolve;

use anyhow::Result;
use clap::Parser;

use crate::args::{
    AgentSubcommands, Cli, Commands, ExperimentSubcommands, InspectSubcommands, ReplaySubcommands,
    SnapshotSubcommands, WorldSubcommands,
};
use crate::cmd_agent::{
    cmd_agent_create, cmd_agent_fork_from_snapshot, cmd_agent_inspect, cmd_init,
};
use crate::cmd_experiment::{
    cmd_experiment_incident, cmd_experiment_scientific, cmd_experiment_temporal,
    cmd_experiment_workspace,
};
use crate::cmd_inspect::cmd_inspect_belief;
use crate::cmd_replay::{cmd_diff, cmd_replay_basic, cmd_replay_from_snapshot};
use crate::cmd_snapshot::{
    cmd_snapshot_add_memory, cmd_snapshot_check_var, cmd_snapshot_checkpoint, cmd_snapshot_compare,
    cmd_snapshot_create, cmd_snapshot_get, cmd_snapshot_lineage, cmd_snapshot_list,
    cmd_snapshot_record_tool_call, cmd_snapshot_restore, cmd_snapshot_save,
    cmd_snapshot_set_belief, cmd_snapshot_set_cognition, cmd_snapshot_set_var,
};
use crate::cmd_world::{
    cmd_world_check_file, cmd_world_create, cmd_world_destroy, cmd_world_diff, cmd_world_fork,
    cmd_world_read_file, cmd_world_snapshot, cmd_world_write_file,
};

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
        Commands::Experiment(experiment) => match experiment.command {
            ExperimentSubcommands::Workspace(args) => cmd_experiment_workspace(args).await,
            ExperimentSubcommands::Temporal(args) => cmd_experiment_temporal(args),
            ExperimentSubcommands::Incident(args) => cmd_experiment_incident(args),
            ExperimentSubcommands::Scientific(args) => cmd_experiment_scientific(args),
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
            SnapshotSubcommands::AddMemory(args) => cmd_snapshot_add_memory(args).await,
            SnapshotSubcommands::SetBelief(args) => cmd_snapshot_set_belief(args).await,
            SnapshotSubcommands::RecordToolCall(args) => cmd_snapshot_record_tool_call(args).await,
            SnapshotSubcommands::Restore(args) => cmd_snapshot_restore(args).await,
            SnapshotSubcommands::Checkpoint(args) => cmd_snapshot_checkpoint(args).await,
            SnapshotSubcommands::Lineage(args) => cmd_snapshot_lineage(args).await,
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
        Commands::Inspect(inspect) => match inspect.command {
            InspectSubcommands::Belief(args) => cmd_inspect_belief(args).await,
        },
        Commands::Diff(args) => cmd_diff(args).await,
    }
}

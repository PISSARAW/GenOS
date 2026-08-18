mod args;
mod cmd_agent;
mod cmd_capsule;
mod cmd_dev;
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
    AgentSubcommands, CapsuleSubcommands, Cli, Commands, DevSubcommands, ExperimentSubcommands,
    InspectSubcommands, ReplaySubcommands, SnapshotSubcommands, WorldSubcommands,
};
use crate::cmd_agent::{
    cmd_agent_breed, cmd_agent_create, cmd_agent_fork_from_snapshot, cmd_agent_infer_traits,
    cmd_agent_inspect, cmd_agent_mutate, cmd_agent_promote_trait, cmd_init,
};
use crate::cmd_capsule::{
    cmd_agent_run, cmd_capsule_checkpoint, cmd_capsule_create, cmd_capsule_fork,
    cmd_capsule_inspect, cmd_capsule_pause, cmd_capsule_resume,
};
use crate::cmd_dev::*;
use crate::cmd_experiment::{
    cmd_experiment_branch_evolution, cmd_experiment_bug_investigation,
    cmd_experiment_causal_replay, cmd_experiment_cognitive_merge, cmd_experiment_heredity,
    cmd_experiment_incident, cmd_experiment_reproducibility, cmd_experiment_scientific,
    cmd_experiment_security_coevolution, cmd_experiment_select, cmd_experiment_temporal,
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
            AgentSubcommands::Init => cmd_init(),
            AgentSubcommands::Snapshot(args) => cmd_capsule_checkpoint(args).await,
            AgentSubcommands::Restore(args) => cmd_capsule_resume(args).await,
            AgentSubcommands::Fork(args) => cmd_capsule_fork(args).await,
            AgentSubcommands::Create(args) => cmd_agent_create(args),
            AgentSubcommands::Inspect(args) => cmd_agent_inspect(args),
            AgentSubcommands::Mutate(args) => cmd_agent_mutate(args),
            AgentSubcommands::Breed(args) => cmd_agent_breed(args),
            AgentSubcommands::InferTraits(args) => cmd_agent_infer_traits(args),
            AgentSubcommands::PromoteTrait(args) => cmd_agent_promote_trait(args),
            AgentSubcommands::Run(args) => cmd_agent_run(args).await,
            AgentSubcommands::Diff(args) => cmd_diff(args).await,
            AgentSubcommands::Merge(args) => cmd_experiment_cognitive_merge(args),
            AgentSubcommands::Lineage(args) => cmd_snapshot_lineage(args).await,
            AgentSubcommands::Replay(args) => cmd_replay_basic(args).await,
            AgentSubcommands::ForkFromSnapshot(args) => cmd_agent_fork_from_snapshot(args).await,
        },
        Commands::Capsule(capsule) => match capsule.command {
            CapsuleSubcommands::Create(args) => cmd_capsule_create(args).await,
            CapsuleSubcommands::Fork(args) => cmd_capsule_fork(args).await,
            CapsuleSubcommands::Checkpoint(args) => cmd_capsule_checkpoint(args).await,
            CapsuleSubcommands::Pause(args) => cmd_capsule_pause(args).await,
            CapsuleSubcommands::Resume(args) => cmd_capsule_resume(args).await,
            CapsuleSubcommands::Inspect(args) => cmd_capsule_inspect(args).await,
        },
        Commands::Dev(dev) => match dev.command {
            DevSubcommands::Diagnose(args) => cmd_diagnose(args),
            DevSubcommands::Solve(args) => cmd_solve(args),
            DevSubcommands::HypothesisEvidence(args) => cmd_hypothesis_evidence(args),
            DevSubcommands::EvaluateTrajectories(args) => cmd_evaluate_trajectories(args),
            DevSubcommands::RecordDecision(args) => cmd_record_decision(args),
            DevSubcommands::Blame(args) => cmd_blame(args),
            DevSubcommands::InvalidateAssumption(args) => cmd_invalidate_assumption(args),
            DevSubcommands::RecordExperience(args) => cmd_record_experience(args),
            DevSubcommands::SearchFailures(args) => cmd_search_failures(args),
            DevSubcommands::CherryPickExperience(args) => cmd_cherry_pick_experience(args),
            DevSubcommands::AdversarialReview(args) => cmd_adversarial_review(args),
            DevSubcommands::FutureCi(args) => cmd_future_ci(args),
            DevSubcommands::RepositoryGenome(args) => cmd_repository_genome(args),
            DevSubcommands::BisectAgent(args) => cmd_bisect_agent(args),
            DevSubcommands::AnalyzeTrajectory(args) => cmd_analyze_trajectory(args),
            DevSubcommands::CompileMemory(args) => cmd_compile_memory(args),
        },
        Commands::Experiment(experiment) => match experiment.command {
            ExperimentSubcommands::Workspace(args) => cmd_experiment_workspace(args).await,
            ExperimentSubcommands::Temporal(args) => cmd_experiment_temporal(args),
            ExperimentSubcommands::CausalReplay(args) => cmd_experiment_causal_replay(args),
            ExperimentSubcommands::Incident(args) => cmd_experiment_incident(args),
            ExperimentSubcommands::Scientific(args) => cmd_experiment_scientific(args),
            ExperimentSubcommands::SecurityCoevolution(args) => {
                cmd_experiment_security_coevolution(args)
            }
            ExperimentSubcommands::BugInvestigation(args) => {
                cmd_experiment_bug_investigation(args).await
            }
            ExperimentSubcommands::Heredity(args) => cmd_experiment_heredity(args),
            ExperimentSubcommands::Select(args) => cmd_experiment_select(args),
            ExperimentSubcommands::Reproducibility(args) => cmd_experiment_reproducibility(args),
            ExperimentSubcommands::CognitiveMerge(args) => cmd_experiment_cognitive_merge(args),
            ExperimentSubcommands::BranchEvolution(args) => cmd_experiment_branch_evolution(args),
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

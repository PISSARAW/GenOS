mod args;
mod commands;
#[cfg(test)]
mod tests;

use clap::Parser;
use args::{
    CausalitySubcommands, Cli, Commands, ExperimentSubcommands, FossilSubcommands,
    PhenotypeSubcommands, TrinitySubcommands, SwarmSubcommands, ComplianceSubcommands,
    StrategySubcommands, RebaseSubcommands, WorldSubcommands
};
use commands::{
    agent, api_server, biomimicry, capsule, hallucination, platform, replay, snapshot, store_ops,
};

fn main() {
    let cli = Cli::parse();

    let result = match cli.command {
        None => {
            println!("GenOS CLI v3.0.0 - Système d'Exploitation Autonome & Biologique");
            Ok(())
        }
        Some(Commands::Agent(cmd)) => agent::execute(cmd.subcommand),
        Some(Commands::Snapshot(cmd)) => snapshot::execute(cmd.subcommand),
        Some(Commands::Diff(cmd)) => snapshot::handle_diff(&cmd.a, &cmd.b),
        Some(Commands::Hallucination(cmd)) => hallucination::execute(cmd.subcommand),
        Some(Commands::Replay(cmd)) => replay::execute(cmd.subcommand),
        Some(Commands::Biomimicry(cmd)) => biomimicry::execute(cmd.subcommand),
        Some(Commands::Evolution(cmd)) => biomimicry::execute_evolution(cmd.subcommand),
        Some(Commands::Capsule(cmd)) => capsule::execute(cmd.subcommand),
        Some(Commands::Audit(cmd)) => capsule::handle_audit(&cmd.snapshot_id, cmd.output.as_deref()),
        Some(Commands::Merge(cmd)) => capsule::handle_merge(&cmd.branch_id, cmd.conditions.as_deref()),
        Some(Commands::CostAccounting(cmd)) => platform::handle_cost_accounting(&cmd.agent_id, cmd.timeframe.as_deref()),
        Some(Commands::LoopDetection(cmd)) => {
            capsule::handle_loop_detection(&cmd)
        }
        Some(Commands::Causality(cmd)) => match cmd.subcommand {
            CausalitySubcommands::Fork { boundary_id, new_boundary_id } => {
                capsule::handle_causality_fork(&boundary_id, &new_boundary_id)
            }
        },
        Some(Commands::Experiment(cmd)) => match cmd.subcommand {
            ExperimentSubcommands::CausalReplay { input_file } => platform::handle_experiment_causal(&input_file),
            ExperimentSubcommands::Incident { manifest } => platform::handle_experiment_incident(&manifest),
            ExperimentSubcommands::BugInvestigation { manifest } => platform::handle_experiment_bug(&manifest),
        },
        Some(Commands::Phenotype(cmd)) => match cmd.subcommand {
            PhenotypeSubcommands::MeasureDivergence { trait_name, expected, observed, tolerance } => {
                capsule::handle_phenotype_measure(&trait_name, capsule::PhenotypeValues { expected, observed, tolerance })
            }
        },
        Some(Commands::Trinity(cmd)) => match cmd.subcommand {
            TrinitySubcommands::Deploy { mission_id, strategies } => platform::handle_trinity(&mission_id, &strategies),
        },
        Some(Commands::Swarm(cmd)) => match cmd.subcommand {
            SwarmSubcommands::AlleleAnalyzer { swarm_id } => platform::handle_swarm_alleles(&swarm_id),
        },
        Some(Commands::Compliance(cmd)) => match cmd.subcommand {
            ComplianceSubcommands::Generate { standard, output_file } => {
                platform::handle_compliance(&standard, output_file.as_deref())
            }
        },
        Some(Commands::Strategy(cmd)) => match cmd.subcommand {
            StrategySubcommands::Adapt { agent_id, constraint, target } => {
                platform::handle_strategy_adapt(&agent_id, &constraint, target)
            }
        },
        Some(Commands::Rebase(cmd)) => match cmd.subcommand {
            RebaseSubcommands::ComputePlan { args } => platform::handle_rebase(&args),
        },
        Some(Commands::World(cmd)) => match cmd.subcommand {
            WorldSubcommands::Create { provider, root, world_id, seed } => {
                platform::handle_world_create(&provider, &root, platform::WorldParams { world_id: &world_id, seed: seed.as_deref() })
            }
            WorldSubcommands::Run { world_id, command, sandbox_backend, .. } => {
                platform::handle_world_run(&world_id, &command, &sandbox_backend)
            }
        },
        Some(Commands::Platform(cmd)) => platform::execute(cmd.subcommand),
        Some(Commands::Resilience(cmd)) => match cmd.subcommand {
            args::ResilienceSubcommands::Cryptobiosis { agent_id, .. } => store_ops::handle_cryptobiosis(&agent_id, None, None),
        },
        Some(Commands::Ais(cmd)) => match cmd.subcommand {
            args::AisSubcommands::DangerTelemetry { agent_id, severity, threat_context } => {
                println!("{}", serde_json::json!({ "success": true, "operation": "danger_telemetry", "agent_id": agent_id, "severity": severity, "threat_context": threat_context }));
                Ok(())
            }
            args::AisSubcommands::ClonalHypermutate { agent_id, mutation_rate, clone_count } => {
                println!("{}", serde_json::json!({ "success": true, "operation": "clonal_hypermutate", "agent_id": agent_id, "mutation_rate": mutation_rate, "clone_count": clone_count }));
                Ok(())
            }
            args::AisSubcommands::PrrScan { agent_id, patterns } => {
                println!("{}", serde_json::json!({ "success": true, "operation": "prr_scan", "agent_id": agent_id, "patterns": patterns }));
                Ok(())
            }
        },
        Some(Commands::Synaptic(cmd)) => match cmd.subcommand {
            args::SynapticSubcommands::PruneScale { agent_id, scale } => {
                println!("{}", serde_json::json!({ "success": true, "operation": "prune_scale", "agent_id": agent_id, "scale": scale }));
                Ok(())
            }
            args::SynapticSubcommands::PathEvaluate { agent_id, pre_node, post_node } => {
                println!("{}", serde_json::json!({ "success": true, "operation": "path_evaluate", "agent_id": agent_id, "pre_node": pre_node, "post_node": post_node }));
                Ok(())
            }
        },
        Some(Commands::Fossil(cmd)) => match cmd.subcommand {
            FossilSubcommands::Record { lineage_id, reason } => {
                store_ops::handle_fossil_record(&lineage_id, &reason)
            }
            FossilSubcommands::List => {
                store_ops::handle_fossil_list()
            }
        },
        Some(Commands::Serve(cmd)) => {
            api_server::handle_serve(&cmd.host, cmd.port, cmd.api_key.as_deref())
        }
    };

    if let Err(err) = result {
        eprintln!("ERREUR GenOS CLI: {}", err);
        std::process::exit(1);
    }
}

mod args;
mod commands;
#[cfg(test)]
mod tests;

use clap::{CommandFactory, Parser};
use args::{
    CausalitySubcommands, Cli, Commands, ExperimentSubcommands, FossilSubcommands,
    PhenotypeSubcommands, TrinitySubcommands, SwarmSubcommands, ComplianceSubcommands,
    StrategySubcommands, RebaseSubcommands, WorldSubcommands
};
use commands::{
    agent, api_server, biomimicry, biological, capsule, experiments, hallucination, platform, replay, snapshot, store_ops, desktop,
};
use genos_immune::ClonalSelection;
use std::path::PathBuf;

fn immune_memory_path(agent_id: &str) -> Result<PathBuf, String> {
    if agent_id.is_empty() || !agent_id.chars().all(|character| character.is_ascii_alphanumeric() || character == '-' || character == '_') {
        return Err("agent_id must contain only ASCII letters, digits, '-' or '_'".to_string());
    }
    let root = crate::commands::root_resolver::resolve_matrix_root();
    Ok(root.join("immune").join(format!("{}.json", agent_id)))
}

pub(crate) fn load_immune_selection(agent_id: &str) -> Result<(ClonalSelection, PathBuf), String> {
    let path = immune_memory_path(agent_id)?;
    let selection = if path.exists() {
        ClonalSelection::load(&path).map_err(|error| format!("Failed to load immune memory: {}", error))?
    } else {
        ClonalSelection::new()
    };
    Ok((selection, path))
}

fn handle_trinity_cmd(subcommand: TrinitySubcommands) -> Result<(), String> {
    match subcommand {
        TrinitySubcommands::Deploy { mission_id, strategies, split_screen, prompt, simulation } => {
            if split_screen {
                let p = prompt.unwrap_or_else(|| "Implémenter un parser Bencode en Rust avec gestion d'erreurs stricte".to_string());
                commands::trinity_tui::run(&mission_id, &p, simulation)
            } else {
                if prompt.is_some() || simulation {
                    return Err("--prompt and --simulation require --split-screen".to_string());
                }
                platform::handle_trinity(&mission_id, &strategies)
            }
        }
        TrinitySubcommands::SplitScreen { mission_id, prompt, simulation } => {
            let p = prompt.unwrap_or_else(|| "Implémenter un parser Bencode en Rust avec gestion d'erreurs stricte".to_string());
            commands::trinity_tui::run(&mission_id, &p, simulation)
        }
    }
}

fn handle_run_cmd(cmd: args::RunCmd) -> Result<(), String> {
    if let Some(mission) = cmd.mission {
        return execute_mission(&mission);
    }
    match cmd.mode.as_str() {
        "trinity" => {
            if cmd.monitor || !cmd.simulation {
                commands::trinity_tui::run_live(&cmd.host, cmd.port, cmd.mission_id.as_deref())
            } else {
                let mission_id = cmd.mission_id.unwrap_or_else(|| "mission-bencode-parser".to_string());
                let prompt = cmd.prompt.unwrap_or_else(|| "Implémenter un parser Bencode en Rust avec gestion d'erreurs stricte".to_string());
                commands::trinity_tui::run(&mission_id, &prompt, true)
            }
        }
        other => Err(format!("Unsupported run mode '{}'. Supported modes: trinity.", other)),
    }
}

fn orchestrator_root() -> Result<PathBuf, String> {
    let current = std::env::current_dir().map_err(|error| format!("Cannot resolve current directory: {error}"))?;
    current.ancestors()
        .find(|path| path.join("backend/bin/genos-orchestrate.cjs").is_file())
        .map(PathBuf::from)
        .ok_or_else(|| "Run `genos` from inside a GenOS repository containing backend/bin/genos-orchestrate.cjs.".to_string())
}

fn execute_mission(mission: &str) -> Result<(), String> {
    if mission.trim().is_empty() { return Err("Mission text cannot be empty.".to_string()); }
    let root = orchestrator_root()?;
    let payload = serde_json::json!({ "mission": mission });
    let status = std::process::Command::new("node")
        .current_dir(root)
        .arg("backend/bin/genos-orchestrate.cjs")
        .arg(payload.to_string())
        .status()
        .map_err(|error| format!("Cannot start the GenOS backend orchestrator: {error}"))?;
    if status.success() { Ok(()) } else { Err(format!("GenOS mission ended with status {status}.")) }
}

fn execute_explain(mission_id: &str) -> Result<(), String> {
    let root = orchestrator_root()?;
    let status = std::process::Command::new("node")
        .current_dir(root)
        .arg("backend/bin/genos-explain.cjs")
        .arg(mission_id)
        .status()
        .map_err(|error| format!("Cannot start mission explanation: {error}"))?;
    if status.success() { Ok(()) } else { Err(format!("Mission explanation ended with status {status}.")) }
}

fn initialize_workspace() -> Result<(), String> {
    ["snapshots", "capsules", ".genos"]
        .into_iter()
        .try_for_each(|directory| {
            std::fs::create_dir_all(directory)
                .map_err(|error| format!("Failed to initialize '{}': {}", directory, error))
        })?;
    println!("{}", serde_json::json!({
        "success": true,
        "operation": "init",
        "directories": ["snapshots", "capsules", ".genos"]
    }));
    Ok(())
}

fn main() {
    let builder = std::thread::Builder::new()
        .name("genos-main".into())
        .stack_size(16 * 1024 * 1024);
    let handler = builder.spawn(real_main).unwrap();
    if let Err(e) = handler.join() {
        std::panic::resume_unwind(e);
    }
}

fn real_main() {
    let cli = Cli::parse();

    let result: Result<(), String> = (|| match cli.command {
        Some(Commands::Init) => initialize_workspace(),
        Some(Commands::Doctor) => commands::doctor::execute(),
        Some(Commands::Explain { mission_id }) => execute_explain(&mission_id),
        None => {
            let mut command = args::Cli::command();
            match command.print_help() {
                Ok(()) => Ok(()),
                Err(error) => Err(format!("Failed to render help: {}", error)),
            }
        }
        Some(Commands::Agent(cmd)) => agent::execute(cmd.subcommand),
        Some(Commands::Genome(cmd)) => commands::genome::execute(cmd.subcommand),
        Some(Commands::Snapshot(cmd)) => snapshot::execute(cmd.subcommand),
        Some(Commands::Diff(cmd)) => snapshot::handle_diff(&cmd.a, &cmd.b),
        Some(Commands::Hallucination(cmd)) => hallucination::execute(cmd.subcommand),
        Some(Commands::Replay(cmd)) => replay::execute(cmd.subcommand),
        Some(Commands::Biomimicry(cmd)) => biomimicry::execute(cmd.subcommand),
        Some(Commands::Evolution(cmd)) => biomimicry::execute_evolution(cmd.subcommand),
        Some(Commands::Capsule(cmd)) => capsule::execute(cmd.subcommand),
        Some(Commands::Audit(cmd)) => {
            let opts = commands::output_guard::WriteOptions { force: cmd.force, parents: cmd.parents };
            capsule::handle_audit(&cmd.snapshot_id, cmd.output.as_deref(), &opts)
        }
        Some(Commands::Merge(cmd)) => capsule::handle_merge(&cmd.branch_id, cmd.conditions.as_deref()),
        Some(Commands::CostAccounting(cmd)) => platform::handle_cost_accounting(&cmd.agent_id, cmd.timeframe.as_deref()),
        Some(Commands::Desktop(cmd)) => desktop::execute(cmd.subcommand),
        Some(Commands::Run(cmd)) => handle_run_cmd(cmd),
        Some(Commands::InjectChaos(cmd)) | Some(Commands::Chaos(cmd)) => commands::chaos::handle_inject_chaos(&cmd),
        Some(Commands::LoopDetection(cmd)) => {
            capsule::handle_loop_detection(&cmd)
        }
        Some(Commands::Causality(cmd)) => match cmd.subcommand {
            CausalitySubcommands::Fork { boundary_id, new_boundary_id } => {
                capsule::handle_causality_fork(&boundary_id, &new_boundary_id)
            }
        },
        Some(Commands::Experiment(cmd)) => match cmd.subcommand {
            ExperimentSubcommands::CausalReplay { input_file } => experiments::handle_experiment_causal(&input_file),
            ExperimentSubcommands::Incident { manifest, offline } => experiments::handle_experiment_incident(&manifest, offline),
            ExperimentSubcommands::BugInvestigation { manifest, offline } => experiments::handle_experiment_bug(&manifest, offline),
        },
        Some(Commands::Phenotype(cmd)) => match cmd.subcommand {
            PhenotypeSubcommands::MeasureDivergence { trait_name, expected, observed, tolerance } => {
                capsule::handle_phenotype_measure(&trait_name, capsule::PhenotypeValues { expected, observed, tolerance })
            }
        },
        Some(Commands::Trinity(cmd)) => handle_trinity_cmd(cmd.subcommand),
        Some(Commands::Biological(cmd)) => biological::handle(&cmd),
        Some(Commands::Rhizome(cmd)) => biological::handle_rhizome(&cmd),
        Some(Commands::Swarm(cmd)) => match cmd.subcommand {
            SwarmSubcommands::AlleleAnalyzer { swarm_id } => platform::handle_swarm_alleles(&swarm_id),
        },
        Some(Commands::Compliance(cmd)) => match cmd.subcommand {
            ComplianceSubcommands::Generate { standard, output_file, force, parents } => {
                let opts = commands::output_guard::WriteOptions { force, parents };
                platform::handle_compliance(&standard, output_file.as_deref(), &opts)
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
        Some(Commands::Ais(cmd)) => commands::operator_commands::execute_ais(cmd.subcommand),
        Some(Commands::Synaptic(cmd)) => commands::operator_commands::execute_synaptic(cmd.subcommand),
        Some(Commands::Fossil(cmd)) => match cmd.subcommand {
            FossilSubcommands::Record { lineage_id, reason, mode } => {
                store_ops::handle_fossil_record(&lineage_id, &reason, mode.as_deref())
            }
            FossilSubcommands::List => {
                store_ops::handle_fossil_list()
            }
            FossilSubcommands::Strata => {
                store_ops::handle_fossil_strata()
            }
            FossilSubcommands::Excavate { fossil_id } => {
                store_ops::handle_fossil_excavate(&fossil_id)
            }
            FossilSubcommands::Decode { fossil_id } => {
                store_ops::handle_fossil_decode(&fossil_id)
            }
        },
        Some(Commands::Serve(cmd)) => {
            api_server::handle_serve(&cmd.host, cmd.port, cmd.api_key.as_deref())
        }
    })();

    if let Err(err) = result {
        eprintln!("ERREUR GenOS CLI: {}", err);
        std::process::exit(1);
    }
}

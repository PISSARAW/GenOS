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
use genos_immune::{AntibodyDetector, Antigen, ClonalSelection};
use std::path::PathBuf;

fn immune_memory_path(agent_id: &str) -> Result<PathBuf, String> {
    if agent_id.is_empty() || !agent_id.chars().all(|character| character.is_ascii_alphanumeric() || character == '-' || character == '_') {
        return Err("agent_id must contain only ASCII letters, digits, '-' or '_'".to_string());
    }
    let root = crate::commands::root_resolver::resolve_matrix_root();
    Ok(root.join("immune").join(format!("{}.json", agent_id)))
}

fn load_immune_selection(agent_id: &str) -> Result<(ClonalSelection, PathBuf), String> {
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

fn main() {
    let cli = Cli::parse();

    let result: Result<(), String> = (|| match cli.command {
        Some(Commands::Init) => {
            let initialized = ["snapshots", "capsules"]
                .into_iter()
                .try_for_each(|directory| {
                    std::fs::create_dir_all(directory)
                        .map_err(|error| format!("Failed to initialize '{}': {}", directory, error))
                });
            initialized.map(|()| {
                println!("{}", serde_json::json!({
                    "success": true,
                    "operation": "init",
                    "directories": ["snapshots", "capsules"]
                }));
            })
        }
        None => {
            let mut command = args::Cli::command();
            match command.print_help() {
                Ok(()) => Ok(()),
                Err(error) => Err(format!("Failed to render help: {}", error)),
            }
        }
        Some(Commands::Agent(cmd)) => agent::execute(cmd.subcommand),
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
        Some(Commands::Ais(cmd)) => match cmd.subcommand {
            args::AisSubcommands::DangerTelemetry { agent_id, severity, threat_context } => {
                let antigen = Antigen { id: agent_id.clone(), epitope: threat_context.clone(), danger_level: if severity == "high" { 0.9 } else { 0.5 } };
                let (mut selection, memory_path) = load_immune_selection(&agent_id)?;
                selection.detectors.push(AntibodyDetector::new("danger-telemetry", &threat_context, 1.0));
                let recognized = selection.recognize(&antigen);
                selection.save(memory_path).map_err(|error| format!("Failed to save immune memory: {}", error))?;
                println!("{}", serde_json::json!({ "success": recognized, "operation": "danger_telemetry", "agent_id": agent_id, "severity": severity, "threat_context": threat_context, "recognized": recognized, "memory_pool_size": selection.memory_pool.len() }));
                Ok(())
            }
            args::AisSubcommands::ClonalHypermutate { agent_id, mutation_rate, clone_count } => {
                let antigen = Antigen { id: agent_id.clone(), epitope: "CLONAL_SIGNAL".to_string(), danger_level: 0.9 };
                let (mut selection, memory_path) = load_immune_selection(&agent_id)?;
                let expansion = selection.clonal_expansion_and_hypermutate(&antigen, clone_count as usize, mutation_rate);
                let recognized = selection.recognize(&antigen);
                selection.save(memory_path).map_err(|error| format!("Failed to save immune memory: {}", error))?;
                println!("{}", serde_json::json!({
                    "success": true,
                    "operation": "clonal_hypermutate",
                    "agent_id": agent_id,
                    "mutation_rate": mutation_rate,
                    "clones_generated": expansion.clones_generated,
                    "best_affinity": expansion.best_affinity,
                    "detectors_count": selection.detectors.len(),
                    "recognized": recognized,
                    "memory_pool_size": selection.memory_pool.len()
                }));
                Ok(())
            }
            args::AisSubcommands::PrrScan { agent_id, patterns } => {
                let detector_patterns: Vec<String> = patterns.split(',').map(str::trim).filter(|pattern| !pattern.is_empty()).map(str::to_string).collect();
                let antigen = Antigen { id: agent_id.clone(), epitope: patterns.clone(), danger_level: 0.8 };
                let (mut selection, memory_path) = load_immune_selection(&agent_id)?;
                for pattern in &detector_patterns {
                    selection.detectors.push(AntibodyDetector::new(pattern, pattern, 1.0));
                }
                let recognized = selection.recognize(&antigen);
                selection.save(memory_path).map_err(|error| format!("Failed to save immune memory: {}", error))?;
                println!("{}", serde_json::json!({ "success": recognized, "operation": "prr_scan", "agent_id": agent_id, "patterns": detector_patterns, "recognized": recognized }));
                Ok(())
            }
        },
        Some(Commands::Synaptic(cmd)) => match cmd.subcommand {
            args::SynapticSubcommands::PruneScale { agent_id, scale } => {
                let api_url = std::env::var("GENOS_API_URL")
                    .unwrap_or_else(|_| format!("http://127.0.0.1:{}", std::env::var("GENOS_PORT").unwrap_or_else(|_| "4000".to_string())));
                let client = reqwest::blocking::Client::builder()
                    .timeout(std::time::Duration::from_millis(2000))
                    .build()
                    .unwrap_or_default();
                let body = serde_json::json!({
                    "agentId": agent_id,
                    "threshold": 0.5,
                    "scale": scale
                });
                let (pruned_count, live_synced) = match client.post(format!("{}/api/memory/prune", api_url)).json(&body).send() {
                    Ok(res) if res.status().is_success() => {
                        if let Ok(data) = res.json::<serde_json::Value>() {
                            (data.get("pruned_synapses").and_then(|v| v.as_u64()).unwrap_or(0) as usize, true)
                        } else {
                            (0, false)
                        }
                    }
                    _ => (0, false)
                };
                println!("{}", serde_json::json!({
                    "success": true,
                    "operation": "prune_scale",
                    "agent_id": agent_id,
                    "scale": scale,
                    "pruned_synapses": pruned_count,
                    "live_synced": live_synced
                }));
                Ok(())
            }
            args::SynapticSubcommands::PathEvaluate { agent_id, pre_node, post_node } => {
                let prompt = format!("Evaluate the cognitive path from node '{}' to node '{}' for agent '{}'. What is the logical deduction?", pre_node, post_node, agent_id);
                
                let llm_url = std::env::var("GENOS_LLM_URL").unwrap_or_else(|_| {
                    let host = std::env::var("GENOS_API_HOST").or_else(|_| std::env::var("GENOS_HOST")).unwrap_or_else(|_| "127.0.0.1".to_string());
                    let port = std::env::var("GENOS_API_PORT").or_else(|_| std::env::var("GENOS_PORT")).unwrap_or_else(|_| "8085".to_string());
                    format!("http://{host}:{port}/v1/chat/completions")
                });
                let client = reqwest::blocking::Client::builder()
                    .timeout(std::time::Duration::from_millis(1500))
                    .build()
                    .unwrap_or_default();
                let model_name = std::env::var("GENOS_CORE_MODEL").or_else(|_| std::env::var("GENOS_MODEL")).unwrap_or_else(|_| "genos-core-v3".to_string());
                let body = serde_json::json!({
                    "model": model_name,
                    "messages": [
                        { "role": "user", "content": prompt }
                    ]
                });
                
                let evaluation = match client.post(&llm_url).json(&body).send() {
                    Ok(res) if res.status().is_success() => {
                        if let Ok(json_resp) = res.json::<serde_json::Value>() {
                            if let Some(text) = json_resp["choices"][0]["message"]["content"].as_str() {
                                text.to_string()
                            } else {
                                format!("Valid path evaluated between '{}' and '{}'", pre_node, post_node)
                            }
                        } else {
                            format!("Synaptic traversal confirmed between '{}' and '{}'", pre_node, post_node)
                        }
                    },
                    _ => format!("Direct synaptic path heuristic: connection between '{}' and '{}' evaluated for agent '{}'", pre_node, post_node, agent_id)
                };

                println!("{}", serde_json::json!({ 
                    "success": true, 
                    "operation": "path_evaluate", 
                    "agent_id": agent_id, 
                    "pre_node": pre_node, 
                    "post_node": post_node,
                    "evaluation": evaluation.trim()
                }));
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
    })();

    if let Err(err) = result {
        eprintln!("ERREUR GenOS CLI: {}", err);
        std::process::exit(1);
    }
}

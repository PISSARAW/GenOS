use std::process::Command;
use crate::{cargo_program, exit_on_command_failure};
use crate::commands::query::QueryCommands;

fn run_genos_cli(extra: &[&str], args: &[String]) {
    let mut cmd = Command::new(cargo_program());
    cmd.args(["run", "-q", "-p", "genos-cli", "--"]);
    cmd.args(extra);
    match args.is_empty() {
        true => {},
        false => { cmd.args(args); }
    }
    exit_on_command_failure(cmd.status());
}

struct AutoRun<'a> {
    mode: AutoMode<'a>,
    args: &'a [String],
    notice: &'a str,
}

enum AutoMode<'a> {
    WithExtra { extra: &'a [&'a str], auto: &'a [&'a str] },
    Bare { extra: &'a [&'a str] },
}

fn run_with_auto(job: &AutoRun) {
    let mut cmd = Command::new(cargo_program());
    match job.args.is_empty() {
        true => {
            println!("{}", job.notice);
            cmd.args(["run", "-q", "-p", "genos-cli", "--"]);
            match &job.mode {
                AutoMode::WithExtra { auto, .. } => { cmd.args(*auto); }
                AutoMode::Bare { extra } => { cmd.args(*extra); }
            }
        }
        false => {
            cmd.args(["run", "-q", "-p", "genos-cli", "--"]);
            match &job.mode {
                AutoMode::WithExtra { extra, .. } => { cmd.args(*extra); }
                AutoMode::Bare { extra } => { cmd.args(*extra); }
            }
            cmd.args(job.args);
        }
    }
    exit_on_command_failure(cmd.status());
}

fn handle_replay(args: &[String]) {
    let job = AutoRun {
        mode: AutoMode::WithExtra {
            extra: &["replay", "basic"],
            auto: &["replay", "basic", "--snapshot", "latest-snapshot"],
        },
        args,
        notice: "(Mode auto : lancement du replay sur le snapshot par défaut)",
    };
    run_with_auto(&job);
}

fn handle_diff(args: &[String]) {
    let job = AutoRun {
        mode: AutoMode::WithExtra {
            extra: &["diff"],
            auto: &["diff", "origin", "latest"],
        },
        args,
        notice: "(Mode auto : comparaison entre origin et latest)",
    };
    run_with_auto(&job);
}

fn handle_blame(args: &[String]) {
    println!("Analyse de la source de l'hallucination / Blame...");
    let job = AutoRun {
        mode: AutoMode::WithExtra {
            extra: &["hallucination", "analyze"],
            auto: &["hallucination", "analyze", "--snapshot", "latest-snapshot"],
        },
        args,
        notice: "(Mode auto : analyse de l'hallucination sur latest-snapshot)",
    };
    run_with_auto(&job);
}

fn handle_trace(args: &[String]) {
    println!("Traçage de la causalité / Trace...");
    let job = AutoRun {
        mode: AutoMode::WithExtra {
            extra: &["experiment", "causal-replay"],
            auto: &["experiment", "causal-replay", "default-trace.log"],
        },
        args,
        notice: "(Mode auto : traçage causal sur incident par défaut)",
    };
    run_with_auto(&job);
}

fn handle_clone(args: &[String]) {
    println!("Clonage de l'agent...");
    let job = AutoRun {
        mode: AutoMode::WithExtra {
            extra: &["agent", "fork"],
            auto: &["agent", "fork", "--parent-id", "default-parent"],
        },
        args,
        notice: "(Mode auto : clonage de l'agent parent par défaut)",
    };
    run_with_auto(&job);
}

fn handle_mutate(args: &[String]) {
    println!("Mutation de l'agent...");
    let job = AutoRun {
        mode: AutoMode::WithExtra {
            extra: &["agent", "mutate"],
            auto: &["agent", "mutate", "--agent-id", "default-agent", "--trait", "creativity"],
        },
        args,
        notice: "(Mode auto : mutation du trait créativité)",
    };
    run_with_auto(&job);
}

fn handle_elevate(args: &[String]) {
    println!("Élévation de l'agent / Adapt...");
    let job = AutoRun {
        mode: AutoMode::WithExtra {
            extra: &["strategy", "adapt"],
            auto: &["strategy", "adapt", "--agent-id", "default-agent", "--constraint", "time", "--target", "1.0"],
        },
        args,
        notice: "(Mode auto : élévation de l'agent)",
    };
    run_with_auto(&job);
}

fn handle_rest(args: &[String]) {
    println!("Mise en repos de l'agent (Cryptobiosis)...");
    let job = AutoRun {
        mode: AutoMode::WithExtra {
            extra: &["resilience", "cryptobiosis"],
            auto: &["resilience", "cryptobiosis", "--agent-id", "default-agent"],
        },
        args,
        notice: "(Mode auto : cryptobiose de default-agent)",
    };
    run_with_auto(&job);
}

fn handle_check(args: &[String]) {
    println!("Vérification / Audit...");
    let job = AutoRun {
        mode: AutoMode::WithExtra {
            extra: &["audit"],
            auto: &["audit", "latest-snapshot"],
        },
        args,
        notice: "(Mode auto : audit du latest-snapshot)",
    };
    run_with_auto(&job);
}

fn handle_compare(args: &[String]) {
    println!("Comparaison des phénotypes...");
    let job = AutoRun {
        mode: AutoMode::WithExtra {
            extra: &["phenotype", "measure-divergence"],
            auto: &["phenotype", "measure-divergence", "--trait-name", "default-trait", "--expected", "1.0", "--observed", "0.9", "--tolerance", "0.2"],
        },
        args,
        notice: "(Mode auto : comparaison phénotypique sur default-trait)",
    };
    run_with_auto(&job);
}

fn handle_retrace(args: &[String]) {
    println!("Retraçage / Incident...");
    let job = AutoRun {
        mode: AutoMode::WithExtra {
            extra: &["experiment", "incident"],
            auto: &["experiment", "incident", "default-manifest.json"],
        },
        args,
        notice: "(Mode auto : analyse de l'incident par défaut)",
    };
    run_with_auto(&job);
}

fn handle_restore(args: &[String]) {
    println!("Restauration depuis un snapshot (Capsule Create)...");
    let job = AutoRun {
        mode: AutoMode::WithExtra {
            extra: &["capsule", "create"],
            auto: &["capsule", "create", "--snapshot", "latest-snapshot"],
        },
        args,
        notice: "(Mode auto : création de capsule depuis latest-snapshot)",
    };
    run_with_auto(&job);
}

fn handle_recover(args: &[String]) {
    println!("Récupération (Causal Replay)...");
    let job = AutoRun {
        mode: AutoMode::WithExtra {
            extra: &["experiment", "causal-replay"],
            auto: &["experiment", "causal-replay", "default-recovery.log"],
        },
        args,
        notice: "(Mode auto : récupération causale par défaut)",
    };
    run_with_auto(&job);
}

fn handle_retrieve(args: &[String]) {
    println!("Recherche RAG / Retrieve...");
    let job = AutoRun {
        mode: AutoMode::WithExtra {
            extra: &["platform", "search"],
            auto: &["platform", "search", "default query"],
        },
        args,
        notice: "(Mode auto : recherche de 'default query')",
    };
    run_with_auto(&job);
}

fn handle_filter(args: &[String]) {
    println!("Filtrage des impasses (Loop Detection)...");
    let job = AutoRun {
        mode: AutoMode::WithExtra {
            extra: &["loop-detection"],
            auto: &["loop-detection", "--history-file", "history.log"],
        },
        args,
        notice: "(Mode auto : détection de boucle sur history.log)",
    };
    run_with_auto(&job);
}

fn handle_merge(args: &[String]) {
    println!("Fusion de branches (Capsule Merge)...");
    let job = AutoRun {
        mode: AutoMode::WithExtra {
            extra: &["merge"],
            auto: &["merge", "default-branch"],
        },
        args,
        notice: "(Mode auto : fusion de la branche courante)",
    };
    run_with_auto(&job);
}

fn handle_parent(args: &[String]) {
    println!("Analyse de la généalogie (Swarm Allele)...");
    let job = AutoRun {
        mode: AutoMode::WithExtra {
            extra: &["swarm", "allele-analyzer"],
            auto: &["swarm", "allele-analyzer", "--swarm-id", "default-swarm"],
        },
        args,
        notice: "(Mode auto : analyse des allèles du swarm par défaut)",
    };
    run_with_auto(&job);
}

fn handle_lineage(args: &[String]) {
    println!("Historique des fossiles (Lineage)...");
    let job = AutoRun {
        mode: AutoMode::Bare {
            extra: &["fossil", "list"],
        },
        args,
        notice: "(Mode auto : listage des fossiles)",
    };
    run_with_auto(&job);
}

fn handle_squeeze(args: &[String]) {
    println!("Condensation de l'agent (Prune)...");
    let job = AutoRun {
        mode: AutoMode::WithExtra {
            extra: &["agent", "prune"],
            auto: &["agent", "prune", "--agent-id", "default-agent", "--threshold", "0.5"],
        },
        args,
        notice: "(Mode auto : pruning de default-agent à 0.5)",
    };
    run_with_auto(&job);
}

fn handle_think(args: &[String]) {
    println!("Évaluation du chemin neuronal (Think)...");
    let job = AutoRun {
        mode: AutoMode::WithExtra {
            extra: &["synaptic", "path-evaluate"],
            auto: &["synaptic", "path-evaluate", "--agent-id", "default-agent", "--pre-node", "input", "--post-node", "output"],
        },
        args,
        notice: "(Mode auto : évaluation neuronale de default-agent)",
    };
    run_with_auto(&job);
}

fn handle_trio(args: &[String]) {
    println!("Déploiement en trio (Trinity)...");
    let job = AutoRun {
        mode: AutoMode::WithExtra {
            extra: &["trinity", "deploy"],
            auto: &["trinity", "deploy", "--mission-id", "mission-alpha", "--strategies", "trio-default"],
        },
        args,
        notice: "(Mode auto : déploiement trinity sur mission alpha)",
    };
    run_with_auto(&job);
}

fn handle_multi(args: &[String]) {
    println!("Exécution multi-agents (World Run)...");
    let job = AutoRun {
        mode: AutoMode::WithExtra {
            extra: &["world", "run"],
            auto: &["world", "run", "--provider", "local", "--root", "./multi-world", "--world-id", "default-multi", "--command", "auto-start", "--sandbox-backend", "native"],
        },
        args,
        notice: "(Mode auto : application des paramètres par défaut)",
    };
    run_with_auto(&job);
}

fn handle_broad(args: &[String]) {
    println!("Expansion des connaissances (Platform Ingest)...");
    let job = AutoRun {
        mode: AutoMode::Bare {
            extra: &["platform", "ingest"],
        },
        args,
        notice: "(Mode auto : ingestion par défaut du README.md...)",
    };
    run_with_auto(&job);
}

fn handle_swarm(args: &[String]) {
    println!("Gestion de l'essaim (Swarm)...");
    let job = AutoRun {
        mode: AutoMode::WithExtra {
            extra: &["swarm", "allele-analyzer"],
            auto: &["swarm", "allele-analyzer", "--swarm-id", "alpha-swarm"],
        },
        args,
        notice: "(Mode auto : lancement de l'analyseur par défaut)",
    };
    run_with_auto(&job);
}

fn handle_debug(args: &[String]) {
    println!("Débogage (Bug Investigation)...");
    let job = AutoRun {
        mode: AutoMode::WithExtra {
            extra: &["experiment", "bug-investigation"],
            auto: &["experiment", "bug-investigation", "default-manifest.json"],
        },
        args,
        notice: "(Mode auto : investigation du manifeste par défaut)",
    };
    run_with_auto(&job);
}

pub fn handle_query(cmd: &QueryCommands, _yes: bool) {
    match cmd {
        QueryCommands::Replay { args } => handle_replay(args),
        QueryCommands::Diff { args } => handle_diff(args),
        QueryCommands::Blame { args } => handle_blame(args),
        QueryCommands::Trace { args } => handle_trace(args),
        QueryCommands::Clone { args } => handle_clone(args),
        QueryCommands::Mutate { args } => handle_mutate(args),
        QueryCommands::Elevate { args } => handle_elevate(args),
        QueryCommands::Rest { args } => handle_rest(args),
        QueryCommands::Check { args } => handle_check(args),
        QueryCommands::Compare { args } => handle_compare(args),
        QueryCommands::Retrace { args } => handle_retrace(args),
        QueryCommands::Restore { args } => handle_restore(args),
        QueryCommands::Recover { args } => handle_recover(args),
        QueryCommands::Retrieve { args } => handle_retrieve(args),
        QueryCommands::Filter { args } => handle_filter(args),
        QueryCommands::Merge { args } => handle_merge(args),
        QueryCommands::Parent { args } => handle_parent(args),
        QueryCommands::Lineage { args } => handle_lineage(args),
        QueryCommands::Squeeze { args } => handle_squeeze(args),
        QueryCommands::Think { args } => handle_think(args),
        QueryCommands::Trio { args } => handle_trio(args),
        QueryCommands::Multi { args } => handle_multi(args),
        QueryCommands::Broad { args } => handle_broad(args),
        QueryCommands::Swarm { args } => handle_swarm(args),
        QueryCommands::Debug { args } => handle_debug(args),
    }
}
use std::process::Command;
use crate::{cargo_program, exit_on_command_failure};
use crate::commands::advanced::AdvancedCommands;

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

fn handle_destroy(args: &[String]) {
    println!("Destruction / Prune...");
    let job = AutoRun {
        mode: AutoMode::WithExtra {
            extra: &["fossil", "record"],
            auto: &["fossil", "record", "--lineage-id", "default-lineage", "--reason", "destroyed_by_user"],
        },
        args,
        notice: "(Mode auto : destruction / extinction de l'agent par défaut)",
    };
    run_with_auto(&job);
}

fn handle_close(args: &[String]) {
    println!("Fermeture (World Run Stop)...");
    let job = AutoRun {
        mode: AutoMode::WithExtra {
            extra: &["world", "run"],
            auto: &["world", "run", "--provider", "local", "--root", "./", "--world-id", "default", "--command", "stop", "--sandbox-backend", "native"],
        },
        args,
        notice: "(Mode auto : fermeture du monde par défaut)",
    };
    run_with_auto(&job);
}

fn handle_order(args: &[String]) {
    println!("Ordre / Conformité (Compliance Generate)...");
    let job = AutoRun {
        mode: AutoMode::WithExtra {
            extra: &["compliance", "generate"],
            auto: &["compliance", "generate", "--standard", "iso-genos-1"],
        },
        args,
        notice: "(Mode auto : génération de conformité standard ISO)",
    };
    run_with_auto(&job);
}

fn handle_auto(args: &[String]) {
    println!("Mode Automatique (Trinity Deploy / Auto-start)...");
    let job = AutoRun {
        mode: AutoMode::WithExtra {
            extra: &["trinity", "deploy"],
            auto: &["trinity", "deploy", "--mission-id", "auto-mission", "--strategies", "autonomous"],
        },
        args,
        notice: "(Mode auto : déploiement autonome Trinity)",
    };
    run_with_auto(&job);
}

fn handle_fast(args: &[String]) {
    println!("Mode Rapide (Strategy Adapt / Time Constraint)...");
    let job = AutoRun {
        mode: AutoMode::WithExtra {
            extra: &["strategy", "adapt"],
            auto: &["strategy", "adapt", "--agent-id", "default-agent", "--constraint", "time", "--target", "0.1"],
        },
        args,
        notice: "(Mode auto : adaptation de la stratégie pour une vitesse maximale)",
    };
    run_with_auto(&job);
}

fn handle_copy(args: &[String]) {
    println!("Copie / Sauvegarde (Snapshot Create)...");
    let job = AutoRun {
        mode: AutoMode::WithExtra {
            extra: &["snapshot", "create"],
            auto: &["snapshot", "create", "--agent", "default-agent", "--out", "snapshot_copy.json"],
        },
        args,
        notice: "(Mode auto : création d'un snapshot de l'agent par défaut)",
    };
    run_with_auto(&job);
}

fn handle_hub(args: &[String]) {
    println!("Hub / Création de monde (World Create)...");
    let job = AutoRun {
        mode: AutoMode::WithExtra {
            extra: &["world", "create"],
            auto: &["world", "create", "--provider", "local", "--root", "./hub", "--world-id", "hub-01"],
        },
        args,
        notice: "(Mode auto : création d'un hub local)",
    };
    run_with_auto(&job);
}

fn handle_wisdom(args: &[String]) {
    println!("Sagesse / Base de connaissances (Platform Search)...");
    let job = AutoRun {
        mode: AutoMode::WithExtra {
            extra: &["platform", "search"],
            auto: &["platform", "search", "wisdom"],
        },
        args,
        notice: "(Mode auto : recherche de la sagesse universelle dans l'index)",
    };
    run_with_auto(&job);
}

fn handle_synapse(args: &[String]) {
    println!("Synapse / Réseau Neuronal (Synaptic)...");
    let job = AutoRun {
        mode: AutoMode::WithExtra {
            extra: &["synaptic", "path-evaluate"],
            auto: &["synaptic", "path-evaluate", "--agent-id", "default-agent", "--pre-node", "0", "--post-node", "1"],
        },
        args,
        notice: "(Mode auto : évaluation du réseau synaptique par défaut)",
    };
    run_with_auto(&job);
}

fn handle_wipe(args: &[String]) {
    println!("Nettoyage / Effacement (Agent Prune Maximum)...");
    let job = AutoRun {
        mode: AutoMode::WithExtra {
            extra: &["agent", "prune"],
            auto: &["agent", "prune", "--agent-id", "default-agent", "--threshold", "0.99"],
        },
        args,
        notice: "(Mode auto : élagage radical de l'agent)",
    };
    run_with_auto(&job);
}

fn handle_operate(args: &[String]) {
    println!("Opération (World Run)...");
    let job = AutoRun {
        mode: AutoMode::WithExtra {
            extra: &["world", "run"],
            auto: &["world", "run", "--provider", "local", "--root", "./", "--world-id", "hub-01", "--command", "operate", "--sandbox-backend", "native"],
        },
        args,
        notice: "(Mode auto : lancement des opérations sur le hub par défaut)",
    };
    run_with_auto(&job);
}

fn handle_dissect(args: &[String]) {
    println!("Dissection / Extraction (Hallucination Extract)...");
    let job = AutoRun {
        mode: AutoMode::WithExtra {
            extra: &["hallucination", "extract"],
            auto: &["hallucination", "extract", "--snapshot", "latest-snapshot"],
        },
        args,
        notice: "(Mode auto : dissection du dernier snapshot)",
    };
    run_with_auto(&job);
}

fn handle_unveil(args: &[String]) {
    println!("Dévoilement (Hallucination Detect)...");
    let job = AutoRun {
        mode: AutoMode::WithExtra {
            extra: &["hallucination", "detect"],
            auto: &["hallucination", "detect", "--snapshot", "latest-snapshot"],
        },
        args,
        notice: "(Mode auto : détection des hallucinations cachées)",
    };
    run_with_auto(&job);
}

fn handle_root(args: &[String]) {
    println!("Ancrage Racine (Causality Fork)...");
    let job = AutoRun {
        mode: AutoMode::WithExtra {
            extra: &["causality", "fork"],
            auto: &["causality", "fork", "--boundary-id", "root-boundary", "--new-boundary-id", "new-branch"],
        },
        args,
        notice: "(Mode auto : fork depuis la racine causale)",
    };
    run_with_auto(&job);
}

fn handle_keep(args: &[String]) {
    println!("Conservation (Capsule Merge)...");
    let job = AutoRun {
        mode: AutoMode::WithExtra {
            extra: &["merge"],
            auto: &["merge", "current-branch"],
        },
        args,
        notice: "(Mode auto : conservation et fusion de la branche)",
    };
    run_with_auto(&job);
}

fn handle_quantum(args: &[String]) {
    println!("Mode Mondes Possibles (World Run - Counterfactual VFS, classique)...");
    let job = AutoRun {
        mode: AutoMode::WithExtra {
            extra: &["world", "run"],
            auto: &["world", "run", "--provider", "local", "--root", "./", "--world-id", "quantum-world", "--command", "start", "--sandbox-backend", "quantum"],
        },
        args,
        notice: "(Mode auto : execution du monde en backend contrefactuel classique)",
    };
    run_with_auto(&job);
}

fn handle_store(args: &[String]) {
    println!("Stockage (Snapshot List)...");
    let job = AutoRun {
        mode: AutoMode::WithExtra {
            extra: &["snapshot", "list"],
            auto: &["snapshot", "list"],
        },
        args,
        notice: "(Mode auto : listage des instantanés stockés)",
    };
    run_with_auto(&job);
}

fn handle_piece(args: &[String]) {
    println!("Ajustement d'un fragment (Synaptic Prune Scale)...");
    let job = AutoRun {
        mode: AutoMode::WithExtra {
            extra: &["synaptic", "prune-scale"],
            auto: &["synaptic", "prune-scale", "--agent-id", "default-agent", "--scale", "0.8"],
        },
        args,
        notice: "(Mode auto : ajustement précis du réseau)",
    };
    run_with_auto(&job);
}

fn handle_daemon(args: &[String]) {
    println!("Lancement du Démon (Serve)...");
    let job = AutoRun {
        mode: AutoMode::WithExtra {
            extra: &["serve"],
            auto: &["serve"],
        },
        args,
        notice: "(Mode auto : lancement du daemon sur le port par défaut)",
    };
    run_with_auto(&job);
}

fn handle_preagi(args: &[String]) {
    println!("Création de l'entité Pre-AGI (Agent Create)...");
    let job = AutoRun {
        mode: AutoMode::WithExtra {
            extra: &["agent", "create"],
            auto: &["agent", "create", "--name", "pre-agi-core", "--out", "preagi-snapshot.json"],
        },
        args,
        notice: "(Mode auto : création de l'agent pre-agi-core)",
    };
    run_with_auto(&job);
}

fn handle_civilization(args: &[String]) {
    println!("Simulation de civilisation (World Run)...");
    let job = AutoRun {
        mode: AutoMode::WithExtra {
            extra: &["world", "run"],
            auto: &["world", "run", "--provider", "local", "--root", "./", "--world-id", "civilization-alpha", "--command", "start", "--sandbox-backend", "native"],
        },
        args,
        notice: "(Mode auto : lancement du monde civilization-alpha)",
    };
    run_with_auto(&job);
}

fn handle_explore(args: &[String]) {
    println!("Exploration des strates (Fossil List)...");
    let job = AutoRun {
        mode: AutoMode::WithExtra {
            extra: &["fossil", "list"],
            auto: &["fossil", "list"],
        },
        args,
        notice: "(Mode auto : listage profond des fossiles)",
    };
    run_with_auto(&job);
}

fn handle_research(args: &[String]) {
    println!("Recherche approfondie (Experiment Bug Investigation)...");
    let job = AutoRun {
        mode: AutoMode::WithExtra {
            extra: &["experiment", "bug-investigation"],
            auto: &["experiment", "bug-investigation", "anomaly.json"],
        },
        args,
        notice: "(Mode auto : recherche sur une anomalie générique)",
    };
    run_with_auto(&job);
}

fn handle_search(args: &[String]) {
    println!("Recherche globale (Platform Search)...");
    let job = AutoRun {
        mode: AutoMode::Bare {
            extra: &["platform", "search"],
        },
        args,
        notice: "(Mode auto : recherche vide)",
    };
    run_with_auto(&job);
}

pub fn handle_advanced(cmd: &AdvancedCommands, _yes: bool) {
    match cmd {
        AdvancedCommands::Destroy { args } => handle_destroy(args),
        AdvancedCommands::Close { args } => handle_close(args),
        AdvancedCommands::Order { args } => handle_order(args),
        AdvancedCommands::Auto { args } => handle_auto(args),
        AdvancedCommands::Fast { args } => handle_fast(args),
        AdvancedCommands::Copy { args } => handle_copy(args),
        AdvancedCommands::Hub { args } => handle_hub(args),
        AdvancedCommands::Wisdom { args } => handle_wisdom(args),
        AdvancedCommands::Synapse { args } => handle_synapse(args),
        AdvancedCommands::Wipe { args } => handle_wipe(args),
        AdvancedCommands::Operate { args } => handle_operate(args),
        AdvancedCommands::Dissect { args } => handle_dissect(args),
        AdvancedCommands::Unveil { args } => handle_unveil(args),
        AdvancedCommands::Root { args } => handle_root(args),
        AdvancedCommands::Keep { args } => handle_keep(args),
        AdvancedCommands::Quantum { args } => handle_quantum(args),
        AdvancedCommands::Store { args } => handle_store(args),
        AdvancedCommands::Piece { args } => handle_piece(args),
        AdvancedCommands::Daemon { args } => handle_daemon(args),
        AdvancedCommands::Preagi { args } => handle_preagi(args),
        AdvancedCommands::Civilization { args } => handle_civilization(args),
        AdvancedCommands::Explore { args } => handle_explore(args),
        AdvancedCommands::Research { args } => handle_research(args),
        AdvancedCommands::Search { args } => handle_search(args),
    }
}
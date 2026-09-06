use clap::{Parser, Subcommand};

fn exit_on_command_failure(status: std::io::Result<std::process::ExitStatus>) {
    match status {
        Ok(status) if status.success() => {}
        Ok(status) => std::process::exit(status.code().unwrap_or(1)),
        Err(error) => {
            eprintln!("Échec de l'exécution de la commande: {}", error);
            std::process::exit(1);
        }
    }
}

fn command_error(message: impl std::fmt::Display) -> ! {
    eprintln!("Erreur: {}", message);
    std::process::exit(1);
}

#[derive(Parser)]
#[command(name = "g", about = "GenOS Simple CLI", version = "1.0")]
struct Cli {
    #[arg(long, global = true, help = "Confirm an operation with destructive side effects")]
    yes: bool,
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Démarre le serveur
    Start,
    /// Arrête le serveur/l'agent
    Stop,
    /// Affiche l'état du système
    Status,
    /// Lance une tâche
    Run,
    /// Liste les fossiles stockés
    List,
    /// Initialise le projet
    Init,
    Replay {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },
    Diff {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },
    Blame {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },
    Trace {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },
    Clone {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },
    Mutate {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },
    Elevate {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },
    Rest {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },
    Check {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },
    Compare {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },
    Retrace {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },
    Restore {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },
    Recover {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },
    Retrieve {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },
    Filter {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },
    Merge {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },
    Parent {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },
    Lineage {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },
    #[command(alias = "squeaze")]
    Squeeze {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },
    Think {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },
    Trio {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },
    Multi {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },
    Broad {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },
    Swarm {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },
    Debug {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },
    Destroy {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },
    Close {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },
    Order {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },
    Auto {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },
    Fast {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },
    Copy {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },
    Hub {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },
    Wisdom {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },
    Synapse {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },
    Wipe {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },
    Operate {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },
    Dissect {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },
    Unveil {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },
    Root {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },
    Keep {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },
    Quantum {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },
    Store {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },
    Piece {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },
    Daemon {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },
    Preagi {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },
    Civilization {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },
    Explore {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },
    Research {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },
    Search {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },
    TwoParallel {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },
    TriParallel {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },
    MultiParallel {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },
    Ruins {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },
    Id {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },
    Mind {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },
    Generate {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },
}

#[tokio::main]
async fn main() {
    let Cli { yes, command } = Cli::parse();

    if !yes && matches!(
        &command,
        Commands::Destroy { .. }
            | Commands::Wipe { .. }
            | Commands::Close { .. }
            | Commands::Keep { .. }
    ) {
        eprintln!("Cette commande modifie l'état GenOS. Relancez-la avec --yes pour confirmer.");
        std::process::exit(2);
    }

    match command {
        Commands::Start => {
            println!("Démarrage du serveur GenOS API...");
            if std::net::TcpStream::connect("127.0.0.1:8085").is_ok() {
                command_error("le serveur GenOS est déjà en ligne sur le port 8085");
            }

            let log_file = std::fs::File::create("genos_server.log")
                .unwrap_or_else(|error| command_error(format!("impossible de créer genos_server.log: {}", error)));
            let err_file = log_file
                .try_clone()
                .unwrap_or_else(|error| command_error(format!("impossible de préparer le journal d'erreurs: {}", error)));

            let child = std::process::Command::new("cargo")
                .args(["run", "-q", "-p", "genos-cli", "--", "serve"])
                .stdout(std::process::Stdio::from(log_file))
                .stderr(std::process::Stdio::from(err_file))
                .spawn()
                .unwrap_or_else(|error| command_error(format!("impossible de démarrer le serveur: {}", error)));

            println!("Serveur démarré en arrière-plan avec le PID: {} (Logs dans genos_server.log)", child.id());
            std::fs::write(".genos_server.pid", child.id().to_string())
                .unwrap_or_else(|error| command_error(format!("impossible d'écrire .genos_server.pid: {}", error)));
        }
        Commands::Stop => {
            println!("Arrêt du serveur GenOS...");
            if let Ok(pid_str) = std::fs::read_to_string(".genos_server.pid") {
                let pid = pid_str
                    .trim()
                    .parse::<u32>()
                    .unwrap_or_else(|error| command_error(format!("PID invalide dans .genos_server.pid: {}", error)));
                if std::net::TcpStream::connect("127.0.0.1:8085").is_err() {
                    let _ = std::fs::remove_file(".genos_server.pid");
                    command_error(format!("le serveur est déjà arrêté; PID stale supprimé ({})", pid));
                }
                let status = {
                    #[cfg(windows)]
                    { std::process::Command::new("taskkill")
                            .args(["/F", "/T", "/PID", &pid.to_string()])
                            .status() }
                    #[cfg(not(windows))]
                    { std::process::Command::new("kill").arg(pid.to_string()).status() }
                };
                match status {
                    Ok(status) if status.success() => {
                        println!("Serveur arrêté (PID: {}).", pid);
                    }
                    Ok(status) => command_error(format!("impossible d'arrêter le serveur (code {})", status.code().unwrap_or(1))),
                    Err(error) => command_error(format!("impossible d'arrêter le serveur: {}", error)),
                }
                if std::net::TcpStream::connect("127.0.0.1:8085").is_ok() {
                    command_error("le port 8085 est encore ouvert après l'arrêt");
                }
                    let _ = std::fs::remove_file(".genos_server.pid");
            } else {
                println!("Aucun serveur GenOS en cours d'exécution (pid file introuvable).");
                std::process::exit(1);
            }
        }
        Commands::Status => {
            println!("Vérification du statut du serveur GenOS...");
            if let Ok(pid_str) = std::fs::read_to_string(".genos_server.pid") {
                println!("Le serveur semble être en cours d'exécution (PID: {}).", pid_str.trim());
                if std::net::TcpStream::connect("127.0.0.1:8085").is_ok() {
                    println!("Statut: EN LIGNE (Port 8085 ouvert)");
                } else {
                    println!("Statut: HORS LIGNE (Port 8085 inaccessible)");
                    let _ = std::fs::remove_file(".genos_server.pid");
                    std::process::exit(1);
                }
            } else {
                println!("Statut: ARRÊTÉ");
                std::process::exit(1);
            }
        }
        Commands::Run => {
            println!("Lancement d'une tâche (création d'agent de test)...");
            let status = std::process::Command::new("cargo")
                .args(["run", "-q", "-p", "genos-cli", "--", "agent", "create", "--name", "task-worker", "--out", ".genos-task.json"])
                .status();
            match status {
                Ok(s) if s.success() => println!("Tâche lancée et agent créé avec succès."),
                _ => println!("Erreur lors du lancement de la tâche."),
            }
        }
        Commands::List => {
            println!("Liste des fossiles stockés...");
            let mut cmd = std::process::Command::new("cargo");
            cmd.args(["run", "-q", "-p", "genos-cli", "--", "fossil", "list"]);
            exit_on_command_failure(cmd.status());
        }
        Commands::Init => {
            println!("Initialisation de GenOS...");
            let mut cmd = std::process::Command::new("cargo");
            cmd.args(["run", "-q", "-p", "genos-cli", "--", "init"]);
            exit_on_command_failure(cmd.status());
        }
        Commands::Replay { args } => {
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : lancement du replay sur le snapshot par défaut)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "replay", "basic", "--snapshot", "latest-snapshot"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "replay", "basic"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Diff { args } => {
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : comparaison entre origin et latest)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "diff", "origin", "latest"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "diff"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Blame { args } => {
            println!("Analyse de la source de l'hallucination / Blame...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : analyse de l'hallucination sur latest-snapshot)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "hallucination", "analyze", "--snapshot", "latest-snapshot"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "hallucination", "analyze"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Trace { args } => {
            println!("Traçage de la causalité / Trace...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : traçage causal sur incident par défaut)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "experiment", "causal-replay", "default-trace.log"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "experiment", "causal-replay"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Clone { args } => {
            println!("Clonage de l'agent...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : clonage de l'agent parent par défaut)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "agent", "fork", "--parent-id", "default-parent"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "agent", "fork"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Mutate { args } => {
            println!("Mutation de l'agent...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : mutation du trait créativité)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "agent", "mutate", "--agent-id", "default-agent", "--trait", "creativity"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "agent", "mutate"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Elevate { args } => {
            println!("Élévation de l'agent / Adapt...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : élévation de l'agent)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "strategy", "adapt", "--agent-id", "default-agent", "--constraint", "time", "--target", "1.0"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "strategy", "adapt"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Rest { args } => {
            println!("Mise en repos de l'agent (Cryptobiosis)...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : cryptobiose de default-agent)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "resilience", "cryptobiosis", "--agent-id", "default-agent"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "resilience", "cryptobiosis"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Check { args } => {
            println!("Vérification / Audit...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : audit du latest-snapshot)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "audit", "latest-snapshot"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "audit"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Compare { args } => {
            println!("Comparaison des phénotypes...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : comparaison phénotypique sur default-trait)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "phenotype", "measure-divergence", "--trait-name", "default-trait", "--expected", "1.0", "--observed", "0.9", "--tolerance", "0.2"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "phenotype", "measure-divergence"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Retrace { args } => {
            println!("Retraçage / Incident...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : analyse de l'incident par défaut)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "experiment", "incident", "default-manifest.json"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "experiment", "incident"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Restore { args } => {
            println!("Restauration depuis un snapshot (Capsule Create)...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : création de capsule depuis latest-snapshot)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "capsule", "create", "--snapshot", "latest-snapshot"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "capsule", "create"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Recover { args } => {
            println!("Récupération (Causal Replay)...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : récupération causale par défaut)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "experiment", "causal-replay", "default-recovery.log"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "experiment", "causal-replay"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Retrieve { args } => {
            println!("Recherche RAG / Retrieve...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : recherche de 'default query')");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "platform", "search", "default query"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "platform", "search"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Filter { args } => {
            println!("Filtrage des impasses (Loop Detection)...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : détection de boucle sur history.log)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "loop-detection", "--history-file", "history.log"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "loop-detection"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Merge { args } => {
            println!("Fusion de branches (Capsule Merge)...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : fusion de la branche courante)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "merge", "default-branch"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "merge"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Parent { args } => {
            println!("Analyse de la généalogie (Swarm Allele)...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : analyse des allèles du swarm par défaut)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "swarm", "allele-analyzer", "--swarm-id", "default-swarm"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "swarm", "allele-analyzer"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Lineage { args } => {
            println!("Historique des fossiles (Lineage)...");
            let mut cmd = std::process::Command::new("cargo");
            cmd.args(["run", "-q", "-p", "genos-cli", "--", "fossil", "list"]);
            if !args.is_empty() { cmd.args(args); }
            exit_on_command_failure(cmd.status());
        }
        Commands::Squeeze { args } => {
            println!("Condensation de l'agent (Prune)...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : pruning de default-agent à 0.5)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "agent", "prune", "--agent-id", "default-agent", "--threshold", "0.5"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "agent", "prune"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Think { args } => {
            println!("Évaluation du chemin neuronal (Think)...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : évaluation neuronale de default-agent)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "synaptic", "path-evaluate", "--agent-id", "default-agent", "--pre-node", "input", "--post-node", "output"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "synaptic", "path-evaluate"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Trio { args } => {
            println!("Déploiement en trio (Trinity)...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : déploiement trinity sur mission alpha)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "trinity", "deploy", "--mission-id", "mission-alpha", "--strategies", "trio-default"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "trinity", "deploy"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Multi { args } => {
            println!("Exécution multi-agents (World Run)...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : application des paramètres par défaut)");
                cmd.args([
                    "run", "-q", "-p", "genos-cli", "--", "world", "run",
                    "--provider", "local",
                    "--root", "./multi-world",
                    "--world-id", "default-multi",
                    "--command", "auto-start",
                    "--sandbox-backend", "native"
                ]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "world", "run"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Broad { args } => {
            println!("Expansion des connaissances (Platform Ingest)...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("Veuillez spécifier le chemin d'un fichier. Exemple : .\\g broad ./README.md");
                println!("(Ou ingestion par défaut du README.md...)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "platform", "ingest", "./README.md"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "platform", "ingest"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Swarm { args } => {
            println!("Gestion de l'essaim (Swarm)...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : lancement de l'analyseur par défaut)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "swarm", "allele-analyzer", "--swarm-id", "alpha-swarm"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "swarm"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Debug { args } => {
            println!("Débogage (Bug Investigation)...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : investigation du manifeste par défaut)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "experiment", "bug-investigation", "default-manifest.json"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "experiment", "bug-investigation"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Destroy { args } => {
            println!("Destruction / Prune...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : destruction / extinction de l'agent par défaut)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "fossil", "record", "--lineage-id", "default-lineage", "--reason", "destroyed_by_user"]);
            } else {
                // Alternatively could map to agent prune, but fossil record fits "destroy" lineage well
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "fossil", "record"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Close { args } => {
            println!("Fermeture (World Run Stop)...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : fermeture du monde par défaut)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "world", "run", "--provider", "local", "--root", "./", "--world-id", "default", "--command", "stop", "--sandbox-backend", "native"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "world", "run"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Order { args } => {
            println!("Ordre / Conformité (Compliance Generate)...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : génération de conformité standard ISO)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "compliance", "generate", "--standard", "iso-genos-1"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "compliance", "generate"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Auto { args } => {
            println!("Mode Automatique (Trinity Deploy / Auto-start)...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : déploiement autonome Trinity)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "trinity", "deploy", "--mission-id", "auto-mission", "--strategies", "autonomous"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "trinity", "deploy"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Fast { args } => {
            println!("Mode Rapide (Strategy Adapt / Time Constraint)...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : adaptation de la stratégie pour une vitesse maximale)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "strategy", "adapt", "--agent-id", "default-agent", "--constraint", "time", "--target", "0.1"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "strategy", "adapt"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Copy { args } => {
            println!("Copie / Sauvegarde (Snapshot Create)...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : création d'un snapshot de l'agent par défaut)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "snapshot", "create", "--agent", "default-agent", "--out", "snapshot_copy.json"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "snapshot", "create"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Hub { args } => {
            println!("Hub / Création de monde (World Create)...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : création d'un hub local)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "world", "create", "--provider", "local", "--root", "./hub", "--world-id", "hub-01"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "world", "create"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Wisdom { args } => {
            println!("Sagesse / Base de connaissances (Platform Search)...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : recherche de la sagesse universelle dans l'index)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "platform", "search", "wisdom"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "platform", "search"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Synapse { args } => {
            println!("Synapse / Réseau Neuronal (Synaptic)...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : évaluation du réseau synaptique par défaut)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "synaptic", "path-evaluate", "--agent-id", "default-agent", "--pre-node", "0", "--post-node", "1"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "synaptic"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Wipe { args } => {
            println!("Nettoyage / Effacement (Agent Prune Maximum)...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : élagage radical de l'agent)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "agent", "prune", "--agent-id", "default-agent", "--threshold", "0.99"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "agent", "prune"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Operate { args } => {
            println!("Opération (World Run)...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : lancement des opérations sur le hub par défaut)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "world", "run", "--provider", "local", "--root", "./", "--world-id", "hub-01", "--command", "operate", "--sandbox-backend", "native"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "world", "run"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Dissect { args } => {
            println!("Dissection / Extraction (Hallucination Extract)...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : dissection du dernier snapshot)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "hallucination", "extract", "--snapshot", "latest-snapshot"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "hallucination", "extract"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Unveil { args } => {
            println!("Dévoilement (Hallucination Detect)...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : détection des hallucinations cachées)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "hallucination", "detect", "--snapshot", "latest-snapshot"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "hallucination", "detect"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Root { args } => {
            println!("Ancrage Racine (Causality Fork)...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : fork depuis la racine causale)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "causality", "fork", "--boundary-id", "root-boundary", "--new-boundary-id", "new-branch"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "causality", "fork"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Keep { args } => {
            println!("Conservation (Capsule Merge)...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : conservation et fusion de la branche)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "merge", "current-branch"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "merge"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Quantum { args } => {
            println!("Mode Quantique (World Run - Sandbox Quantum)...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : exécution du monde en backend quantique)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "world", "run", "--provider", "local", "--root", "./", "--world-id", "quantum-world", "--command", "start", "--sandbox-backend", "quantum"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "world", "run"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Store { args } => {
            println!("Stockage (Snapshot List)...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : listage des instantanés stockés)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "snapshot", "list"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "snapshot", "list"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Piece { args } => {
            println!("Ajustement d'un fragment (Synaptic Prune Scale)...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : ajustement précis du réseau)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "synaptic", "prune-scale", "--agent-id", "default-agent", "--scale", "0.8"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "synaptic", "prune-scale"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Daemon { args } => {
            println!("Lancement du Démon (Serve)...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : lancement du daemon sur le port par défaut)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "serve"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "serve"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Preagi { args } => {
            println!("Création de l'entité Pre-AGI (Agent Create)...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : création de l'agent pre-agi-core)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "agent", "create", "--name", "pre-agi-core", "--out", "preagi-snapshot.json"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "agent", "create"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Civilization { args } => {
            println!("Simulation de civilisation (World Run)...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : lancement du monde civilization-alpha)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "world", "run", "--provider", "local", "--root", "./", "--world-id", "civilization-alpha", "--command", "start", "--sandbox-backend", "native"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "world", "run"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Explore { args } => {
            println!("Exploration des strates (Fossil List)...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : listage profond des fossiles)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "fossil", "list"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "fossil", "list"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Research { args } => {
            println!("Recherche approfondie (Experiment Bug Investigation)...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : recherche sur une anomalie générique)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "experiment", "bug-investigation", "anomaly.json"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "experiment", "bug-investigation"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Search { args } => {
            println!("Recherche globale (Platform Search)...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : recherche vide)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "platform", "search", ""]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "platform", "search"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::TwoParallel { args } => {
            println!("Double exécution parallèle (Trinity Deploy / Duo)...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : déploiement en duo)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "trinity", "deploy", "--mission-id", "duo-mission", "--strategies", "duo-strategy"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "trinity", "deploy"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::TriParallel { args } => {
            println!("Triple exécution parallèle (Trinity Deploy)...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : déploiement en trio)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "trinity", "deploy", "--mission-id", "trio-mission", "--strategies", "trio-strategy"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "trinity", "deploy"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::MultiParallel { args } => {
            println!("Exécution massivement parallèle (Swarm / World Run)...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : lancement du monde multi-parallèle)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "world", "run", "--provider", "local", "--root", "./", "--world-id", "multi-parallel-world", "--command", "start", "--sandbox-backend", "native"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "world", "run"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Ruins { args } => {
            println!("Exploration des ruines (Fossil List Extinct)...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : listage des anciens fossiles éteints)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "fossil", "list"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "fossil", "list"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Id { args } => {
            println!("Identification (Audit de l'ID)...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : audit de l'identifiant par défaut)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "audit", "default-id"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "audit"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Mind { args } => {
            println!("Analyse de l'esprit (Synaptic Path Evaluate)...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : évaluation du cheminement mental)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "synaptic", "path-evaluate", "--agent-id", "default-mind", "--pre-node", "0", "--post-node", "1"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "synaptic", "path-evaluate"]);
                cmd.args(args);
            }
            exit_on_command_failure(cmd.status());
        }
        Commands::Generate { args } => {
            if args.is_empty() {
                println!("Usage: .\\g generate <Dossier> <Prompt...>");
                return;
            }
            let target_dir = format!("../{}", args[0]);
            let prompt = args[1..].join(" ");
            
            println!("🧬 [GenOS] Éveil de l'Agent de Génération (World: {})...", args[0]);
            let _ = std::fs::create_dir_all(&target_dir);
            let genos_dir = format!("{}/.genos", target_dir);
            let _ = std::fs::create_dir_all(&genos_dir);
            
            let client = reqwest::Client::builder().timeout(std::time::Duration::from_secs(300)).build().unwrap();

            // STEP 1: CAHIER DES CHARGES (Blueprint)
            println!("🧠 [Thalamus] Phase 1/3: Réflexion et création du cahier des charges...");
            let blueprint_prompt = format!(
                "Agis comme un architecte logiciel (GenOS Agent). L'utilisateur demande : '{}'. 
                Rédige un cahier des charges détaillé (objectifs, structure des fichiers, design system, étapes de développement).", prompt
            );
            let body1 = serde_json::json!({
                "model": "genos-core-v3",
                "messages": [{ "role": "user", "content": blueprint_prompt }]
            });
            let mut blueprint_text = String::new();
            if let Ok(res) = client.post("http://127.0.0.1:8085/v1/chat/completions").json(&body1).send().await {
                if let Ok(json_resp) = res.json::<serde_json::Value>().await {
                    if let Some(text) = json_resp["choices"][0]["message"]["content"].as_str() {
                        blueprint_text = text.to_string();
                        let _ = std::fs::write(format!("{}/blueprint.md", genos_dir), &blueprint_text);
                        println!("✔️ Cahier des charges enregistré dans .genos/blueprint.md");
                    }
                }
            }

            // STEP 2: CODE GENERATION (Execution)
            println!("⚡ [Cortex] Phase 2/3: Génération du code source...");
            let full_prompt = format!(
                "Voici le cahier des charges :\n{}\n\nGénère le code source complet.
                IMPORTANT : Tu DOIS répondre EXACTEMENT avec ce format JSON et RIEN D'AUTRE, pas de markdown, juste le tableau JSON brut :
                [{{\"filename\": \"index.html\", \"content\": \"...\"}}, {{\"filename\": \"style.css\", \"content\": \"...\"}}]", blueprint_text
            );
            let body2 = serde_json::json!({
                "model": "genos-core-v3",
                "messages": [{ "role": "user", "content": full_prompt }]
            });
            if let Ok(res) = client.post("http://127.0.0.1:8085/v1/chat/completions").json(&body2).send().await {
                if let Ok(json_resp) = res.json::<serde_json::Value>().await {
                    if let Some(text) = json_resp["choices"][0]["message"]["content"].as_str() {
                        let clean_text = text.trim().strip_prefix("```json").unwrap_or(text.trim()).strip_suffix("```").unwrap_or(text.trim());
                        if let Ok(files) = serde_json::from_str::<serde_json::Value>(clean_text) {
                            if let Some(file_array) = files.as_array() {
                                for file in file_array {
                                    if let (Some(name), Some(content)) = (file["filename"].as_str(), file["content"].as_str()) {
                                        let file_path = std::path::Path::new(&target_dir).join(name);
                                        if let Ok(_) = std::fs::write(&file_path, content) {
                                            println!("✔️ Créé : {}", file_path.display());
                                        }
                                    }
                                }
                            }
                        } else {
                            println!("⚠️ Le modèle n'a pas respecté le format JSON strict.");
                        }
                    }
                }
            }

            // STEP 3: AUDIT & SELF-REFLECTION
            println!("👁️ [Synapse] Phase 3/3: Auto-évaluation du résultat...");
            let audit_prompt = format!(
                "Tu viens de générer le projet pour : '{}'. Fais un court audit de ton propre travail, identifie les points forts et les limites de ta génération, et propose les prochaines étapes.", prompt
            );
            let body3 = serde_json::json!({
                "model": "genos-core-v3",
                "messages": [{ "role": "user", "content": audit_prompt }]
            });
            if let Ok(res) = client.post("http://127.0.0.1:8085/v1/chat/completions").json(&body3).send().await {
                if let Ok(json_resp) = res.json::<serde_json::Value>().await {
                    if let Some(text) = json_resp["choices"][0]["message"]["content"].as_str() {
                        let _ = std::fs::write(format!("{}/audit.md", genos_dir), text);
                        println!("✔️ Audit enregistré dans .genos/audit.md");
                    }
                }
            }
            
            println!("✅ Opération GenOS terminée. L'agent retourne en veille.");
        }
    }
}


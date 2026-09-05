use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(name = "g", about = "GenOS Simple CLI", version = "1.0")]
struct Cli {
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
    /// Liste les agents/tâches
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
    Squeaze {
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
    Dissect, Unveil, Root, Keep, Quantum, Store, Piece, Daemon,
    Preagi, Civilization, Explore, Research, Search, TwoParallel, TriParallel, MultiParallel,
    Ruins, Id, Mind,
}

#[tokio::main]
async fn main() {
    let cli = Cli::parse();

    match cli.command {
        Commands::Start => {
            println!("Démarrage du serveur GenOS API...");
            
            // Redirect output to a log file
            let log_file = std::fs::File::create("genos_server.log").expect("Failed to create log file");
            let err_file = log_file.try_clone().expect("Failed to clone log file");
            
            let child = std::process::Command::new("cargo")
                .args(["run", "-q", "-p", "genos-cli", "--", "serve"])
                .stdout(std::process::Stdio::from(log_file))
                .stderr(std::process::Stdio::from(err_file))
                .spawn()
                .expect("Failed to start GenOS server");
                
            println!("Serveur démarré en arrière-plan avec le PID: {} (Logs dans genos_server.log)", child.id());
            let _ = std::fs::write(".genos_server.pid", child.id().to_string());
        }
        Commands::Stop => {
            println!("Arrêt du serveur GenOS...");
            if let Ok(pid_str) = std::fs::read_to_string(".genos_server.pid") {
                if let Ok(pid) = pid_str.trim().parse::<u32>() {
                    #[cfg(windows)]
                    {
                        let _ = std::process::Command::new("taskkill")
                            .args(["/F", "/T", "/PID", &pid.to_string()])
                            .status();
                    }
                    #[cfg(not(windows))]
                    {
                        let _ = std::process::Command::new("kill")
                            .arg(pid.to_string())
                            .status();
                    }
                    println!("Serveur arrêté (PID: {}).", pid);
                    let _ = std::fs::remove_file(".genos_server.pid");
                }
            } else {
                println!("Aucun serveur GenOS en cours d'exécution (pid file introuvable).");
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
                }
            } else {
                println!("Statut: ARRÊTÉ");
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
            println!("Liste des agents/fossiles actifs...");
            let _ = std::process::Command::new("cargo")
                .args(["run", "-q", "-p", "genos-cli", "--", "fossil", "list"])
                .status();
        }
        Commands::Init => println!("Initialisation de GenOS..."),
        Commands::Replay { args } => {
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : lancement du replay sur le snapshot par défaut)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "replay", "basic", "--snapshot", "latest-snapshot"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "replay", "basic"]);
                cmd.args(args);
            }
            let _ = cmd.status();
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
            let _ = cmd.status();
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
            let _ = cmd.status();
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
            let _ = cmd.status();
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
            let _ = cmd.status();
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
            let _ = cmd.status();
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
            let _ = cmd.status();
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
            let _ = cmd.status();
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
            let _ = cmd.status();
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
            let _ = cmd.status();
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
            let _ = cmd.status();
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
            let _ = cmd.status();
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
            let _ = cmd.status();
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
            let _ = cmd.status();
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
            let _ = cmd.status();
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
            let _ = cmd.status();
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
            let _ = cmd.status();
        }
        Commands::Lineage { args } => {
            println!("Historique des fossiles (Lineage)...");
            let mut cmd = std::process::Command::new("cargo");
            cmd.args(["run", "-q", "-p", "genos-cli", "--", "fossil", "list"]);
            if !args.is_empty() { cmd.args(args); }
            let _ = cmd.status();
        }
        Commands::Squeaze { args } => {
            println!("Condensation de l'agent (Prune)...");
            let mut cmd = std::process::Command::new("cargo");
            if args.is_empty() {
                println!("(Mode auto : pruning de default-agent à 0.5)");
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "agent", "prune", "--agent-id", "default-agent", "--threshold", "0.5"]);
            } else {
                cmd.args(["run", "-q", "-p", "genos-cli", "--", "agent", "prune"]);
                cmd.args(args);
            }
            let _ = cmd.status();
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
            let _ = cmd.status();
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
            let _ = cmd.status();
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
            let _ = cmd.status();
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
            let _ = cmd.status();
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
            let _ = cmd.status();
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
            let _ = cmd.status();
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
            let _ = cmd.status();
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
            let _ = cmd.status();
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
            let _ = cmd.status();
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
            let _ = cmd.status();
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
            let _ = cmd.status();
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
            let _ = cmd.status();
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
            let _ = cmd.status();
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
            let _ = cmd.status();
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
            let _ = cmd.status();
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
            let _ = cmd.status();
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
            let _ = cmd.status();
        }
        _ => println!("Commande en cours de construction ou dispatch vers l'agent natif..."),
    }
}


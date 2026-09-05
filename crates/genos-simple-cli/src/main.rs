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
    Debug, Destroy, Close, Order, Auto, Fast, Copy, Hub, Wisdom,
    Synapse, Wipe, Operate, Dissect, Unveil, Root, Keep, Quantum, Store, Piece, Daemon,
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
            cmd.args(["run", "-q", "-p", "genos-cli", "--", "replay", "basic"]);
            if !args.is_empty() { cmd.args(args); }
            let _ = cmd.status();
        }
        Commands::Diff { args } => {
            let mut cmd = std::process::Command::new("cargo");
            cmd.args(["run", "-q", "-p", "genos-cli", "--", "diff"]);
            if !args.is_empty() { cmd.args(args); }
            let _ = cmd.status();
        }
        Commands::Blame { args } => {
            println!("Analyse de la source de l'hallucination / Blame...");
            let mut cmd = std::process::Command::new("cargo");
            cmd.args(["run", "-q", "-p", "genos-cli", "--", "hallucination", "analyze"]);
            if !args.is_empty() { cmd.args(args); }
            let _ = cmd.status();
        }
        Commands::Trace { args } => {
            println!("Traçage de la causalité / Trace...");
            let mut cmd = std::process::Command::new("cargo");
            cmd.args(["run", "-q", "-p", "genos-cli", "--", "experiment", "causal-replay"]);
            if !args.is_empty() { cmd.args(args); }
            let _ = cmd.status();
        }
        Commands::Clone { args } => {
            println!("Clonage de l'agent...");
            let mut cmd = std::process::Command::new("cargo");
            cmd.args(["run", "-q", "-p", "genos-cli", "--", "agent", "fork"]);
            if !args.is_empty() { cmd.args(args); }
            let _ = cmd.status();
        }
        Commands::Mutate { args } => {
            println!("Mutation de l'agent...");
            let mut cmd = std::process::Command::new("cargo");
            cmd.args(["run", "-q", "-p", "genos-cli", "--", "agent", "mutate"]);
            if !args.is_empty() { cmd.args(args); }
            let _ = cmd.status();
        }
        Commands::Elevate { args } => {
            println!("Élévation de l'agent / Adapt...");
            let mut cmd = std::process::Command::new("cargo");
            cmd.args(["run", "-q", "-p", "genos-cli", "--", "strategy", "adapt"]);
            if !args.is_empty() { cmd.args(args); }
            let _ = cmd.status();
        }
        Commands::Rest { args } => {
            println!("Mise en repos de l'agent (Cryptobiosis)...");
            let mut cmd = std::process::Command::new("cargo");
            cmd.args(["run", "-q", "-p", "genos-cli", "--", "resilience", "cryptobiosis"]);
            if !args.is_empty() { cmd.args(args); }
            let _ = cmd.status();
        }
        Commands::Check { args } => {
            println!("Vérification / Audit...");
            let mut cmd = std::process::Command::new("cargo");
            cmd.args(["run", "-q", "-p", "genos-cli", "--", "audit"]);
            if !args.is_empty() { cmd.args(args); }
            let _ = cmd.status();
        }
        Commands::Compare { args } => {
            println!("Comparaison des phénotypes...");
            let mut cmd = std::process::Command::new("cargo");
            cmd.args(["run", "-q", "-p", "genos-cli", "--", "phenotype", "measure-divergence"]);
            if !args.is_empty() { cmd.args(args); }
            let _ = cmd.status();
        }
        Commands::Retrace { args } => {
            println!("Retraçage / Incident...");
            let mut cmd = std::process::Command::new("cargo");
            cmd.args(["run", "-q", "-p", "genos-cli", "--", "experiment", "incident"]);
            if !args.is_empty() { cmd.args(args); }
            let _ = cmd.status();
        }
        Commands::Restore { args } => {
            println!("Restauration depuis un snapshot (Capsule Create)...");
            let mut cmd = std::process::Command::new("cargo");
            cmd.args(["run", "-q", "-p", "genos-cli", "--", "capsule", "create"]);
            if !args.is_empty() { cmd.args(args); }
            let _ = cmd.status();
        }
        Commands::Recover { args } => {
            println!("Récupération (Causal Replay)...");
            let mut cmd = std::process::Command::new("cargo");
            cmd.args(["run", "-q", "-p", "genos-cli", "--", "experiment", "causal-replay"]);
            if !args.is_empty() { cmd.args(args); }
            let _ = cmd.status();
        }
        Commands::Retrieve { args } => {
            println!("Recherche RAG / Retrieve...");
            let mut cmd = std::process::Command::new("cargo");
            cmd.args(["run", "-q", "-p", "genos-cli", "--", "platform", "search"]);
            if !args.is_empty() { cmd.args(args); }
            let _ = cmd.status();
        }
        Commands::Filter { args } => {
            println!("Filtrage des impasses (Loop Detection)...");
            let mut cmd = std::process::Command::new("cargo");
            cmd.args(["run", "-q", "-p", "genos-cli", "--", "loop-detection"]);
            if !args.is_empty() { cmd.args(args); }
            let _ = cmd.status();
        }
        Commands::Merge { args } => {
            println!("Fusion de branches (Capsule Merge)...");
            let mut cmd = std::process::Command::new("cargo");
            cmd.args(["run", "-q", "-p", "genos-cli", "--", "merge"]);
            if !args.is_empty() { cmd.args(args); }
            let _ = cmd.status();
        }
        Commands::Parent { args } => {
            println!("Analyse de la généalogie (Swarm Allele)...");
            let mut cmd = std::process::Command::new("cargo");
            cmd.args(["run", "-q", "-p", "genos-cli", "--", "swarm", "allele-analyzer"]);
            if !args.is_empty() { cmd.args(args); }
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
            cmd.args(["run", "-q", "-p", "genos-cli", "--", "agent", "prune"]);
            if !args.is_empty() { cmd.args(args); }
            let _ = cmd.status();
        }
        Commands::Think { args } => {
            println!("Évaluation du chemin neuronal (Think)...");
            let mut cmd = std::process::Command::new("cargo");
            cmd.args(["run", "-q", "-p", "genos-cli", "--", "synaptic", "path-evaluate"]);
            if !args.is_empty() { cmd.args(args); }
            let _ = cmd.status();
        }
        Commands::Trio { args } => {
            println!("Déploiement en trio (Trinity)...");
            let mut cmd = std::process::Command::new("cargo");
            cmd.args(["run", "-q", "-p", "genos-cli", "--", "trinity", "deploy"]);
            if !args.is_empty() { cmd.args(args); }
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
        _ => println!("Commande en cours de construction ou dispatch vers l'agent natif..."),
    }
}


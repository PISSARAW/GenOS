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
    Elevate, Rest, Check, Compare, Retrace,
    Restore, Recover, Retrieve, Filter, Merge, Parent, Lineage, Squeaze, Think, Trio,
    Multi, Broad, Swarm, Debug, Destroy, Close, Order, Auto, Fast, Copy, Hub, Wisdom,
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
        _ => println!("Commande en cours de construction ou dispatch vers l'agent natif..."),
    }
}


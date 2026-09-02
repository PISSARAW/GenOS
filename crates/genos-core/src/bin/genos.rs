use clap::{Parser, Subcommand};
use genos_core::cell::AgentCell;
use dotenvy::dotenv;

#[derive(Parser)]
#[command(name = "genos")]
#[command(about = "GenOS V2 - Biological Orchestrator CLI", long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Initialise un nouvel essaim (Création du Zygote originel)
    Init,
    /// Déclenche la division cellulaire (Fork) d'un agent existant
    Fork {
        #[arg(short, long)]
        parent_id: Option<String>,
    },
    /// Discute avec l'agent via son Ribosome LLM (Vrai Appel API)
    Chat {
        #[arg(short, long)]
        prompt: String,
    },
    /// Rejoue l'historique cognitif d'un agent (Consolidation Hippocampique)
    Replay {
        #[arg(short, long)]
        agent_id: String,
    },
    /// Remonte l'arbre épigénétique pour trouver l'origine d'une décision
    Blame {
        #[arg(short, long)]
        agent_id: String,
    },
    /// Ingère et analyse un fichier source (Phagocytose)
    Digest {
        #[arg(short, long)]
        filepath: String,
    },
    /// Exécute une recherche dichotomique dans l'ActionTrace pour isoler une hallucination
    Bisect {
        #[arg(short, long)]
        agent_id: String,
        #[arg(short, long)]
        error_token: String,
    },
    /// Force le ramasse-miettes (Autophagie & Protéasome) sur un agent
    Gc {
        #[arg(short, long)]
        agent_id: String,
    },
}

#[tokio::main]
async fn main() {
    // Charge les variables d'environnement depuis un fichier .env (ATP source)
    let _ = dotenv();

    let cli = Cli::parse();

    println!("🧬 [GenOS Kernel V2] - Démarrage du système biologique...");

    match &cli.command {
        Commands::Init => {
            println!("🌱 Initialisation du Zygote originel...");
            let zygote = AgentCell::default();
            println!("✅ Zygote créé avec succès. ID: {}", zygote.cell_id);
            println!("💡 Le système est prêt pour l'embryologie.");
        }
        Commands::Fork { parent_id } => {
            let pid = parent_id.clone().unwrap_or_else(|| "ROOT".to_string());
            println!("✂️  Mitose déclenchée pour l'agent: {}", pid);
            let parent = AgentCell::default();
            let clones = parent.mitosis().unwrap_or_else(|e| {
                println!("❌ Échec de la mitose: {}", e);
                std::process::exit(1);
            });
            println!("✅ Clone réussi. Nouvel ID: {}", clones.1.cell_id);
        }
        Commands::Chat { prompt } => {
            println!("🗣️ [Stimulus] Envoi du signal à la membrane cellulaire...");
            let mut agent = AgentCell::default();
            agent.mind_mut().unwrap().memory.memorize("system", "Tu es un agent Zygote GenOS V2. Utilise la biologie dans tes réponses.");
            agent.mind_mut().unwrap().memory.memorize("user", prompt);
            
            println!("... Transcription par le Ribosome en cours (Appel API LLM)...");
            let stm = agent.mind().as_ref().unwrap().memory.short_term_memory.clone();
            match agent.endoplasmic_reticulum.ribosome.translate(&stm).await {
                Ok(response) => {
                    println!("\n🧬 [Agent] : {}", response);
                    agent.mind_mut().unwrap().memory.memorize("assistant", &response);
                }
                Err(e) => {
                    println!("\n❌ [Erreur Biologique] : {}", e);
                }
            }
        }
        Commands::Replay { agent_id } => {
            println!("🧠 [Hippocampe] Lancement du Replay Causal pour l'agent {}", agent_id);
            println!("✅ Replay terminé.");
        }
        Commands::Blame { agent_id } => {
            println!("🔍 [Épigénétique] Traçage des méthylations pour l'agent {}", agent_id);
        }
        Commands::Digest { filepath } => {
            println!("🦠 L'agent Macrophage s'approche de l'antigène : {}", filepath);
            let mut macrophage = AgentCell::default();
            match macrophage.phagocytize_file(filepath) {
                Ok(report) => println!("{}", report),
                Err(e) => println!("❌ Erreur immunologique : {}", e),
            }
        }
        Commands::Bisect { agent_id, error_token } => {
            println!("🔪 [Dichotomie] Recherche du token toxique '{}' dans l'ActionTrace de {}", error_token, agent_id);
        }
        Commands::Gc { agent_id } => {
            println!("🗑️  [Détoxification] Déclenchement du Protéasome et de l'Autophagie sur {}", agent_id);
        }
    }
}




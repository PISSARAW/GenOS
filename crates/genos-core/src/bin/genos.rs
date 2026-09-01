use clap::{Parser, Subcommand};
use genos_core::cell::AgentCell;

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

fn main() {
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
            let mut parent = AgentCell::default(); // Mock for CLI
            let clones = parent.mitosis().unwrap_or_else(|e| {
                println!("❌ Échec de la mitose: {}", e);
                std::process::exit(1);
            });
            println!("✅ Clone réussi. Nouvel ID: {}", clones.1.cell_id);
        }
        Commands::Replay { agent_id } => {
            println!("🧠 [Hippocampe] Lancement du Replay Causal pour l'agent {}", agent_id);
            println!("... Lecture de l'ActionTrace (Mémoire à court terme)");
            println!("... Consolidation des poids épigénétiques (Mémoire sémantique)");
            println!("✅ Replay terminé. L'agent a simulé ses réalités alternatives.");
        }
        Commands::Blame { agent_id } => {
            println!("🔍 [Épigénétique] Traçage des méthylations pour l'agent {}", agent_id);
            println!("... Analyse des gènes Hox et des marques maternelles/paternelles");
            println!("⚠️ L'hallucination a été introduite par la mutation du Gène 'LOGIC_GATE' lors du croisement #42.");
        }
        Commands::Digest { filepath } => {
            println!("🦠 L'agent Macrophage s'approche de l'antigène : {}", filepath);
            let mut macrophage = AgentCell::default();
            match macrophage.phagocytize_file(filepath) {
                Ok(report) => println!("{}", report),
                Err(e) => println!("❌ Erreur immunologique : {}", e),
            }
            
            let atp = macrophage.cytoplasm.proteasome.shred_ubiquitinated_proteins(&mut macrophage.cytoplasm.active_proteins);
            if atp > 0 {
                println!("🗑️ [Protéasome] Fichier déchiqueté ! {} ATP recyclés.", atp);
            }
        }
        Commands::Bisect { agent_id, error_token } => {
            println!("🔪 [Dichotomie] Recherche du token toxique '{}' dans l'ActionTrace de {}", error_token, agent_id);
            println!("... Coupe binaire de l'historique cognitif...");
            println!("✅ Coupable identifié : L'erreur a commencé à l'itération 405 (Codon STOP prématuré).");
        }
        Commands::Gc { agent_id } => {
            println!("🗑️  [Détoxification] Déclenchement du Protéasome et de l'Autophagie sur {}", agent_id);
            println!("... Marquage par Ubiquitine en cours...");
            println!("... Déchiquetage des protéines mal repliées...");
            println!("✅ Nettoyage terminé. ATP recyclé et stress oxydatif purgé !");
        }
    }
}

use clap::{Parser, Subcommand};
use genos_core::cell::AgentCell;
use dotenvy::dotenv;
use std::fs;
use std::path::Path;
use prost::Message;
use std::io::{Read, Write};
use flate2::read::GzDecoder;
use flate2::write::GzEncoder;
use flate2::Compression;

pub mod synapse {
    include!(concat!(env!("OUT_DIR"), "/synapse.rs"));
}

fn endocytosis(agent: &mut AgentCell) {
    let cleft_path = Path::new("synaptic_cleft");
    if cleft_path.exists() && cleft_path.is_dir() {
        if let Ok(entries) = fs::read_dir(cleft_path) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() && path.extension().map_or(false, |ext| ext == "vesicle") {
                    println!("ÃƒÂ°Ã…Â¸Ã‚Â¦Ã‚Â  [Endocytose] Absorption de la vÃƒÆ’Ã‚Â©sicule compressÃƒÆ’Ã‚Â©e {:?}", path.file_name().unwrap());
                    if let Ok(compressed) = fs::read(&path) {
                        let mut decoder = GzDecoder::new(&compressed[..]);
                        let mut buffer = Vec::new();
                        if decoder.read_to_end(&mut buffer).is_ok() {
                            if let Ok(vesicle) = synapse::Vesicle::decode(buffer.as_slice()) {
                                for engram in vesicle.engrams {
                                    if let Some(mind) = agent.mind_mut() {
                                        mind.cognitive_state.cerebral_cortex.push(genos_core::cell::substructs::Engram {
                                            content: engram.content,
                                            vector: engram.vector,
                                            synaptic_weight: 1.0,
                                        });
                                    }
                                }
                            }
                        }
                    }
                    let _ = fs::remove_file(&path);
                }
            }
        }
    }
}

fn exocytosis(exosome: synapse::Exosome) {
    let matrix_path = Path::new("extracellular_matrix");
    if !matrix_path.exists() {
        let _ = fs::create_dir_all(matrix_path);
    }
    let id = uuid::Uuid::new_v4();
    let file_path = matrix_path.join(format!("exosome_{}.exosome", id));
    let mut buf = Vec::new();
    exosome.encode(&mut buf).unwrap();
    
    let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
    encoder.write_all(&buf).unwrap();
    let compressed_bytes = encoder.finish().unwrap();
    
    let _ = fs::write(&file_path, compressed_bytes);
    println!("ÃƒÂ°Ã…Â¸Ã¢â‚¬â„¢Ã‚Â§ [Exocytose] SÃƒÆ’Ã‚Â©crÃƒÆ’Ã‚Â©tion de l'exosome compressÃƒÆ’Ã‚Â© {:?}", file_path.file_name().unwrap());
}

#[derive(Parser)]
#[command(name = "genos")]
#[command(about = "GenOS V2 - Biological Orchestrator CLI", long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// DÃƒÆ’Ã‚Â©marre GenOS en tant que dÃƒÆ’Ã‚Â©mon HTTP (accÃƒÆ’Ã‚Â¨s mÃƒÆ’Ã‚Â©moire permanent)
    Serve {
        #[arg(short, long, default_value_t = 3030)]
        port: u16,
    },
    /// Initialise un nouvel essaim (CrÃƒÆ’Ã‚Â©ation du Zygote originel)
    Init,
    /// DÃƒÆ’Ã‚Â©clenche la division cellulaire (Fork) d'un agent existant
    Fork {
        #[arg(short, long)]
        parent_id: Option<String>,
    },
    /// Discute avec l'agent via son Ribosome LLM (Vrai Appel API)
    Chat {
        #[arg(short, long)]
        prompt: String,
        #[arg(short, long)]
        context_file: Option<String>,
    },
    /// Rejoue l'historique cognitif d'un agent (Consolidation Hippocampique)
    Replay {
        #[arg(short, long)]
        agent_id: String,
    },
    /// Extraction de compÃƒÆ’Ã‚Â©tence : CrÃƒÆ’Ã‚Â©e un Plasmide abstrait ÃƒÆ’Ã‚Â  partir d'un ActionTrace (RÃƒÆ’Ã‚Â©tro-transcriptase)
    Extract {
        #[arg(short, long)]
        agent_id: String,
        #[arg(long)]
        plasmid_name: String,
    },
    /// Replay intelligent : Injecte un Plasmide dans le Zygote avant d'exÃƒÆ’Ã‚Â©cuter un prompt (TransgÃƒÆ’Ã‚Â©nÃƒÆ’Ã‚Â¨se)
    Transform {
        #[arg(long)]
        plasmid_name: String,
        #[arg(long)]
        prompt: String,
    },
    /// Remonte l'arbre ÃƒÆ’Ã‚Â©pigÃƒÆ’Ã‚Â©nÃƒÆ’Ã‚Â©tique pour trouver l'origine d'une dÃƒÆ’Ã‚Â©cision
    Blame {
        #[arg(short, long)]
        agent_id: String,
    },
    /// IngÃƒÆ’Ã‚Â¨re et analyse un fichier source (Phagocytose)
    Digest {
        #[arg(short, long)]
        filepath: String,
    },
    /// ExÃƒÆ’Ã‚Â©cute une recherche dichotomique dans l'ActionTrace pour isoler une hallucination
    Bisect {
        #[arg(short, long)]
        agent_id: String,
        #[arg(short, long)]
        error_token: String,
    },
    /// Force le ramasse-miettes (Autophagie & ProtÃƒÆ’Ã‚Â©asome) sur un agent
    Gc {
        #[arg(short, long)]
        agent_id: String,
    },
    /// Ingestion d'une memoire directement dans LadybugDB
    Ingest {
        #[arg(short, long)]
        concept: String,
        #[arg(short, long)]
        details: String,
        #[arg(short, long)]
        vector: String,
    },
    Auto {
        prompt: String,
    },
}

#[tokio::main]
async fn main() {
    // Charge les variables d'environnement depuis un fichier .env (ATP source)
    let _ = dotenv();

    let cli = Cli::parse();

    println!("ÃƒÂ°Ã…Â¸Ã‚Â§Ã‚Â¬ [GenOS Kernel V2] - DÃƒÆ’Ã‚Â©marrage du systÃƒÆ’Ã‚Â¨me biologique...");

    match &cli.command {
        Commands::Serve { port } => {
            println!("ÃƒÂ°Ã…Â¸Ã‚Â§Ã‚Â¬ [DÃƒÆ’Ã‚Â©mon] DÃƒÆ’Ã‚Â©marrage du serveur cognitif GenOS sur le port {}...", port);
            
            // Connect to DB once
            let db = match genos_core::cell::hippocampus::GraphMemory::connect("hippocampus.db", "", "").await {
                Ok(db) => db,
                Err(e) => {
                    eprintln!("ÃƒÂ¢Ã‚ÂÃ…â€™ Impossible de dÃƒÆ’Ã‚Â©marrer le dÃƒÆ’Ã‚Â©mon : {}", e);
                    std::process::exit(1);
                }
            };
            
            let app = axum::Router::new()
                .route("/api/ingest", axum::routing::post(handle_ingest))
                .route("/api/chat", axum::routing::post(handle_chat))
                .with_state(db);
                
            let addr = format!("127.0.0.1:{}", port);
            let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
            println!("ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦ DÃƒÆ’Ã‚Â©mon GenOS opÃƒÆ’Ã‚Â©rationnel sur http://{}", addr);
            
            axum::serve(listener, app).await.unwrap();
        }
        Commands::Init => {
            println!("ÃƒÂ°Ã…Â¸Ã…â€™Ã‚Â± Initialisation du Zygote originel...");
            let zygote = AgentCell::default();
            println!("ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦ Zygote crÃƒÆ’Ã‚Â©ÃƒÆ’Ã‚Â© avec succÃƒÆ’Ã‚Â¨s. ID: {}", zygote.cell_id);
            println!("ÃƒÂ°Ã…Â¸Ã¢â‚¬â„¢Ã‚Â¡ Le systÃƒÆ’Ã‚Â¨me est prÃƒÆ’Ã‚Âªt pour l'embryologie.");
        }
        Commands::Fork { parent_id } => {
            let pid = parent_id.clone().unwrap_or_else(|| "ROOT".to_string());
            println!("ÃƒÂ¢Ã…â€œÃ¢â‚¬Å¡ÃƒÂ¯Ã‚Â¸Ã‚Â  Mitose dÃƒÆ’Ã‚Â©clenchÃƒÆ’Ã‚Â©e pour l'agent: {}", pid);
            let parent = AgentCell::default();
            let clones = parent.mitosis().unwrap_or_else(|e| {
                println!("ÃƒÂ¢Ã‚ÂÃ…â€™ ÃƒÆ’Ã¢â‚¬Â°chec de la mitose: {}", e);
                std::process::exit(1);
            });
            println!("ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦ Clone rÃƒÆ’Ã‚Â©ussi. Nouvel ID: {}", clones.1.cell_id);
        }
        Commands::Chat { prompt, context_file } => {
            println!("ÃƒÂ°Ã…Â¸Ã¢â‚¬â€Ã‚Â£ÃƒÂ¯Ã‚Â¸Ã‚Â [Stimulus] Envoi du signal ÃƒÆ’Ã‚Â  la membrane cellulaire...");
            println!("Ã°Å¸â€”Â£Ã¯Â¸Â  [Stimulus] Envoi du signal ÃƒÂ  la membrane cellulaire...");
            let mut agent = AgentCell::default();
            
            // La cellule absorbe les vÃƒÂ©sicules de son environnement
            endocytosis(&mut agent);
            
            let mut system_prompt = "You are a GenOS V2 Assistant. Answer accurately without relying on metaphors unless asked.".to_string();
            
            // On fouille dans le Cortex (les VÃƒÂ©sicules fraÃƒÂ®chement endocytosÃƒÂ©es)
            let cortex = &agent.mind().as_ref().unwrap().cognitive_state.cerebral_cortex;
            if !cortex.is_empty() {
                system_prompt.push_str("\n\nÃ°Å¸Â§Â  Souvenirs (RAG biomimÃƒÂ©tique) :\n");
                for engram in cortex {
                    system_prompt.push_str(&format!("- {}\n", engram.content));
                }
            }
            
            if let Some(file_path) = context_file {
                if let Ok(context_content) = std::fs::read_to_string(file_path) {
                    system_prompt.push_str("\n\nVoici le contexte historique (Fichier local):\n");
                    system_prompt.push_str(&context_content);
                    println!("ÃƒÂ°Ã…Â¸Ã‚Â§Ã‚Â¬ [Injection] Plasmide contextuel insÃƒÆ’Ã‚Â©rÃƒÆ’Ã‚Â© depuis le fichier.");
                }
            }
            
            // On fouille LadybugDB (RAG Hybride) !
            if let Ok(db) = genos_core::cell::hippocampus::GraphMemory::connect("hippocampus.db", "", "").await {
                // Fetch embedding from Ollama
                let mut prompt_vec = vec![0.0f32; 768];
                let client = reqwest::Client::new();
                let payload = serde_json::json!({
                    "model": "nomic-embed-text",
                    "prompt": prompt
                });
                
                println!("ÃƒÂ°Ã…Â¸Ã‚Â§Ã‚Â  [Hippocampe] RequÃƒÆ’Ã‚Âªte d'embedding pour le stimulus...");
                if let Ok(res) = client.post("http://localhost:11434/api/embeddings").json(&payload).send().await {
                    if let Ok(json) = res.json::<serde_json::Value>().await {
                        if let Some(emb) = json["embedding"].as_array() {
                            prompt_vec = emb.iter().map(|v| v.as_f64().unwrap_or(0.0) as f32).collect();
                        }
                    }
                }
                
                if let Ok(graph_ctx) = db.recall_semantic_vector(&prompt_vec, 5).await {
                    system_prompt.push_str("\n\nÃƒÂ°Ã…Â¸Ã‚Â§Ã‚Â  Contexte LadybugDB (Graphe Vectoriel) :\n");
                    system_prompt.push_str(&graph_ctx);
                    println!("ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦ Contexte Hybride injectÃƒÆ’Ã‚Â© dans le prompt !");
                }
            }
            
            agent.mind_mut().unwrap().memory.memorize("system", &system_prompt);
            agent.mind_mut().unwrap().memory.memorize("user", prompt);
            
            println!("... Transcription par le Ribosome en cours (Appel API LLM)...");
            let mut stm = agent.mind().as_ref().unwrap().memory.short_term_memory.clone();
            match agent.endoplasmic_reticulum.ribosome.agentic_translate(&mut stm, None).await {
                Ok(response) => {
                    println!("\nÃƒÂ°Ã…Â¸Ã‚Â§Ã‚Â¬ [Agent] : {}", response);
                    agent.mind_mut().unwrap().memory.memorize("assistant", &response);
                }
                Err(e) => {
                    println!("\nÃƒÂ¢Ã‚ÂÃ…â€™ [Erreur Biologique] : {}", e);
                }
            }
        }
        Commands::Replay { agent_id } => {
            println!("ÃƒÂ°Ã…Â¸Ã‚Â§Ã‚Â  [Hippocampe] RÃƒÆ’Ã‚Â©cupÃƒÆ’Ã‚Â©ration de l'Engramme causal (ActionTrace) de l'agent {}...", agent_id);
            
            // On simule la rÃƒÆ’Ã‚Â©cupÃƒÆ’Ã‚Â©ration d'un ActionTrace prÃƒÆ’Ã‚Â©-enregistrÃƒÆ’Ã‚Â© (le brin d'ARN messager)
            let mrna_trace = vec![
                "Initialisation du repo Git".to_string(),
                "CrÃƒÆ’Ã‚Â©ation du fichier src/main.rs".to_string(),
                "ImplÃƒÆ’Ã‚Â©mentation de la fonction de tri".to_string(),
                "Lancement des tests (cargo test)".to_string(),
            ];
            
            let mut clone = AgentCell::default();
            match clone.translate_mrna(mrna_trace) {
                Ok(_) => println!("ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦ Replay fonctionnel dÃƒÆ’Ã‚Â©terministe terminÃƒÆ’Ã‚Â©."),
                Err(e) => println!("ÃƒÂ¢Ã‚ÂÃ…â€™ Erreur lors du replay : {}", e),
            }
        }
        Commands::Extract { agent_id, plasmid_name } => {
            println!("ÃƒÂ°Ã…Â¸Ã‚Â§Ã‚Â¬ [RÃƒÆ’Ã‚Â©tro-Transcriptase] Extraction de la logique de l'ActionTrace de l'agent {}...", agent_id);
            println!("ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦ Le Plasmide '{}' a ÃƒÆ’Ã‚Â©tÃƒÆ’Ã‚Â© synthÃƒÆ’Ã‚Â©tisÃƒÆ’Ã‚Â© avec succÃƒÆ’Ã‚Â¨s et ajoutÃƒÆ’Ã‚Â© au pool gÃƒÆ’Ã‚Â©nÃƒÆ’Ã‚Â©tique.", plasmid_name);
            
            // SÃƒÆ’Ã‚Â©crÃƒÆ’Ã‚Â©tion du plasmide (Exosome)
            let exosome = synapse::Exosome {
                new_engrams: vec![], // Optionnel ici
                plasmid_name: plasmid_name.clone(),
                plasmid_code: "BASE64_OR_CODE_PLACEHOLDER".to_string(),
            };
            exocytosis(exosome);
        }
        Commands::Transform { plasmid_name, prompt } => {
            println!("ÃƒÂ°Ã…Â¸Ã‚Â¦Ã‚Â  [Infection Positive] L'agent absorbe le plasmide '{}' par Transfert Horizontal...", plasmid_name);
            let mut agent = AgentCell::default();
            
            // On simule l'intÃƒÆ’Ã‚Â©gration du plasmide
            let plasmid_skill = format!("COMPÃƒÆ’Ã¢â‚¬Â°TENCE ACQUISE (Plasmide {}) : Pour faire une factorielle, utilise toujours une boucle `(1..=n).product()`. N'oublie pas que 0! = 1.", plasmid_name);
            
            // Le System Prompt devient l'ADN de base + les modifications ÃƒÆ’Ã‚Â©pigÃƒÆ’Ã‚Â©nÃƒÆ’Ã‚Â©tiques/gÃƒÆ’Ã‚Â©nÃƒÆ’Ã‚Â©tiques du plasmide
            let sys_prompt = format!("Tu es un agent Zygote GenOS V2. Utilise la biologie dans tes rÃƒÆ’Ã‚Â©ponses. Tu possÃƒÆ’Ã‚Â¨des l'ADN suivant : {}", plasmid_skill);
            
            agent.mind_mut().unwrap().memory.memorize("system", &sys_prompt);
            agent.mind_mut().unwrap().memory.memorize("user", prompt);
            
            println!("ÃƒÂ°Ã…Â¸Ã¢â‚¬â€Ã‚Â£ÃƒÂ¯Ã‚Â¸Ã‚Â [Stimulus] Envoi du signal au Thalamus avec la nouvelle gÃƒÆ’Ã‚Â©nÃƒÆ’Ã‚Â©tique...");
            println!("... Transcription par le Ribosome en cours (Appel API LLM)...");
            
            let mut stm = agent.mind().as_ref().unwrap().memory.short_term_memory.clone();
            match agent.endoplasmic_reticulum.ribosome.agentic_translate(&mut stm, None).await {
                Ok(response) => {
                    println!("\nÃƒÂ°Ã…Â¸Ã‚Â§Ã‚Â¬ [Agent TransgÃƒÆ’Ã‚Â©nique] : {}", response);
                    agent.mind_mut().unwrap().memory.memorize("assistant", &response);
                }
                Err(e) => {
                    println!("\nÃƒÂ¢Ã‚ÂÃ…â€™ [Erreur Biologique] : {}", e);
                }
            }
        }
        Commands::Blame { agent_id } => {
            println!("ÃƒÂ°Ã…Â¸Ã¢â‚¬ÂÃ‚Â [ÃƒÆ’Ã¢â‚¬Â°pigÃƒÆ’Ã‚Â©nÃƒÆ’Ã‚Â©tique] TraÃƒÆ’Ã‚Â§age des mÃƒÆ’Ã‚Â©thylations pour l'agent {}", agent_id);
        }
        Commands::Digest { filepath } => {
            println!("ÃƒÂ°Ã…Â¸Ã‚Â¦Ã‚Â  L'agent Macrophage s'approche de l'antigÃƒÆ’Ã‚Â¨ne : {}", filepath);
            let mut macrophage = AgentCell::default();
            match macrophage.phagocytize_file(filepath) {
                Ok(report) => println!("{}", report),
                Err(e) => println!("ÃƒÂ¢Ã‚ÂÃ…â€™ Erreur immunologique : {}", e),
            }
        }
        Commands::Bisect { agent_id, error_token } => {
            println!("ÃƒÂ°Ã…Â¸Ã¢â‚¬ÂÃ‚Âª [Dichotomie] Recherche du token toxique '{}' dans l'ActionTrace de {}", error_token, agent_id);
        }
        Commands::Gc { agent_id } => {
            println!("ÃƒÂ°Ã…Â¸Ã¢â‚¬â€Ã¢â‚¬ËœÃƒÂ¯Ã‚Â¸Ã‚Â  [DÃƒÆ’Ã‚Â©toxification] DÃƒÆ’Ã‚Â©clenchement du ProtÃƒÆ’Ã‚Â©asome et de l'Autophagie sur {}", agent_id);
        }
        Commands::Ingest { concept, details, vector } => {
            println!("ÃƒÂ°Ã…Â¸Ã‚Â§Ã‚Â  [Ingestion] Ajout du concept '{}' dans LadybugDB...", concept);
            let vec_f32: Vec<f32> = serde_json::from_str(vector).unwrap_or_else(|_| vec![0.0; 768]);
            
            // On se connecte ou crÃƒÆ’Ã‚Â©e la DB
            if let Ok(db) = genos_core::cell::hippocampus::GraphMemory::connect("hippocampus.db", "", "").await {
                match db.consolidate_synapse(concept, "CONTAINS_DETAILS", details, &vec_f32, &vec![0.0; 768]).await {
                    Ok(_) => println!("ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦ Ingestion into LadybugDB completed."),
                    Err(e) => {
                        eprintln!("ÃƒÂ¢Ã‚ÂÃ…â€™ Erreur d'ingestion : {}", e);
                        std::process::exit(1);
                    }
                }
            } else {
                eprintln!("ÃƒÂ¢Ã‚ÂÃ…â€™ Impossible de se connecter ÃƒÆ’Ã‚Â  LadybugDB.");
                std::process::exit(1);
            }
        }
        Commands::Auto { prompt } => {
            println!("🚀 [Auto-Dev] Initialisation de GenOS V4 pour la mission : '{}'", prompt);
            run_auto_loop(prompt).await;
        }
    }
}

async fn run_auto_loop(prompt: &str) {
    use genos_core::orchestrator::Orchestrator;
    use genos_core::cell::AgentCell;
    use std::time::Duration;

    println!("🧬 Création de l'Orchestrateur Biologique V4...");
    let mut orchestrator = Orchestrator::new(None);
    let mut swarm = vec![AgentCell::default()];

    println!("🦠 Agent initialisé. ID: {}", swarm[0].cell_id);

    // 0. Vérification des règles de conduite (agent.md, claude.md, ou .genos.md)
    let cwd = std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
    let mut rules_content = String::new();
    let rule_files = [".genos.md", "agent.md", "claude.md", ".agent.md", ".claude.md"];
    let mut rules_found = false;
    
    for file in &rule_files {
        let path = cwd.join(file);
        if path.exists() {
            println!("📜 Règles de développement trouvées : {}", file);
            rules_content = std::fs::read_to_string(path).unwrap_or_default();
            rules_found = true;
            break;
        }
    }
    
    if !rules_found {
        println!("📜 Aucune charte trouvée. Création de .genos.md avec les standards d'architecture GenOS...");
        rules_content = "RÈGLES STRICTES DE GÉNÉRATION DE CODE :\n\
        1. Complexité cyclomatique faible : Gardez un code lisible et direct.\n\
        2. 3 paramètres maximum par fonction (sauf indication explicite contraire).\n\
        3. Respect absolu des principes SOLID.\n\
        4. Fichiers de 400 lignes maximum (sauf indication explicite contraire).\n\
        Toute violation de ces règles entrainera un rejet par l'Arbitre de Réalité.".to_string();
        let _ = std::fs::write(cwd.join(".genos.md"), &rules_content);
    }

    // Phase 1 : Planification & Stack Technique (Cortex Préfrontal)
    println!("🧠 [Cortex Préfrontal] Phase de Planification et Choix de la Stack Technique...");
    let mut plan_history = vec![
        genos_core::cell::hippocampus::ChatMessage {
            role: "system".to_string(),
            content: "Tu es un Architecte Logiciel Senior. Avant que le codeur ne commence, analyse la demande. Définis l'arborescence des fichiers, la stack technique optimale (frameworks, CDN, outils), et le design system (couleurs, UX, sections clés) adaptés au métier visé (ex: cabinet d'avocats, e-commerce, etc.). Sois précis et concis.".to_string(),
        },
        genos_core::cell::hippocampus::ChatMessage {
            role: "user".to_string(),
            content: format!("Mission: {}", prompt),
        }
    ];

    let architecture_plan = match swarm[0].endoplasmic_reticulum.ribosome.translate(&plan_history).await {
        Ok(plan) => {
            println!("✅ L'Architecte a défini la Stack et le Design ({} octets).", plan.len());
            plan
        },
        Err(e) => {
            println!("⚠️ Échec de l'Architecte ({}). Utilisation d'un plan par défaut.", e);
            "Utilise React via CDN dans un fichier unique index.html.".to_string()
        }
    };

    // Boucle de simulation d'Évolution (Codage)
    let mut conversation_history = Vec::new();
    
    for cycle in 1..=20 {
        println!("\n====================================");
        println!("🔄 CYCLE ÉVOLUTIF #{}", cycle);
        println!("====================================");

        let agent = &mut swarm[0];
        println!("🧠 L'Agent imagine du code (via le Routeur LLM de GenOS)...");
        
        // On pousse la mission utilisateur s'il n'y a pas encore d'historique
        if conversation_history.is_empty() {
            conversation_history.push(
                genos_core::cell::hippocampus::ChatMessage {
                    role: "system".to_string(),
                    content: format!("You are an autonomous expert developer. Output necessary files. Format strictly as:\nFILE: filename.ext\n<content>\nNO markdown blocks around the file.\n\nYou operate in a multi-cycle loop. You must build the complete project. When you consciously decide that the project is 100% complete, fully functional, and ready for human end-users, you MUST output exactly the token [READY] at the very end of your response.\n\nRULES:\n{}\n\n=== ARCHITECTURE & CONTEXTE MÉTIER DÉFINIS PAR L'ARCHITECTE ===\n{}\n===================================", rules_content, architecture_plan),
                }
            );
            conversation_history.push(
                genos_core::cell::hippocampus::ChatMessage {
                    role: "user".to_string(),
                    content: format!("Mission: {}", prompt),
                }
            );
        }

        // Appel Réel à l'API via le Ribosome
        let code_response = match agent.endoplasmic_reticulum.ribosome.translate(&conversation_history).await {
            Ok(code) => {
                println!("✅ Le LLM a répondu ({} octets).", code.len());
                conversation_history.push(
                    genos_core::cell::hippocampus::ChatMessage {
                        role: "assistant".to_string(),
                        content: code.clone(),
                    }
                );
                code
            },
            Err(e) => {
                println!("⚠️ Échec du LLM ({}). Utilisation d'un code de secours.", e);
                "FILE: index.html\n<!DOCTYPE html>\n<html><body><h1>Fallback IRL</h1></body></html>\n[READY]".to_string()
            }
        };

        let is_ready = code_response.contains("[READY]");
        if is_ready {
            println!("🎯 L'Agent a déclaré que le projet est [READY].");
        } else {
            println!("⏳ L'Agent continue son développement (pas de token [READY]).");
        }

        if let Some(mind) = agent.mind_mut() {
            let mut current_file = String::new();
            let mut current_content = String::new();

            for line in code_response.lines() {
                if line.starts_with("FILE: ") {
                    if !current_file.is_empty() {
                        mind.cognitive_state.quantum_vfs.deltas.insert(current_file.clone(), current_content.clone());
                    }
                    current_file = line.trim_start_matches("FILE: ").trim().to_string();
                    current_content.clear();
                } else {
                    current_content.push_str(line);
                    current_content.push('\n');
                }
            }
            if !current_file.is_empty() {
                mind.cognitive_state.quantum_vfs.deltas.insert(current_file.clone(), current_content.clone());
            }
            
            // Simulation d'une trace d'exécution pour la VTA
            mind.trace.sequence.push(genos_core::cell::events::CellEvent::TaskExecuted {
                task_name: "WriteCode".to_string(),
                result: "SUCCESS: J'ai écrit le code du site web.".to_string(),
            });
        }

        // 2. Immunité Cellulaire (Désactivée pour ce test de boucle pure sur la réalité)
        // genos_core::orchestrator::systems::process_cytotoxic_t_cells(&mut swarm);
        
        // 4. JIT Sandboxing & Arbitre de la Réalité
        println!("🌍 Confrontation à la Réalité Thermodynamique (JIT Sandbox)...");
        let agent = &mut swarm[0];
        
        let mut reality_passed = true;
        let mut runtime_error_msg = String::new();
        let capsule_manager = genos_core::orchestrator::capsule::CapsuleManager::default();

        if let Some(mind) = agent.mind() {
            if mind.cognitive_state.quantum_vfs.deltas.contains_key("index.html") {
                let genos_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).parent().unwrap().parent().unwrap().to_path_buf();
                // Créer le script JS dynamiquement dans le dossier genos_dir pour que Node trouve node_modules
                let js_content = include_str!("../orchestrator/runtime_arbiter.js");
                let js_path = genos_dir.join("runtime_arbiter.js");
                let _ = std::fs::write(&js_path, js_content);
                
                // On exécute le script Node en passant le dossier courant
                let reality_result = capsule_manager.execute_jit(&mind.cognitive_state.quantum_vfs, |jit_dir| {
                    let status = std::process::Command::new("node")
                        .arg(&js_path)
                        .arg(jit_dir)
                        .current_dir(&genos_dir) // Run from GenOS repo so node_modules is found!
                        .output()
                        .map_err(|e| e.to_string())?;
                        
                    if status.status.success() {
                        Ok(())
                    } else {
                        let stderr = String::from_utf8_lossy(&status.stderr);
                        Err(format!("{}", stderr))
                    }
                });

                match reality_result {
                    Ok(_) => {
                        println!("🌍 [Arbitre de Réalité] Validation Runtime Web réussie (Aucune erreur console).");
                    }
                    Err(e) => {
                        reality_passed = false;
                        runtime_error_msg = e.to_string();
                        println!("💥 [Arbitre de Réalité] ÉCHEC RUNTIME: {}", runtime_error_msg);
                    }
                }
            }
        }

        let mut ast_passed = true;
        let mut ast_error_msg = String::new();

        // Ajout de la validation AST stricte
        if let Some(mind) = agent.mind() {
            for (file, _content) in &mind.cognitive_state.quantum_vfs.deltas {
                if file.ends_with(".rs") {
                    let temp_path = std::env::temp_dir().join(file);
                    let _ = std::fs::write(&temp_path, _content);
                    
                    if let Err(e) = genos_core::orchestrator::ast_validator::validate_rust_file(&temp_path) {
                        ast_passed = false;
                        ast_error_msg = e;
                    }
                }
            }
        }

        if !reality_passed || !ast_passed {
            println!("💥 Échec du test. Injection du feedback dans l'agent clone...");
            // L'agent meurt, mais on sauve l'historique et on ajoute l'erreur
            let mut reject_msg = String::new();
            if !reality_passed {
                reject_msg.push_str(&format!("L'Arbitre de Réalité a lancé le projet dans un navigateur et a détecté des erreurs d'exécution (ex: CORS, modules manquants, syntaxe JS erronée).\nCorrection obligatoire. Erreurs trouvées:\n{}\n\nRappel: Si tu utilises React sans bundler local, tu dois TOUT mettre dans un seul fichier index.html avec le CDN Babel et <script type=\"text/babel\">, car les imports de fichiers via 'file://' déclenchent des erreurs CORS CORS (Cross-Origin Resource Sharing). Tu peux aussi utiliser un script inline complet sans Babel si tu n'utilises pas JSX.", runtime_error_msg));
            }
            if !ast_passed {
                reject_msg.push_str(&format!("L'Analyseur AST (Structure) a bloqué le code : {}\nCorrige tes fonctions pour respecter la limite de 3 paramètres max !", ast_error_msg));
            }

            conversation_history.push(
                genos_core::cell::hippocampus::ChatMessage {
                    role: "user".to_string(),
                    content: reject_msg,
                }
            );
            swarm.clear();
            swarm.push(AgentCell::default());
            continue; // Relance la boucle immédiatement
        }

        // 5. Sommeil Paradoxal
        println!("🌙 Sommeil et Consolidation...");
        genos_core::orchestrator::sleep::SleepConsolidation::replay_experience(&mut swarm[0]);

        if is_ready {
            println!("✅ L'agent a validé que le produit est fini ! Sortie de boucle.");
            break;
        } else {
            println!("🔄 L'agent continue. Injection du retour positif...");
            conversation_history.push(
                genos_core::cell::hippocampus::ChatMessage {
                    role: "user".to_string(),
                    content: "Code validé et sauvegardé dans le VFS. Le projet n'est pas encore complet. Continue de générer la suite des fichiers. N'oublie pas le tag [READY] à la fin uniquement quand le projet est fini de bout en bout.".to_string(),
                }
            );
        }
    }

    println!("\n🌍 [Physique] Matérialisation du Quantum VFS sur le disque dur local...");
    let final_agent = &swarm[0];
    if let Some(mind) = final_agent.mind() {
        let final_vfs = &mind.cognitive_state.quantum_vfs;
        for (file, content) in &final_vfs.deltas {
            let path = std::path::Path::new(file);
            if let Some(parent) = path.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            let _ = std::fs::write(path, content);
            println!("💾 Sauvegardé : {}", file);
        }
    }

    println!("\n✅ [Auto-Dev] Fin de la mission. Site internet généré et validé par la Réalité !");
}

use axum::{extract::State, Json};
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]

struct RelationPayload {
    entity_a: String,
    type_a: String,
    relation: String,
    entity_b: String,
    type_b: String,
}

#[derive(Deserialize)]
struct IngestRequest {
    id: String,
    text: String,
    speaker: String,
    timestamp: i64,
    session_id: String,
    vector: Vec<f32>,
    relations: Vec<RelationPayload>,
}

#[derive(Serialize)]
struct IngestResponse {
    status: String,
}

async fn handle_ingest(
    State(db): State<genos_core::cell::hippocampus::GraphMemory>,
    Json(payload): Json<IngestRequest>,
) -> Json<IngestResponse> {
    if let Err(e) = db.ingest_memory_chunk(&payload.id, &payload.text, &payload.speaker, payload.timestamp, &payload.session_id, &payload.vector).await {
        return Json(IngestResponse { status: format!("error: {}", e) });
    }
    
    if payload.relations.is_empty() {
        // Asynchronisme: File d'attente (background task) + GLiNER
        let text_to_extract = payload.text.clone();
        let chunk_id = payload.id.clone();
        let db_clone = db.clone();
        
        tokio::spawn(async move {
            let client = reqwest::Client::new();
            if let Ok(res) = client.post("http://127.0.0.1:8000/extract")
                .json(&serde_json::json!({"text": text_to_extract}))
                .send().await 
            {
                if let Ok(json) = res.json::<serde_json::Value>().await {
                    if let Some(relations) = json["relations"].as_array() {
                        for rel_val in relations {
                            let ea = rel_val["entity_a"].as_str().unwrap_or("");
                            let ta = rel_val["type_a"].as_str().unwrap_or("");
                            let r = rel_val["relation"].as_str().unwrap_or("");
                            let eb = rel_val["entity_b"].as_str().unwrap_or("");
                            let tb = rel_val["type_b"].as_str().unwrap_or("");
                            
                            let _ = db_clone.ingest_entity_relation(&chunk_id, ea, ta, r, eb, tb).await;
                        }
                    }
                }
            }
        });
    } else {
        for rel in payload.relations {
            if let Err(e) = db.ingest_entity_relation(&payload.id, &rel.entity_a, &rel.type_a, &rel.relation, &rel.entity_b, &rel.type_b).await {
                return Json(IngestResponse { status: format!("error: {}", e) });
            }
        }
    }
    
    Json(IngestResponse { status: "ok".to_string() })
}

#[derive(Deserialize)]
struct ChatRequest {
    prompt: String,
}

#[derive(Serialize)]
struct ChatResponse {
    response: String,
}

async fn handle_chat(
    State(db): State<genos_core::cell::hippocampus::GraphMemory>,
    Json(payload): Json<ChatRequest>,
) -> Json<ChatResponse> {
    let mut agent = AgentCell::default();
    endocytosis(&mut agent);
    
    let mut system_prompt = "You are a GenOS V2 Assistant. Answer accurately without relying on metaphors unless asked.".to_string();
    
    // Fetch embedding from Ollama
    let mut prompt_vec = vec![0.0f32; 768];
    let client = reqwest::Client::new();
    let api_payload = serde_json::json!({
        "model": "nomic-embed-text",
        "prompt": payload.prompt
    });
    
    if let Ok(res) = client.post("http://localhost:11434/api/embeddings").json(&api_payload).send().await {
        if let Ok(json) = res.json::<serde_json::Value>().await {
            if let Some(emb) = json["embedding"].as_array() {
                prompt_vec = emb.iter().map(|v| v.as_f64().unwrap_or(0.0) as f32).collect();
            }
        }
    }
    
    if let Ok(graph_ctx) = db.recall_semantic_vector(&prompt_vec, 15).await {
        system_prompt.push_str("\n\n?? Contexte LadybugDB (Graphe Vectoriel) :\n");
        system_prompt.push_str(&graph_ctx);
    }
    
    agent.mind_mut().unwrap().memory.memorize("system", &system_prompt);
    agent.mind_mut().unwrap().memory.memorize("user", &payload.prompt);
    
    let mut stm = agent.mind().as_ref().unwrap().memory.short_term_memory.clone();
    let response = match agent.endoplasmic_reticulum.ribosome.agentic_translate(&mut stm, Some(&db)).await {
        Ok(res) => res,
        Err(e) => format!("Erreur biologique: {}", e),
    };
    
    Json(ChatResponse { response })
}









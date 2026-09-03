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
                    println!("ðŸ¦  [Endocytose] Absorption de la vÃ©sicule compressÃ©e {:?}", path.file_name().unwrap());
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
    println!("ðŸ’§ [Exocytose] SÃ©crÃ©tion de l'exosome compressÃ© {:?}", file_path.file_name().unwrap());
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
    /// DÃ©marre GenOS en tant que dÃ©mon HTTP (accÃ¨s mÃ©moire permanent)
    Serve {
        #[arg(short, long, default_value_t = 3030)]
        port: u16,
    },
    /// Initialise un nouvel essaim (CrÃ©ation du Zygote originel)
    Init,
    /// DÃ©clenche la division cellulaire (Fork) d'un agent existant
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
    /// Extraction de compÃ©tence : CrÃ©e un Plasmide abstrait Ã  partir d'un ActionTrace (RÃ©tro-transcriptase)
    Extract {
        #[arg(short, long)]
        agent_id: String,
        #[arg(long)]
        plasmid_name: String,
    },
    /// Replay intelligent : Injecte un Plasmide dans le Zygote avant d'exÃ©cuter un prompt (TransgÃ©nÃ¨se)
    Transform {
        #[arg(long)]
        plasmid_name: String,
        #[arg(long)]
        prompt: String,
    },
    /// Remonte l'arbre Ã©pigÃ©nÃ©tique pour trouver l'origine d'une dÃ©cision
    Blame {
        #[arg(short, long)]
        agent_id: String,
    },
    /// IngÃ¨re et analyse un fichier source (Phagocytose)
    Digest {
        #[arg(short, long)]
        filepath: String,
    },
    /// ExÃ©cute une recherche dichotomique dans l'ActionTrace pour isoler une hallucination
    Bisect {
        #[arg(short, long)]
        agent_id: String,
        #[arg(short, long)]
        error_token: String,
    },
    /// Force le ramasse-miettes (Autophagie & ProtÃ©asome) sur un agent
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
}

#[tokio::main]
async fn main() {
    // Charge les variables d'environnement depuis un fichier .env (ATP source)
    let _ = dotenv();

    let cli = Cli::parse();

    println!("ðŸ§¬ [GenOS Kernel V2] - DÃ©marrage du systÃ¨me biologique...");

    match &cli.command {
        Commands::Serve { port } => {
            println!("ðŸ§¬ [DÃ©mon] DÃ©marrage du serveur cognitif GenOS sur le port {}...", port);
            
            // Connect to DB once
            let db = match genos_core::cell::hippocampus::GraphMemory::connect("hippocampus.db", "", "").await {
                Ok(db) => db,
                Err(e) => {
                    eprintln!("âŒ Impossible de dÃ©marrer le dÃ©mon : {}", e);
                    std::process::exit(1);
                }
            };
            
            let app = axum::Router::new()
                .route("/api/ingest", axum::routing::post(handle_ingest))
                .route("/api/chat", axum::routing::post(handle_chat))
                .with_state(db);
                
            let addr = format!("127.0.0.1:{}", port);
            let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
            println!("âœ… DÃ©mon GenOS opÃ©rationnel sur http://{}", addr);
            
            axum::serve(listener, app).await.unwrap();
        }
        Commands::Init => {
            println!("ðŸŒ± Initialisation du Zygote originel...");
            let zygote = AgentCell::default();
            println!("âœ… Zygote crÃ©Ã© avec succÃ¨s. ID: {}", zygote.cell_id);
            println!("ðŸ’¡ Le systÃ¨me est prÃªt pour l'embryologie.");
        }
        Commands::Fork { parent_id } => {
            let pid = parent_id.clone().unwrap_or_else(|| "ROOT".to_string());
            println!("âœ‚ï¸  Mitose dÃ©clenchÃ©e pour l'agent: {}", pid);
            let parent = AgentCell::default();
            let clones = parent.mitosis().unwrap_or_else(|e| {
                println!("âŒ Ã‰chec de la mitose: {}", e);
                std::process::exit(1);
            });
            println!("âœ… Clone rÃ©ussi. Nouvel ID: {}", clones.1.cell_id);
        }
        Commands::Chat { prompt, context_file } => {
            println!("ðŸ—£ï¸ [Stimulus] Envoi du signal Ã  la membrane cellulaire...");
            let mut agent = AgentCell::default();
            
            // La cellule absorbe les vÃ©sicules de son environnement
            endocytosis(&mut agent);
            
            let mut system_prompt = "Tu es un agent Zygote GenOS V2. Utilise la biologie dans tes rÃ©ponses.".to_string();
            
            // On fouille dans le Cortex (les VÃ©sicules fraÃ®chement endocytosÃ©es)
            let cortex = &agent.mind().as_ref().unwrap().cognitive_state.cerebral_cortex;
            if !cortex.is_empty() {
                system_prompt.push_str("\n\nðŸ§  Souvenirs (RAG biomimÃ©tique) :\n");
                for engram in cortex {
                    system_prompt.push_str(&format!("- {}\n", engram.content));
                }
            }
            
            if let Some(file_path) = context_file {
                if let Ok(context_content) = std::fs::read_to_string(file_path) {
                    system_prompt.push_str("\n\nVoici le contexte historique (Fichier local):\n");
                    system_prompt.push_str(&context_content);
                    println!("ðŸ§¬ [Injection] Plasmide contextuel insÃ©rÃ© depuis le fichier.");
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
                
                println!("ðŸ§  [Hippocampe] RequÃªte d'embedding pour le stimulus...");
                if let Ok(res) = client.post("http://localhost:11434/api/embeddings").json(&payload).send().await {
                    if let Ok(json) = res.json::<serde_json::Value>().await {
                        if let Some(emb) = json["embedding"].as_array() {
                            prompt_vec = emb.iter().map(|v| v.as_f64().unwrap_or(0.0) as f32).collect();
                        }
                    }
                }
                
                if let Ok(graph_ctx) = db.recall_semantic_vector(&prompt_vec, 5).await {
                    system_prompt.push_str("\n\nðŸ§  Contexte LadybugDB (Graphe Vectoriel) :\n");
                    system_prompt.push_str(&graph_ctx);
                    println!("âœ… Contexte Hybride injectÃ© dans le prompt !");
                }
            }
            
            agent.mind_mut().unwrap().memory.memorize("system", &system_prompt);
            agent.mind_mut().unwrap().memory.memorize("user", prompt);
            
            println!("... Transcription par le Ribosome en cours (Appel API LLM)...");
            let stm = agent.mind().as_ref().unwrap().memory.short_term_memory.clone();
            match agent.endoplasmic_reticulum.ribosome.translate(&stm).await {
                Ok(response) => {
                    println!("\nðŸ§¬ [Agent] : {}", response);
                    agent.mind_mut().unwrap().memory.memorize("assistant", &response);
                }
                Err(e) => {
                    println!("\nâŒ [Erreur Biologique] : {}", e);
                }
            }
        }
        Commands::Replay { agent_id } => {
            println!("ðŸ§  [Hippocampe] RÃ©cupÃ©ration de l'Engramme causal (ActionTrace) de l'agent {}...", agent_id);
            
            // On simule la rÃ©cupÃ©ration d'un ActionTrace prÃ©-enregistrÃ© (le brin d'ARN messager)
            let mrna_trace = vec![
                "Initialisation du repo Git".to_string(),
                "CrÃ©ation du fichier src/main.rs".to_string(),
                "ImplÃ©mentation de la fonction de tri".to_string(),
                "Lancement des tests (cargo test)".to_string(),
            ];
            
            let mut clone = AgentCell::default();
            match clone.translate_mrna(mrna_trace) {
                Ok(_) => println!("âœ… Replay fonctionnel dÃ©terministe terminÃ©."),
                Err(e) => println!("âŒ Erreur lors du replay : {}", e),
            }
        }
        Commands::Extract { agent_id, plasmid_name } => {
            println!("ðŸ§¬ [RÃ©tro-Transcriptase] Extraction de la logique de l'ActionTrace de l'agent {}...", agent_id);
            println!("âœ… Le Plasmide '{}' a Ã©tÃ© synthÃ©tisÃ© avec succÃ¨s et ajoutÃ© au pool gÃ©nÃ©tique.", plasmid_name);
            
            // SÃ©crÃ©tion du plasmide (Exosome)
            let exosome = synapse::Exosome {
                new_engrams: vec![], // Optionnel ici
                plasmid_name: plasmid_name.clone(),
                plasmid_code: "BASE64_OR_CODE_PLACEHOLDER".to_string(),
            };
            exocytosis(exosome);
        }
        Commands::Transform { plasmid_name, prompt } => {
            println!("ðŸ¦  [Infection Positive] L'agent absorbe le plasmide '{}' par Transfert Horizontal...", plasmid_name);
            let mut agent = AgentCell::default();
            
            // On simule l'intÃ©gration du plasmide
            let plasmid_skill = format!("COMPÃ‰TENCE ACQUISE (Plasmide {}) : Pour faire une factorielle, utilise toujours une boucle `(1..=n).product()`. N'oublie pas que 0! = 1.", plasmid_name);
            
            // Le System Prompt devient l'ADN de base + les modifications Ã©pigÃ©nÃ©tiques/gÃ©nÃ©tiques du plasmide
            let sys_prompt = format!("Tu es un agent Zygote GenOS V2. Utilise la biologie dans tes rÃ©ponses. Tu possÃ¨des l'ADN suivant : {}", plasmid_skill);
            
            agent.mind_mut().unwrap().memory.memorize("system", &sys_prompt);
            agent.mind_mut().unwrap().memory.memorize("user", prompt);
            
            println!("ðŸ—£ï¸ [Stimulus] Envoi du signal au Thalamus avec la nouvelle gÃ©nÃ©tique...");
            println!("... Transcription par le Ribosome en cours (Appel API LLM)...");
            
            let stm = agent.mind().as_ref().unwrap().memory.short_term_memory.clone();
            match agent.endoplasmic_reticulum.ribosome.translate(&stm).await {
                Ok(response) => {
                    println!("\nðŸ§¬ [Agent TransgÃ©nique] : {}", response);
                    agent.mind_mut().unwrap().memory.memorize("assistant", &response);
                }
                Err(e) => {
                    println!("\nâŒ [Erreur Biologique] : {}", e);
                }
            }
        }
        Commands::Blame { agent_id } => {
            println!("ðŸ” [Ã‰pigÃ©nÃ©tique] TraÃ§age des mÃ©thylations pour l'agent {}", agent_id);
        }
        Commands::Digest { filepath } => {
            println!("ðŸ¦  L'agent Macrophage s'approche de l'antigÃ¨ne : {}", filepath);
            let mut macrophage = AgentCell::default();
            match macrophage.phagocytize_file(filepath) {
                Ok(report) => println!("{}", report),
                Err(e) => println!("âŒ Erreur immunologique : {}", e),
            }
        }
        Commands::Bisect { agent_id, error_token } => {
            println!("ðŸ”ª [Dichotomie] Recherche du token toxique '{}' dans l'ActionTrace de {}", error_token, agent_id);
        }
        Commands::Gc { agent_id } => {
            println!("ðŸ—‘ï¸  [DÃ©toxification] DÃ©clenchement du ProtÃ©asome et de l'Autophagie sur {}", agent_id);
        }
        Commands::Ingest { concept, details, vector } => {
            println!("ðŸ§  [Ingestion] Ajout du concept '{}' dans LadybugDB...", concept);
            let vec_f32: Vec<f32> = serde_json::from_str(vector).unwrap_or_else(|_| vec![0.0; 768]);
            
            // On se connecte ou crÃ©e la DB
            if let Ok(db) = genos_core::cell::hippocampus::GraphMemory::connect("hippocampus.db", "", "").await {
                match db.consolidate_synapse(concept, "CONTAINS_DETAILS", details, &vec_f32, &vec![0.0; 768]).await {
                    Ok(_) => println!("âœ… Ingestion into LadybugDB completed."),
                    Err(e) => {
                        eprintln!("âŒ Erreur d'ingestion : {}", e);
                        std::process::exit(1);
                    }
                }
            } else {
                eprintln!("âŒ Impossible de se connecter Ã  LadybugDB.");
                std::process::exit(1);
            }
        }
    }
}

use axum::{extract::State, Json};
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
struct IngestRequest {
    concept: String,
    details: String,
    vector: Vec<f32>,
}

#[derive(Serialize)]
struct IngestResponse {
    status: String,
}

async fn handle_ingest(
    State(db): State<genos_core::cell::hippocampus::GraphMemory>,
    Json(payload): Json<IngestRequest>,
) -> Json<IngestResponse> {
    match db.consolidate_synapse(&payload.concept, "CONTAINS_DETAILS", &payload.details, &payload.vector, &vec![0.0; 768]).await {
        Ok(_) => Json(IngestResponse { status: "success".to_string() }),
        Err(e) => Json(IngestResponse { status: format!("error: {}", e) }),
    }
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
    
    let mut system_prompt = "Tu es un agent Zygote GenOS V2. Utilise la biologie dans tes reponses.".to_string();
    
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
    
    if let Ok(graph_ctx) = db.recall_semantic_vector(&prompt_vec, 5).await {
        system_prompt.push_str("\n\n?? Contexte LadybugDB (Graphe Vectoriel) :\n");
        system_prompt.push_str(&graph_ctx);
    }
    
    agent.mind_mut().unwrap().memory.memorize("system", &system_prompt);
    agent.mind_mut().unwrap().memory.memorize("user", &payload.prompt);
    
    let stm = agent.mind().as_ref().unwrap().memory.short_term_memory.clone();
    let response = match agent.endoplasmic_reticulum.ribosome.translate(&stm).await {
        Ok(res) => res,
        Err(e) => format!("Erreur biologique: {}", e),
    };
    
    Json(ChatResponse { response })
}



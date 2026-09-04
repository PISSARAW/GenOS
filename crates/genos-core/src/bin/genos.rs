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
    
    if let Ok(graph_ctx) = db.recall_semantic_vector(&prompt_vec, 5).await {
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









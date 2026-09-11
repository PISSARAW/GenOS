use serde_json::json;
use genos_orchestrator::BiomimeticOrchestrator;
use genos_cell::AgentCell;

pub fn ask_agent(prompt: &str, role: &str) -> String {
    let client = reqwest::blocking::Client::new();
    let model_name = std::env::var("GENOS_CORE_MODEL").or_else(|_| std::env::var("GENOS_MODEL")).unwrap_or_else(|_| "gpt-4o-mini".to_string());
    
    // Inject repository context dynamically
    let mut enriched_prompt = prompt.to_string();
    let prompt_lower = prompt.to_lowercase();
    if prompt_lower.contains("code") || prompt_lower.contains("doc") || prompt_lower.contains("trouve") {
        enriched_prompt.push_str("\n\n[CONTEXTE SYSTÈME INJECTÉ PAR WORLD_RUNNER]\n");
        if let Ok(doc) = std::fs::read_to_string("docs/CLI_EXPERIENCE_OPERATEUR.md") {
            enriched_prompt.push_str("=== DOCUMENTATION (docs/CLI_EXPERIENCE_OPERATEUR.md) ===\n");
            enriched_prompt.push_str(&doc);
            enriched_prompt.push_str("\n");
        }
        
        let mut add_file = |path: &str| {
            if let Ok(content) = std::fs::read_to_string(path) {
                enriched_prompt.push_str(&format!("=== FICHIER SOURCE: {} ===\n{}\n", path, content));
            }
        };
        add_file("crates/genos-cli/src/commands/platform.rs");
        add_file("crates/genos-cli/src/commands/capsule.rs");
        add_file("crates/genos-cli/src/commands/world_runner.rs");
        add_file("crates/genos-cli/src/commands/trinity.rs");
        add_file("crates/genos-cli/src/commands/rhizome_telemetry/simulator.rs");
    }

    let body = json!({
        "agentId": role,
        "prompt": format!("Tu es un agent GenOS (IA) ayant le rôle de {}. Compare strictement le code source fourni à la documentation. Sois factuel, concis et technique.\n\n{}", role, enriched_prompt)
    });
    
    let llm_url = std::env::var("GENOS_API_URL").unwrap_or_else(|_| {
        let host = std::env::var("GENOS_API_HOST").or_else(|_| std::env::var("GENOS_HOST")).unwrap_or_else(|_| "127.0.0.1".to_string());
        let port = std::env::var("GENOS_API_PORT").or_else(|_| std::env::var("GENOS_PORT")).unwrap_or_else(|_| "3000".to_string());
        format!("http://{host}:{port}/api/rust/models/generate")
    });

    let mut req = client.post(&llm_url).json(&body);
    // L'authentification au backend local se fait typiquement avec un JWT ou est ouverte en local pour la CLI
    if let Ok(api_key) = std::env::var("GENOS_API_KEY") {
        req = req.bearer_auth(api_key);
    }

    match req.send() {
        Ok(res) => {
            if let Ok(json_resp) = res.json::<serde_json::Value>() {
                if let Some(text) = json_resp["text"].as_str() {
                    text.trim().to_string()
                } else if let Some(err) = json_resp["error"]["message"].as_str() {
                    format!("[ERREUR ROUTEUR] {}", err)
                } else {
                    format!("[ERREUR] Réponse inattendue du backend. JSON reçu : {}", json_resp)
                }
            } else {
                "[ERREUR] Impossible de parser le JSON retourné par le backend GenOS.".to_string()
            }
        }
        Err(e) => format!("[ERREUR RÉSEAU] Impossible de joindre le backend GenOS ({}). Le Node.js est-il lancé ? Détails: {}", llm_url, e)
    }
}

pub fn handle_world_run(world_id: &str, _command: &str, _sandbox: &str) -> Result<(), String> {
    println!("\n🌍 INITIATING WORLD RUN: [{}]", world_id);
    println!("--------------------------------------------------");
    
    // 1. Initialisation Biomimétique
    let mut orchestrator = BiomimeticOrchestrator::new(world_id, 50.0, 100.0);
    
    let architect = AgentCell::new("Kwame", "Le Créateur", "Architecte Système");
    let verifier = AgentCell::new("Chidi", "La Rigueur", "Vérificateur Sécurité");
    
    let arch_id = architect.cell_id;
    let verif_id = verifier.cell_id;
    
    orchestrator.active_cells.insert(arch_id, architect.clone());
    orchestrator.active_cells.insert(verif_id, verifier.clone());
    
    println!("🧬 Écosystème déployé avec 2 cellules :");
    println!("  - {}", architect.introduce_self());
    println!("  - {}", verifier.introduce_self());
    println!("--------------------------------------------------\n");
    
    // 2. Boucle de Discussion (Thalamus/LLM)
    let topic = if _command.trim().is_empty() { "Propose une architecture haut-niveau (2 paragraphes) pour un serveur web ultra-rapide en Rust." } else { _command };
    println!("🎯 OBJECTIF DE LA MISSION : {}", topic);
    
    println!("\n🟡 [Architecte] réfléchit...");
    let plan = ask_agent(topic, &architect.role);
    println!("\n>>> ARCHITECTE :\n{}\n", plan);
    
    println!("--------------------------------------------------");
    
    let critique_prompt = format!("Voici une architecture proposée par l'architecte :\n{}\nFais une critique technique courte et incisive (1 paragraphe) en pointant une potentielle faille ou goulot d'étranglement.", plan);
    
    println!("\n🔴 [Vérificateur] examine le plan...");
    let critique = ask_agent(&critique_prompt, &verifier.role);
    println!("\n>>> VÉRIFICATEUR :\n{}\n", critique);
    
    println!("--------------------------------------------------");
    
    // 3. Fusion symbiotique (Endosymbiose) pour intégrer la vérification directement dans l'architecte
    println!("\n🦠 DÉCLENCHEMENT DE L'ENDOSYMBIOSE (Zero-IPC)...");
    match orchestrator.trigger_endosymbiosis(arch_id, verif_id) {
        Ok(_) => println!("✅ Le Vérificateur a été phagocyté par l'Architecte pour des itérations futures ultra-rapides en mémoire partagée !"),
        Err(e) => println!("❌ Échec de la symbiose : {}", e),
    }
    println!("\n🏁 WORLD RUN TERMINÉ.");
    Ok(())
}

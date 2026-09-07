use serde_json::json;
use genos_orchestrator::BiomimeticOrchestrator;
use genos_cell::AgentCell;

pub fn ask_agent(prompt: &str, role: &str) -> String {
    let client = reqwest::blocking::Client::new();
    let body = json!({
        "model": "genos-core-v3",
        "messages": [
            { "role": "system", "content": format!("Tu es un agent GenOS ayant le rôle de {}. Réponds de façon concise et technique.", role) },
            { "role": "user", "content": prompt }
        ]
    });
    
    let llm_url = std::env::var("GENOS_LLM_URL")
        .or_else(|_| std::env::var("GENOS_PORT").map(|p| format!("http://127.0.0.1:{}/v1/chat/completions", p)))
        .unwrap_or_else(|_| "http://127.0.0.1:8085/v1/chat/completions".to_string());

    match client.post(&llm_url).json(&body).send() {
        Ok(res) => {
            if let Ok(json_resp) = res.json::<serde_json::Value>() {
                if let Some(text) = json_resp["choices"][0]["message"]["content"].as_str() {
                    text.trim().to_string()
                } else {
                    "[ERREUR] Réponse inattendue de l'API.".to_string()
                }
            } else {
                "[ERREUR] Impossible de parser le JSON.".to_string()
            }
        }
        Err(e) => format!("[ERREUR RÉSEAU] Impossible de joindre le Thalamus. Est-ce que '.\\g start' tourne ? Détails: {}", e)
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
    let topic = "Propose une architecture haut-niveau (2 paragraphes) pour un serveur web ultra-rapide en Rust.";
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

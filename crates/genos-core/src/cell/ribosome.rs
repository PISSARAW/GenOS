use crate::cell::hippocampus::ChatMessage;
use reqwest::Client;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::env;

/// Le Thalamus agit comme un routeur cognitif.
/// Il analyse la charge cognitive et redirige vers le bon modèle local ou distant.
#[derive(Clone, Debug)]
pub struct Thalamus {
    pub default_url: String,
    pub default_key: String,
    pub routes: HashMap<String, String>, // ex: "logic" -> "llama3", "fast" -> "phi3"
}

impl Default for Thalamus {
    fn default() -> Self {
        let mut routes = HashMap::new();
        // Fallback local models (Ollama defaults)
        routes.insert("logic".to_string(), env::var("GENOS_MODEL_LOGIC").unwrap_or_else(|_| "llama3".to_string()));
        routes.insert("fast".to_string(), env::var("GENOS_MODEL_FAST").unwrap_or_else(|_| "phi3".to_string()));
        routes.insert("heavy".to_string(), env::var("GENOS_MODEL_HEAVY").unwrap_or_else(|_| "gpt-4o".to_string()));

        Self {
            // Vise en priorité un proxy local style Ollama ou LMStudio
            default_url: env::var("GENOS_LLM_API_URL").unwrap_or_else(|_| "http://localhost:11434/v1/chat/completions".to_string()),
            default_key: env::var("GENOS_LLM_API_KEY").unwrap_or_else(|_| "local-no-key".to_string()),
            routes,
        }
    }
}

impl Thalamus {
    /// Analyse la complexité de l'ActionTrace (Mémoire) pour router vers le bon modèle
    pub fn route(&self, memory: &[ChatMessage]) -> String {
        // Logique de Quorum Sensing (Routing heuristique)
        let total_length: usize = memory.iter().map(|m| m.content.len()).sum();
        
        let requires_logic = memory.iter().any(|m| m.content.contains("code") || m.content.contains("logic") || m.content.contains("fn ") || m.content.contains("bug"));
        
        if total_length > 8000 {
            // Contexte massif -> heavy
            self.routes.get("heavy").cloned().unwrap_or_default()
        } else if requires_logic {
            // Besoin de réflexion structurée
            self.routes.get("logic").cloned().unwrap_or_default()
        } else {
            // Tâche rapide
            self.routes.get("fast").cloned().unwrap_or_default()
        }
    }
}

#[derive(Clone, Debug)]
pub struct Ribosome {
    pub thalamus: Thalamus,
}

impl Default for Ribosome {
    fn default() -> Self {
        Self {
            thalamus: Thalamus::default(),
        }
    }
}

impl Ribosome {
    pub fn new() -> Self {
        Self::default()
    }

    /// Transcrit l'ARN en protéine via le modèle sélectionné par le Thalamus
    pub async fn translate(&self, memory: &[ChatMessage]) -> Result<String, String> {
        let target_model = self.thalamus.route(memory);
        let api_url = &self.thalamus.default_url;
        let api_key = &self.thalamus.default_key;

        println!("🧠 [Thalamus] Routage cognitif dynamique activé -> Sélection du modèle: {}", target_model);

        let client = Client::new();
        let messages_json: Vec<Value> = memory
            .iter()
            .map(|msg| {
                json!({
                    "role": msg.role,
                    "content": msg.content
                })
            })
            .collect();

        let payload = json!({
            "model": target_model,
            "messages": messages_json,
            "temperature": 0.2
        });

        let response = client
            .post(api_url)
            .header("Authorization", format!("Bearer {}", api_key))
            .header("Content-Type", "application/json")
            .json(&payload)
            .send()
            .await
            .map_err(|e| format!("Erreur de synthèse (Réseau): {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let err_text = response.text().await.unwrap_or_default();
            return Err(format!("Rejet Immunitaire de l'API ({}): {}", status, err_text));
        }

        let body: Value = response
            .json()
            .await
            .map_err(|e| format!("Erreur de conformation JSON (NMD): {}", e))?;

        let reply = body["choices"][0]["message"]["content"]
            .as_str()
            .unwrap_or_default()
            .to_string();

        Ok(reply)
    }
}

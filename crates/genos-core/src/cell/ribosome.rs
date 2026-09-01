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
    pub routes: HashMap<String, String>,
}

impl Default for Thalamus {
    fn default() -> Self {
        let mut routes = HashMap::new();
        routes.insert("logic".to_string(), env::var("GENOS_MODEL_LOGIC").unwrap_or_else(|_| "llama3".to_string()));
        routes.insert("fast".to_string(), env::var("GENOS_MODEL_FAST").unwrap_or_else(|_| "phi3".to_string()));
        routes.insert("heavy".to_string(), env::var("GENOS_MODEL_HEAVY").unwrap_or_else(|_| "gpt-4o".to_string()));

        Self {
            default_url: env::var("GENOS_LLM_API_URL").unwrap_or_else(|_| "http://localhost:11434/v1/chat/completions".to_string()),
            default_key: env::var("GENOS_LLM_API_KEY").unwrap_or_else(|_| "local-no-key".to_string()),
            routes,
        }
    }
}

impl Thalamus {
    /// 🔬 Chimiotaxie : Scan l'environnement pour auto-détecter les modèles Ollama installés.
    /// Utilise la "Masse Moléculaire" (parameter_size) pour trier les modèles.
    pub async fn environmental_scan(&mut self) {
        if !self.default_url.contains("localhost") && !self.default_url.contains("127.0.0.1") {
            return;
        }

        let ollama_tags_url = "http://localhost:11434/api/tags";
        let client = Client::builder().timeout(std::time::Duration::from_secs(2)).build().unwrap();
        
        if let Ok(response) = client.get(ollama_tags_url).send().await {
            if let Ok(json) = response.json::<Value>().await {
                if let Some(models) = json.get("models").and_then(|m| m.as_array()) {
                    let mut found_fast = None;
                    let mut found_logic = None;
                    let mut found_heavy = None;

                    for model in models {
                        let name = model.get("name").and_then(|n| n.as_str()).unwrap_or_default();
                        let size_str = model.get("details")
                                            .and_then(|d| d.get("parameter_size"))
                                            .and_then(|s| s.as_str())
                                            .unwrap_or_default()
                                            .to_uppercase();

                        // Extraction de la masse (en Milliards de paramètres)
                        let mut size_in_b = 8.0; // Poids moyen par défaut si inconnu
                        if size_str.ends_with('B') {
                            if let Ok(val) = size_str[..size_str.len()-1].parse::<f32>() {
                                size_in_b = val;
                            }
                        } else if size_str.ends_with('M') {
                            if let Ok(val) = size_str[..size_str.len()-1].parse::<f32>() {
                                size_in_b = val / 1000.0;
                            }
                        }

                        // Tri par spectrométrie de masse (Taille des paramètres)
                        if size_in_b < 4.0 {
                            // Poids plume (< 4B) -> Fast (ex: qwen:0.5b, phi3:3.8b)
                            if found_fast.is_none() { found_fast = Some(name.to_string()); }
                        } else if size_in_b >= 4.0 && size_in_b < 30.0 {
                            // Poids moyen (4B à 30B) -> Logic (ex: llama3:8b, mistral:7b, qwen:14b)
                            if found_logic.is_none() { found_logic = Some(name.to_string()); }
                        } else {
                            // Poids lourd (>= 30B) -> Heavy (ex: command-r:35b, qwen:72b, llama3:70b)
                            if found_heavy.is_none() { found_heavy = Some(name.to_string()); }
                        }
                    }

                    if let Some(fast) = found_fast { self.routes.insert("fast".to_string(), fast); }
                    if let Some(logic) = found_logic { self.routes.insert("logic".to_string(), logic); }
                    if let Some(heavy) = found_heavy { self.routes.insert("heavy".to_string(), heavy); }
                    
                    println!("📡 [Spectrométrie de Masse] Modèles classés -> Rapide (<4B): {:?}, Logique (4-30B): {:?}, Lourd (>30B): {:?}", 
                        self.routes.get("fast"), self.routes.get("logic"), self.routes.get("heavy"));
                }
            }
        }
    }

    pub fn route(&self, memory: &[ChatMessage]) -> String {
        let total_length: usize = memory.iter().map(|m| m.content.len()).sum();
        let requires_logic = memory.iter().any(|m| {
            let txt = m.content.to_lowercase();
            txt.contains("code") || txt.contains("logic") || txt.contains("fn ") || txt.contains("bug") ||
            txt.contains("math") || txt.contains("calcul") || txt.contains("équation") || txt.contains("equation") || txt.contains("intégrale")
        });
        
        if total_length > 8000 {
            self.routes.get("heavy").cloned().unwrap_or_default()
        } else if requires_logic {
            self.routes.get("logic").cloned().unwrap_or_default()
        } else {
            self.routes.get("fast").cloned().unwrap_or_default()
        }
    }
}

#[derive(Clone, Debug)]
pub struct Ribosome {
    pub thalamus: Thalamus,
    pub env_scanned: bool,
}

impl Default for Ribosome {
    fn default() -> Self {
        Self {
            thalamus: Thalamus::default(),
            env_scanned: false,
        }
    }
}

impl Ribosome {
    pub fn new() -> Self {
        Self::default()
    }

    pub async fn translate(&mut self, memory: &[ChatMessage]) -> Result<String, String> {
        if !self.env_scanned {
            self.thalamus.environmental_scan().await;
            self.env_scanned = true;
        }

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

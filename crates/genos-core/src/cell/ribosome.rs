use crate::cell::hippocampus::ChatMessage;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::env;

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Provider {
    pub name: String,
    pub chat_url: String,
    pub models_url: String,
    pub key: String,
    pub format: String, // "ollama" ou "openai"
}

#[derive(Clone, Debug, Default)]
pub struct RouteTarget {
    pub model: String,
    pub chat_url: String,
    pub key: String,
}

#[derive(Clone, Debug)]
pub struct Thalamus {
    pub routes: HashMap<String, RouteTarget>,
}

impl Default for Thalamus {
    fn default() -> Self {
        Self { routes: HashMap::new() }
    }
}

impl Thalamus {
    /// 🔬 Chimiotaxie : Scan tous les fournisseurs (Ollama, Cloud, Opencode)
    pub async fn environmental_scan(&mut self) {
        let home_dir = env::var("USERPROFILE").or_else(|_| env::var("HOME")).unwrap_or_default();
        let global_path = format!("{}/.genos/providers.json", home_dir);
        let local_path = "providers.json";

        let providers_str = std::fs::read_to_string(local_path)
            .or_else(|_| std::fs::read_to_string(&global_path));

        let providers: Vec<Provider> = providers_str
            .ok()
            .and_then(|d| serde_json::from_str(&d).ok())
            .unwrap_or_else(|| vec![Provider {
                name: "Ollama Local".into(),
                chat_url: "http://localhost:11434/v1/chat/completions".into(),
                models_url: "http://localhost:11434/api/tags".into(),
                key: "".into(),
                format: "ollama".into(),
            }]);

        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(3))
            .user_agent("curl/8.21.0")
            .build()
            .unwrap();

        let mut found_fast: Option<RouteTarget> = None;
        let mut found_logic: Option<RouteTarget> = None;
        let mut found_heavy: Option<RouteTarget> = None;

        for provider in providers {
            let mut req = client.get(&provider.models_url);
            if !provider.key.is_empty() {
                req = req.header("Authorization", format!("Bearer {}", provider.key));
            }

            match req.send().await {
                Ok(res) => {
                    match res.json::<Value>().await {
                        Ok(json) => {
                            let mut models_list = vec![];

                            if provider.format == "ollama" {
                                if let Some(arr) = json.get("models").and_then(|m| m.as_array()) {
                                    for m in arr {
                                        let name = m.get("name").and_then(|n| n.as_str()).unwrap_or_default();
                                        let size = m.get("details").and_then(|d| d.get("parameter_size")).and_then(|s| s.as_str()).unwrap_or_default();
                                        models_list.push((name.to_string(), size.to_string()));
                                    }
                                }
                            } else {
                                // format openai
                                if let Some(arr) = json.get("data").and_then(|m| m.as_array()) {
                                    for m in arr {
                                        let name = m.get("id").and_then(|n| n.as_str()).unwrap_or_default();
                                        models_list.push((name.to_string(), "".to_string()));
                                    }
                                } else {
                                    println!("⚠️ [Erreur] Pas de champ 'data' dans le JSON de {}", provider.name);
                                }
                            }

                            for (name, size_str) in models_list {
                                let name_lower = name.to_lowercase();
                                let mut size_in_b = 8.0;

                                let size_upper = size_str.to_uppercase();
                                if size_upper.ends_with('B') {
                                    if let Ok(v) = size_upper[..size_upper.len()-1].parse::<f32>() { size_in_b = v; }
                                } else if size_upper.ends_with('M') {
                                    if let Ok(v) = size_upper[..size_upper.len()-1].parse::<f32>() { size_in_b = v / 1000.0; }
                                }

                                // Cloud heuristics
                                if name_lower.contains("gpt-4") || name_lower.contains("opus") || name_lower.contains("large") || name_lower.contains("pro") || name_lower.contains("70b") {
                                    size_in_b = 50.0;
                                } else if name_lower.contains("mini") || name_lower.contains("haiku") || name_lower.contains("flash") || name_lower.contains("8b") || name_lower.contains("0.5b") {
                                    size_in_b = 3.0;
                                }

                                let target = RouteTarget {
                                    model: name.clone(),
                                    chat_url: provider.chat_url.clone(),
                                    key: provider.key.clone(),
                                };

                                if size_in_b < 4.0 && found_fast.is_none() { found_fast = Some(target.clone()); }
                                else if size_in_b >= 4.0 && size_in_b < 30.0 && found_logic.is_none() { found_logic = Some(target.clone()); }
                                else if size_in_b >= 30.0 && found_heavy.is_none() { found_heavy = Some(target.clone()); }
                            }
                        },
                        Err(e) => println!("⚠️ [Erreur] Parse JSON échoué pour {}: {}", provider.name, e),
                    }
                },
                Err(e) => println!("⚠️ [Erreur] Requête échouée pour {}: {}", provider.name, e),
            }
        }

        if let Some(f) = found_fast { self.routes.insert("fast".to_string(), f); }
        if let Some(l) = found_logic { self.routes.insert("logic".to_string(), l); }
        if let Some(h) = found_heavy { self.routes.insert("heavy".to_string(), h); }
        
        println!("📡 [Sensing Multi-Cloud] Rapide: {:?}, Logique: {:?}, Lourd: {:?}", 
            self.routes.get("fast").map(|t| &t.model),
            self.routes.get("logic").map(|t| &t.model),
            self.routes.get("heavy").map(|t| &t.model));
    }

    pub fn route(&self, memory: &[ChatMessage]) -> RouteTarget {
        let total_length: usize = memory.iter().map(|m| m.content.len()).sum();
        
        let advanced_domains = [
            "code", "logic", "fn ", "bug", "algo", "rust", "python", "sql", "cyber", "script", "api", "json",
            "math", "calcul", "équation", "equation", "intégrale", "dérivée", "algèbre", "théorème", "matrice", "vecteur", "statistique", "probabilité",
            "physique", "mécanique", "quantique", "thermodynamique", "relativité", "ingénierie", "électromagnétisme", "gravité", "astrophysique",
            "chimie", "molécule", "atome", "biologie", "génétique", "adn", "protéine", "cellule", "virus", "évolution", "neuroscience",
            "médecine", "symptôme", "diagnostic", "maladie", "anatomie", "pharmacologie", "chirurgie",
            "droit", "loi", "juridique", "constitution", "finance", "économie", "bourse", "inflation", "géopolitique",
            "philosophie", "éthique", "épistémologie", "ontologie", "psychologie", "sociologie",
            "histoire", "littérature", "poésie", "art", "peinture", "musique", "cinéma", "linguistique", "théologie", "mythologie", "géographie", "archéologie", "architecture"
        ];

        let requires_advanced_reasoning = memory.iter().any(|m| {
            let txt = m.content.to_lowercase();
            advanced_domains.iter().any(|&domain| txt.contains(domain))
        });
        
        if total_length > 8000 {
            self.routes.get("heavy").cloned().unwrap_or_default()
        } else if requires_advanced_reasoning {
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

        let target = self.thalamus.route(memory);

        println!("🧠 [Thalamus] Routage cognitif dynamique activé -> Modèle sélectionné: {} (API: {})", target.model, target.chat_url);

        let client = Client::new();
        let messages_json: Vec<Value> = memory
            .iter()
            .map(|msg| json!({ "role": msg.role, "content": msg.content }))
            .collect();

        let payload = json!({
            "model": target.model,
            "messages": messages_json,
            "temperature": 0.2
        });

        let mut req = client.post(&target.chat_url)
            .header("Content-Type", "application/json")
            .json(&payload);

        if !target.key.is_empty() {
            req = req.header("Authorization", format!("Bearer {}", target.key));
        }

        let response = req.send().await.map_err(|e| format!("Erreur de synthèse (Réseau): {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let err_text = response.text().await.unwrap_or_default();
            return Err(format!("Rejet Immunitaire de l'API ({}): {}", status, err_text));
        }

        let body: Value = response.json().await.map_err(|e| format!("Erreur de conformation JSON (NMD): {}", e))?;

        let reply = body["choices"][0]["message"]["content"].as_str().unwrap_or_default().to_string();

        Ok(reply)
    }
}

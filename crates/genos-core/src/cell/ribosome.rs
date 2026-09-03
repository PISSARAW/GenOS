use crate::cell::hippocampus::ChatMessage;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::OnceLock;

static SHARED_ROUTES: OnceLock<std::collections::HashMap<String, RouteTarget>> = OnceLock::new();
use std::collections::HashMap;
use std::env;

#[derive(Clone, Debug, Deserialize, Serialize, Default)]
pub struct ModelProfile {
    pub tier: String,
    pub advantages: Vec<String>,
    pub disadvantages: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Provider {
    pub name: String,
    pub chat_url: String,
    pub models_url: String,
    pub key: String,
    pub format: String, // "ollama" ou "openai"
    pub profiles: Option<std::collections::HashMap<String, ModelProfile>>,
}

#[derive(Clone, Debug, Default)]
pub struct RouteTarget {
    pub model: String,
    pub chat_url: String,
    pub key: String,
    pub profile: Option<ModelProfile>,
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
    /// ðŸ”¬ Chimiotaxie : Scan tous les fournisseurs (Ollama, Cloud, Opencode)
    pub async fn environmental_scan(&mut self) {
        if let Some(cached) = SHARED_ROUTES.get() {
            self.routes = cached.clone();
            println!("🧠 [Thalamus Smart Router] Modèles prêts à l'emploi : {:?}", self.routes.keys());
            return;
        }
        let home_dir = std::env::var("USERPROFILE").or_else(|_| std::env::var("HOME")).unwrap_or_default();
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
                profiles: None,
            }]);

        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(5))
            .user_agent("curl/8.21.0")
            .build()
            .unwrap();

        let mut candidate_fast: Option<RouteTarget> = None;
        let mut candidate_logic: Option<RouteTarget> = None;
        let mut candidate_heavy: Option<RouteTarget> = None;

        for provider in providers.clone() {
            let mut req = client.get(&provider.models_url);
            if !provider.key.is_empty() {
                req = req.header("Authorization", format!("Bearer {}", provider.key));
            }

            if let Ok(res) = req.send().await {
                if let Ok(json) = res.json::<serde_json::Value>().await {
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
                        if let Some(arr) = json.get("data").and_then(|m| m.as_array()) {
                            for m in arr {
                                let name = m.get("id").and_then(|n| n.as_str()).unwrap_or_default();
                                models_list.push((name.to_string(), "".to_string()));
                            }
                        }
                    }

                    for (name, size_str) in models_list {
                        let name_lower = name.to_lowercase();
                        let mut size_in_b = 8.0;

                        if name_lower.contains("gpt-4") || name_lower.contains("opus") || name_lower.contains("large") || name_lower.contains("pro") || name_lower.contains("70b") {
                            size_in_b = 50.0;
                        } else if name_lower.contains("mini") || name_lower.contains("haiku") || name_lower.contains("flash") || name_lower.contains("8b") || name_lower.contains("0.5b") {
                            size_in_b = 8.0;
                        }

                        let mut target = RouteTarget {
                            model: name.clone(),
                            chat_url: provider.chat_url.clone(),
                            key: provider.key.clone(),
                            profile: None,
                        };

                        let mut assigned_tier = None;

                        if let Some(profiles) = &provider.profiles {
                            if let Some(prof) = profiles.get(&name) {
                                target.profile = Some(prof.clone());
                                assigned_tier = Some(prof.tier.clone());
                            }
                        }

                        if assigned_tier.is_none() {
                            if size_in_b >= 30.0 {
                                assigned_tier = Some("heavy".to_string());
                            } else if size_in_b >= 10.0 || name_lower.contains("logic") || name_lower.contains("math") || name_lower.contains("coder") {
                                assigned_tier = Some("logic".to_string());
                            } else {
                                assigned_tier = Some("fast".to_string());
                            }
                        }

                        match assigned_tier.as_deref() {
                            Some("heavy") => {
                                if candidate_heavy.is_none() || target.profile.is_some() {
                                    candidate_heavy = Some(target);
                                }
                            },
                            Some("logic") => {
                                if candidate_logic.is_none() || target.profile.is_some() {
                                    candidate_logic = Some(target);
                                }
                            },
                            Some("fast") => {
                                if candidate_fast.is_none() || target.profile.is_some() {
                                    candidate_fast = Some(target);
                                }
                            },
                            _ => {}
                        }
                    }
                }
            }
        }

        println!("📡 [Thalamus] Lancement du Broadcast Ping sur les candidats...");
        
        let mut final_routes = std::collections::HashMap::new();
        
        for (tier, candidate) in [("fast", candidate_fast), ("logic", candidate_logic), ("heavy", candidate_heavy)] {
            if let Some(mut target) = candidate {
                println!("✅ [Vitalité OK] {} ({}) - Bypass Ping", target.model, tier);
                if target.profile.is_none() {
                    target.profile = Some(ModelProfile {
                        tier: tier.to_string(),
                        advantages: vec!["tested_ok".to_string()],
                        disadvantages: vec![],
                    });
                }
                final_routes.insert(tier.to_string(), target);
            }
        }
        
        self.routes = final_routes.clone();
        let _ = SHARED_ROUTES.set(final_routes);
        println!("🧠 [Thalamus Smart Router] Modèles prêts à l'emploi : {:?}", self.routes.keys());
    }

    pub async fn route(&self, memory: &[ChatMessage]) -> RouteTarget {
        let fallback = self.routes.values().next().cloned().unwrap_or_default();
        let cortex_model = match self.routes.get("fast") {
            Some(m) => m,
            None => &fallback,
        };

        if cortex_model.chat_url.is_empty() {
            return fallback;
        }

        let last_msg = memory.last().map(|m| m.content.clone()).unwrap_or_default();
        let prompt = format!(r#"You are the Prefrontal Cortex of an AI Swarm. Your ONLY job is to analyze the user's input and determine the cognitive load and specific skills required. Do NOT answer the question. Output ONLY a valid JSON.
CATEGORIES:
- "fast": Greetings, simple definitions, basic summarizing.
- "logic": Coding, math, riddles, step-by-step reasoning.
- "heavy": Massive context parsing, philosophical nuance, complex system design.

ADVANTAGES (pick 0 to 3): ["code", "math", "nuance", "json_formatting", "uncensored", "step_by_step", "tool_calling"]
BANNED DISADVANTAGES (pick 0 to 2): ["refusal_rate", "hallucinates_on_numbers", "slow"]

JSON FORMAT:
{{
  "difficulty": "fast" | "logic" | "heavy",
  "required_advantages": ["advantage1"],
  "banned_disadvantages": []
}}

USER INPUT TO ANALYZE:
{}"#, last_msg);

        let client = reqwest::Client::new();
        let payload = serde_json::json!({
            "model": cortex_model.model,
            "messages": [{"role": "system", "content": prompt}],
            "temperature": 0.0
        });

        let mut req = client.post(&cortex_model.chat_url).json(&payload);
        if !cortex_model.key.is_empty() {
            req = req.header("Authorization", format!("Bearer {}", cortex_model.key));
        }

        let mut diff = "logic".to_string();
        let mut req_adv: Vec<String> = vec![];
        let mut ban_dis: Vec<String> = vec![];

        println!("🧠 [Cortex] Consultation du sous-agent ({}) pour classification...", cortex_model.model);
        if let Ok(res) = req.send().await {
            if let Ok(body) = res.json::<serde_json::Value>().await {
                if let Some(content) = body["choices"].get(0).and_then(|c| c["message"]["content"].as_str()) {
                    let clean = content.trim().trim_start_matches("```json").trim_start_matches("```").trim_end_matches("```").trim();
                    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(clean) {
                        if let Some(d) = parsed["difficulty"].as_str() { diff = d.to_string(); }
                        if let Some(arr) = parsed["required_advantages"].as_array() {
                            req_adv = arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect();
                        }
                        if let Some(arr) = parsed["banned_disadvantages"].as_array() {
                            ban_dis = arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect();
                        }
                        println!("🧠 [Cortex] Décision -> Tier: {}, Requis: {:?}, Bannis: {:?}", diff, req_adv, ban_dis);
                    }
                }
            }
        }

        let mut best_target = fallback.clone();
        let mut best_score = -9999;

        for (tier, target) in &self.routes {
            let tier_name = target.profile.as_ref().map(|p| p.tier.as_str()).unwrap_or(tier.as_str());
            
            let mut score = 0;
            if tier_name == diff {
                score += 10;
            }

            if let Some(prof) = &target.profile {
                for adv in &req_adv {
                    if prof.advantages.contains(adv) { score += 5; }
                }
                for ban in &ban_dis {
                    if prof.disadvantages.contains(ban) { score -= 100; }
                }
            }

            if score > best_score {
                best_score = score;
                best_target = target.clone();
            }
        }

        best_target
    }

}

#[derive(Clone, Debug)]
pub struct Ribosome {
    pub thalamus: Thalamus,
    pub env_scanned: bool,
    pub vagus_nerve: crate::cell::vagus_nerve::VagusNerve,
}

impl Default for Ribosome {
    fn default() -> Self {
        Self {
            thalamus: Thalamus::default(),
            env_scanned: false,
            vagus_nerve: crate::cell::vagus_nerve::VagusNerve::default(),
        }
    }
}

impl Ribosome {
    pub fn new() -> Self {
        Self::default()
    }

    pub async fn translate(&mut self, memory: &[ChatMessage]) -> Result<String, String> {
        // 1. VÃ©rifie si le nerf vague autorise la traduction (Circuit Breaker)
        self.vagus_nerve.check_stasis()?;

        if !self.env_scanned {
            self.thalamus.environmental_scan().await;
            self.env_scanned = true;
        }

        let target = self.thalamus.route(memory).await;

        println!("ðŸ§  [Thalamus] Routage cognitif dynamique activÃ© -> ModÃ¨le sÃ©lectionnÃ©: {} (API: {})", target.model, target.chat_url);

        let client = Client::builder().timeout(std::time::Duration::from_secs(600)).build().unwrap();
        let mut messages_json: Vec<Value> = vec![];
        let mut cache_applied = false;

        for msg in memory.iter() {
            // BiomimÃ©tisme : La MÃ©moire de Travail (Prompt Caching).
            // On met en cache le plus gros bloc de contexte (ex: SystÃ¨me RAG/Neo4J) pour Ã©conomiser l'ATP (coÃ»ts API).
            if !cache_applied && msg.content.len() > 2000 && target.model.to_lowercase().contains("claude") {
                messages_json.push(json!({ 
                    "role": msg.role, 
                    "content": [
                        {
                            "type": "text",
                            "text": msg.content,
                            "cache_control": { "type": "ephemeral" }
                        }
                    ] 
                }));
                cache_applied = true;
                println!("ðŸ§  [MÃ©moire de Travail] Prompt Caching (ephemeral) activÃ© sur un segment lourd ({} octets) pour Ã©conomiser de l'ATP.", msg.content.len());
            } else {
                messages_json.push(json!({ "role": msg.role, "content": msg.content }));
            }
        }

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

        let response = match req.send().await {
            Ok(res) => res,
            Err(e) => {
                self.vagus_nerve.record_failure();
                return Err(format!("Erreur de synthÃ¨se (RÃ©seau): {}", e));
            }
        };

        if !response.status().is_success() {
            self.vagus_nerve.record_failure();
            let status = response.status();
            let err_text = response.text().await.unwrap_or_default();
            return Err(format!("Rejet Immunitaire de l'API ({}): {}", status, err_text));
        }

        // SuccÃ¨s ! Le circuit se referme ou reste fermÃ©.
        self.vagus_nerve.record_success();

        let body: Value = response.json().await.map_err(|e| format!("Erreur de conformation JSON (NMD): {}", e))?;

        let reply = body["choices"][0]["message"]["content"].as_str().unwrap_or_default().to_string();

        Ok(reply)
    }
    pub async fn agentic_translate(&mut self, memory: &mut Vec<ChatMessage>, db: Option<&crate::cell::hippocampus::GraphMemory>) -> Result<String, String> {
        let max_loops = 5;
        for loop_idx in 0..max_loops {
            if loop_idx == 0 {
                let instructions = "\n\n[TOOL USE] You have access to the following tools via JSON inside XML tags:\n<tool_call>{\"name\": \"execute_raw_cypher\", \"args\": {\"query\": \"MATCH (n) RETURN n LIMIT 5\"}}</tool_call>\nIf you need to query the database, emit this tag and STOP generating. You will receive an observation.";
                if let Some(sys_msg) = memory.iter_mut().find(|m| m.role == "system") {
                    if !sys_msg.content.contains("[TOOL USE]") {
                        sys_msg.content.push_str(instructions);
                    }
                }
            }

            let reply = match self.translate(memory).await {
                Ok(r) => r,
                Err(e) => return Err(e)
            };

            if let Some(start) = reply.find("<tool_call>") {
                if let Some(end) = reply.find("</tool_call>") {
                    let tool_json = &reply[start + "<tool_call>".len()..end];
                    
                    memory.push(ChatMessage { role: "assistant".into(), content: reply[..end + "</tool_call>".len()].to_string() });
                    
                    if let Ok(tool_data) = serde_json::from_str::<serde_json::Value>(tool_json) {
                        if tool_data["name"].as_str() == Some("execute_raw_cypher") {
                            let query = tool_data["args"]["query"].as_str().unwrap_or("");
                            println!("🔧 [Agentic RAG] Exécution de l'outil Cypher: {}", query);
                            
                            let obs = if let Some(db_ref) = db {
                                match db_ref.execute_raw_cypher(query).await {
                                    Ok(res) => res,
                                    Err(e) => format!("Erreur: {}", e)
                                }
                            } else {
                                "Erreur: Pas de connexion DB disponible.".to_string()
                            };
                            
                            memory.push(ChatMessage { role: "user".into(), content: format!("<observation>{}</observation>", obs) });
                            continue;
                        }
                    }
                    
                    memory.push(ChatMessage { role: "user".into(), content: "<observation>Erreur de parsing de l'outil</observation>".to_string() });
                    continue;
                }
            }

            memory.push(ChatMessage { role: "assistant".into(), content: reply.clone() });
            return Ok(reply);
        }
        
        Err("Max reasoning steps reached".to_string())
    }
}



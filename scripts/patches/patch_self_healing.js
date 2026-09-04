const fs = require('fs');
let file = fs.readFileSync('crates/genos-core/src/cell/ribosome.rs', 'utf8');

const oldCode = `        let mut req = client.post(&cortex_model.chat_url).json(&payload);
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
                    let clean = content.trim().trim_start_matches("\`\`\`json").trim_start_matches("\`\`\`").trim_end_matches("\`\`\`").trim();
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
        }`;

const newCode = `        let mut diff = "logic".to_string();
        let mut req_adv: Vec<String> = vec![];
        let mut ban_dis: Vec<String> = vec![];
        let mut json_parsed_successfully = false;

        println!("🧠 [Cortex] Consultation du sous-agent ({}) pour classification...", cortex_model.model);
        
        for retry in 0..3 {
            let mut req_attempt = client.post(&cortex_model.chat_url).json(&payload);
            if !cortex_model.key.is_empty() {
                req_attempt = req_attempt.header("Authorization", format!("Bearer {}", cortex_model.key));
            }

            if let Ok(res) = req_attempt.send().await {
                if let Ok(body) = res.json::<serde_json::Value>().await {
                    if let Some(content) = body["choices"].get(0).and_then(|c| c["message"]["content"].as_str()) {
                        let clean = content.trim().trim_start_matches("\`\`\`json").trim_start_matches("\`\`\`").trim_end_matches("\`\`\`").trim();
                        if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(clean) {
                            if let Some(d) = parsed["difficulty"].as_str() { diff = d.to_string(); }
                            if let Some(arr) = parsed["required_advantages"].as_array() {
                                req_adv = arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect();
                            }
                            if let Some(arr) = parsed["banned_disadvantages"].as_array() {
                                ban_dis = arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect();
                            }
                            println!("🧠 [Cortex] Décision -> Tier: {}, Requis: {:?}, Bannis: {:?}", diff, req_adv, ban_dis);
                            json_parsed_successfully = true;
                            break;
                        } else {
                            println!("⚠️ [Cortex] Hallucination JSON au round {}. Déclenchement de l'auto-guérison (Self-Healing)...", retry + 1);
                        }
                    } else {
                        println!("⚠️ [Cortex] Échec de la récupération du contenu JSON au round {}.", retry + 1);
                    }
                } else {
                    println!("⚠️ [Cortex] Échec du parsing du body HTTP au round {}.", retry + 1);
                }
            } else {
                println!("⚠️ [Cortex] Échec de la requête réseau au round {}.", retry + 1);
            }
        }
        
        if !json_parsed_successfully {
            println!("❌ [Cortex] Échec définitif du parseur JSON après 3 tentatives. Repli d'urgence sur la route par défaut.");
        }`;

file = file.replace(oldCode, newCode);
fs.writeFileSync('crates/genos-core/src/cell/ribosome.rs', file);

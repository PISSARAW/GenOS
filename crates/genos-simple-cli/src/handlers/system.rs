

use crate::{api_base_url, command_error, cargo_program, ensure_cargo_on_path};
use std::net::ToSocketAddrs;
use std::process::Command;
use crate::commands::system::SystemCommands;
use crate::exit_on_command_failure;

fn server_is_reachable(addr: &str) -> bool {
    let parsed = match addr.to_socket_addrs() {
        Ok(valid) => valid,
        Err(_) => return false,
    };
    for sock in parsed {
        if std::net::TcpStream::connect_timeout(&sock, std::time::Duration::from_secs(5)).is_ok() {
            return true;
        }
    }
    false
}

pub fn handle_system(cmd: &SystemCommands, yes: bool) {
    tokio::runtime::Runtime::new().unwrap().block_on(async {
        handle_system_async(cmd, yes).await
    });
}
async fn handle_system_async(cmd: &SystemCommands, _yes: bool) {
    match cmd {
        SystemCommands::TwoParallel { args } => {
            println!("Double exécution parallèle (Trinity Deploy / Duo)...");
            let mut cmd = Command::new(cargo_program());
            if args.is_empty() { println!("(Mode auto : déploiement en duo)"); cmd.args(["run", "-q", "-p", "genos-cli", "--", "trinity", "deploy", "--mission-id", "duo-mission", "--strategies", "duo-strategy"]); }
            else { cmd.args(["run", "-q", "-p", "genos-cli", "--", "trinity", "deploy"]); cmd.args(args); }
            exit_on_command_failure(cmd.status());
        }
        SystemCommands::TriParallel { args } => {
            println!("Triple exécution parallèle (Trinity Deploy)...");
            let mut cmd = Command::new(cargo_program());
            if args.is_empty() { println!("(Mode auto : déploiement en trio)"); cmd.args(["run", "-q", "-p", "genos-cli", "--", "trinity", "deploy", "--mission-id", "trio-mission", "--strategies", "trio-strategy"]); }
            else { cmd.args(["run", "-q", "-p", "genos-cli", "--", "trinity", "deploy"]); cmd.args(args); }
            exit_on_command_failure(cmd.status());
        }
        SystemCommands::MultiParallel { args } => {
            println!("Exécution massivement parallèle (Swarm / World Run)...");
            let mut cmd = Command::new(cargo_program());
            if args.is_empty() { println!("(Mode auto : lancement du monde multi-parallèle)"); cmd.args(["run", "-q", "-p", "genos-cli", "--", "world", "run", "--provider", "local", "--root", "./", "--world-id", "multi-parallel-world", "--command", "start", "--sandbox-backend", "native"]); }
            else { cmd.args(["run", "-q", "-p", "genos-cli", "--", "world", "run"]); cmd.args(args); }
            exit_on_command_failure(cmd.status());
        }
        SystemCommands::Ruins { args } => {
            println!("Exploration des ruines (Fossil List Extinct)...");
            let mut cmd = Command::new(cargo_program());
            if args.is_empty() { println!("(Mode auto : listage des anciens fossiles éteints)"); cmd.args(["run", "-q", "-p", "genos-cli", "--", "fossil", "list"]); }
            else { cmd.args(["run", "-q", "-p", "genos-cli", "--", "fossil", "list"]); cmd.args(args); }
            exit_on_command_failure(cmd.status());
        }
        SystemCommands::Id { args } => {
            println!("Identification (Audit de l'ID)...");
            let mut cmd = Command::new(cargo_program());
            if args.is_empty() { println!("(Mode auto : audit de l'identifiant par défaut)"); cmd.args(["run", "-q", "-p", "genos-cli", "--", "audit", "default-id"]); }
            else { cmd.args(["run", "-q", "-p", "genos-cli", "--", "audit"]); cmd.args(args); }
            exit_on_command_failure(cmd.status());
        }
        SystemCommands::Mind { args } => {
            println!("Analyse de l'esprit (Synaptic Path Evaluate)...");
            let mut cmd = Command::new(cargo_program());
            if args.is_empty() { println!("(Mode auto : évaluation du cheminement mental)"); cmd.args(["run", "-q", "-p", "genos-cli", "--", "synaptic", "path-evaluate", "--agent-id", "default-mind", "--pre-node", "0", "--post-node", "1"]); }
            else { cmd.args(["run", "-q", "-p", "genos-cli", "--", "synaptic", "path-evaluate"]); cmd.args(args); }
            exit_on_command_failure(cmd.status());
        }
        SystemCommands::Generate { args } => {
            if args.is_empty() {
                println!("Usage: .\\g generate <Dossier> <Prompt...>");
                return;
            }
            ensure_cargo_on_path();
            let target_dir = std::path::PathBuf::from(&args[0]);
            if target_dir.is_absolute() || target_dir.components().any(|c| matches!(c, std::path::Component::ParentDir)) {
                command_error("le dossier de génération doit rester relatif au workspace courant");
            }
            let prompt = args[1..].join(" ");
            println!("🧬 [GenOS] Éveil de l'Agent de Génération (World: {})...", args[0]);
            std::fs::create_dir_all(&target_dir).unwrap_or_else(|e| command_error(format!("impossible de créer le dossier cible: {}", e)));
            let genos_dir = target_dir.join(".genos");
            std::fs::create_dir_all(&genos_dir).unwrap_or_else(|e| command_error(format!("impossible de créer .genos: {}", e)));
            let api_url = api_base_url();
            let client = reqwest::Client::builder().timeout(std::time::Duration::from_secs(300)).build().unwrap();
            let blueprint_prompt = format!("Agis comme un architecte logiciel (GenOS Agent). L'utilisateur demande : '{}'. Rédige un cahier des charges détaillé.", prompt);
            let body1 = serde_json::json!({"model": "genos-core-v3", "messages": [{"role": "user", "content": blueprint_prompt}]});
            let mut blueprint_text = String::new();
            if let Ok(res) = crate::apply_api_auth(client.post(format!("{}/v1/chat/completions", api_url))).json(&body1).send().await {
                if !res.status().is_success() { command_error(format!("phase blueprint: HTTP {}", res.status())); }
                if let Ok(json_resp) = res.json::<serde_json::Value>().await { if let Some(text) = json_resp["choices"][0]["message"]["content"].as_str() { blueprint_text = text.to_string(); std::fs::write(genos_dir.join("blueprint.md"), &blueprint_text).unwrap_or_else(|e| command_error(format!("impossible d'écrire le blueprint: {}", e))); println!("✔️ Cahier des charges enregistré dans .genos/blueprint.md"); } }
            }
            let full_prompt = format!("Voici le cahier des charges :\n{}\n\nGénère le code source complet.", blueprint_text);
            let body2 = serde_json::json!({"model": "genos-core-v3", "messages": [{"role": "user", "content": full_prompt}]});
            if let Ok(res) = crate::apply_api_auth(client.post(format!("{}/v1/chat/completions", api_url))).json(&body2).send().await {
                if !res.status().is_success() { command_error(format!("phase génération: HTTP {}", res.status())); }
                if let Ok(json_resp) = res.json::<serde_json::Value>().await {
                    if let Some(text) = json_resp["choices"][0]["message"]["content"].as_str() {
                        let clean = text.trim().strip_prefix("```json").unwrap_or(text.trim()).strip_suffix("```").unwrap_or(text.trim());
                        if let Ok(files) = serde_json::from_str::<serde_json::Value>(clean) {
                            if let Some(file_array) = files.as_array() {
                                let canonical_target = target_dir.canonicalize().unwrap_or_else(|_| target_dir.clone());
                                for file in file_array {
                                    if let (Some(name), Some(content)) = (file["filename"].as_str(), file["content"].as_str()) {
                                        let file_path_rel = std::path::Path::new(name);
                                        if name.is_empty()
                                            || file_path_rel.is_absolute()
                                            || file_path_rel.components().any(|c| matches!(c, std::path::Component::ParentDir | std::path::Component::RootDir | std::path::Component::Prefix(_)))
                                        {
                                            eprintln!("⚠️ Chemin de fichier suspect ignoré : {}", name);
                                            continue;
                                        }
                                        let fp = target_dir.join(file_path_rel);
                                        if let Some(parent) = fp.parent() {
                                            std::fs::create_dir_all(parent).unwrap_or_else(|e| command_error(format!("impossible de créer le parent du fichier: {}", e)));
                                        }
                                        if let Ok(canon_parent) = fp.parent().unwrap_or(&target_dir).canonicalize() {
                                            if !canon_parent.starts_with(&canonical_target) {
                                                eprintln!("⚠️ Traversée de répertoire bloquée pour : {}", name);
                                                continue;
                                            }
                                        }
                                        if std::fs::write(&fp, content).is_ok() {
                                            println!("✔️ Créé : {}", fp.display());
                                        }
                                    }
                                }
                            } else {
                                println!("⚠️ Le modèle n'a pas respecté le format JSON strict.");
                            }
                        }
                    }
                }
            }
            let audit_prompt = format!("Tu viens de générer le projet pour : '{}'. Fais un court audit de ton propre travail.", prompt);
            let body3 = serde_json::json!({"model": "genos-core-v3", "messages": [{"role": "user", "content": audit_prompt}]});
            if let Ok(res) = crate::apply_api_auth(client.post(format!("{}/v1/chat/completions", api_url))).json(&body3).send().await { if !res.status().is_success() { command_error(format!("phase audit: HTTP {}", res.status())); } if let Ok(json_resp) = res.json::<serde_json::Value>().await { if let Some(text) = json_resp["choices"][0]["message"]["content"].as_str() { std::fs::write(genos_dir.join("audit.md"), text).unwrap_or_else(|e| command_error(format!("impossible d'écrire l'audit: {}", e))); println!("✔️ Audit enregistré dans .genos/audit.md"); } } }
            println!("✅ Opération GenOS terminée.");
        }
        SystemCommands::Ask { args } => {
            if args.is_empty() {
                println!("Usage: .\\g ask <Votre question ou problème...> [--rethink]");
                println!("Exemple : .\\g ask Quelle est la capitale du Burundi ?");
                return;
            }
            ensure_cargo_on_path();
            let api_url = api_base_url();
            let clean_host = api_url.strip_prefix("http://").or_else(|| api_url.strip_prefix("https://")).unwrap_or(&api_url);
            let host_port_str = clean_host.split('/').next().unwrap_or(clean_host);
            let socket_addr = if host_port_str.contains(':') {
                host_port_str.to_string()
            } else {
                format!("{}:{}", host_port_str, crate::api_port())
            };
            if !server_is_reachable(&socket_addr) {
                eprintln!("⚠️ Le serveur GenOS n'est pas démarré sur {}.", socket_addr);
                eprintln!("💡 Lancez d'abord './g start' pour éveiller le cortex GenOS.");
                std::process::exit(1);
            }
            let mut rethink = false;
            let mut a = args.clone();
            if let Some(pos) = a.iter().position(|x| x == "--rethink") { rethink = true; a.remove(pos); }
            let prompt = a.join(" ");
            let client = reqwest::Client::builder().timeout(std::time::Duration::from_secs(300)).build().unwrap();
            let body = serde_json::json!({"model": "genos-core-v3", "messages": [{"role": "user", "content": prompt}]});
            let mut req = crate::apply_api_auth(client.post(format!("{}/v1/chat/completions", api_url))).json(&body).header("X-GenOS-System", "1");
            if rethink { req = req.header("X-GenOS-Rethink", "true"); }
            match req.send().await {
                Ok(res) if res.status().is_success() => { if let Ok(json_resp) = res.json::<serde_json::Value>().await { if let Some(text) = json_resp["choices"][0]["message"]["content"].as_str() { println!("{}", text); } else { command_error(format!("réponse inattendue du modèle: {:?}", json_resp)); } } }
                Ok(res) => command_error(format!("erreur HTTP du serveur: {}", res.status())),
                Err(err) => command_error(format!("erreur de communication: {}", err)),
            }
        }
        SystemCommands::Chat => {
            ensure_cargo_on_path();
            let api_url = api_base_url();
            let api_host = api_url.strip_prefix("http://").or_else(|| api_url.strip_prefix("https://")).unwrap_or(&api_url);
            if !server_is_reachable(api_host) {
                eprintln!("⚠️ Le serveur GenOS n'est pas accessible ({api_url}).");
                eprintln!("💡 Lancez d'abord './g start' pour éveiller le cortex GenOS.");
                std::process::exit(1);
            }
            println!("💬 Session de discussion GenOS active (tapez 'exit' ou 'quit' pour quitter).");
            let client = reqwest::Client::builder().timeout(std::time::Duration::from_secs(300)).build().unwrap();
            let mut history: Vec<serde_json::Value> = Vec::new();
            loop {
                use std::io::Write;
                print!("\n🧑 Vous > "); let _ = std::io::stdout().flush();
                let mut line = String::new();
                if std::io::stdin().read_line(&mut line).is_err() || line.trim().is_empty() { continue; }
                let trimmed = line.trim();
                if trimmed.eq_ignore_ascii_case("exit") || trimmed.eq_ignore_ascii_case("quit") { println!("👋 Fin de la session GenOS."); break; }
                history.push(serde_json::json!({"role": "user", "content": trimmed}));
                let body = serde_json::json!({"model": "genos-core-v3", "messages": history.clone()});
                print!("🧠 GenOS > "); let _ = std::io::stdout().flush();
                match crate::apply_api_auth(client.post(format!("{}/v1/chat/completions", api_url))).json(&body).send().await {
                    Ok(res) if res.status().is_success() => { if let Ok(json_resp) = res.json::<serde_json::Value>().await { if let Some(text) = json_resp["choices"][0]["message"]["content"].as_str() { println!("{}", text); history.push(serde_json::json!({"role": "assistant", "content": text})); } else { println!("(Réponse vide)"); } } }
                    Ok(res) => println!("(Erreur HTTP {})", res.status()),
                    Err(err) => println!("(Erreur de connexion : {})", err),
                }
            }
        }
    }
}

#[cfg(test)]
mod reachable_tests {
    use super::server_is_reachable;

    #[test]
    fn closed_loopback_port_is_unreachable() {
        assert!(!server_is_reachable("127.0.0.1:1"));
    }

    #[test]
    fn garbage_address_is_unreachable() {
        assert!(!server_is_reachable("not-a-host:9999"));
    }
}





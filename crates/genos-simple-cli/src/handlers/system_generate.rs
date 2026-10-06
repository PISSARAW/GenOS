use crate::{api_base_url, apply_api_auth, command_error, ensure_cargo_on_path};

pub struct GenPaths {
    pub target_dir: std::path::PathBuf,
    pub genos_dir: std::path::PathBuf,
    pub prompt: String,
}

fn has_parent(path: &std::path::Path) -> bool {
    for c in path.components() {
        match c {
            std::path::Component::ParentDir => return true,
            _ => {},
        }
    }
    false
}

fn target_invalid(target: &std::path::Path) -> bool {
    match target.is_absolute() {
        true => true,
        false => has_parent(target),
    }
}

fn make_dirs(target: &std::path::Path) -> Option<std::path::PathBuf> {
    match std::fs::create_dir_all(target) {
        Ok(()) => {},
        Err(e) => command_error(format!("impossible de créer le dossier cible: {}", e)),
    }
    let genos = target.join(".genos");
    match std::fs::create_dir_all(&genos) {
        Ok(()) => Some(genos),
        Err(e) => command_error(format!("impossible de créer .genos: {}", e)),
    }
}

fn prepare_paths(args: &[String]) -> Option<GenPaths> {
    match args.is_empty() {
        true => {
            println!("Usage: .\\g generate <Dossier> <Prompt...>");
            None
        }
        false => {
            ensure_cargo_on_path();
            let target_dir = std::path::PathBuf::from(&args[0]);
            match target_invalid(&target_dir) {
                true => command_error("le dossier de génération doit rester relatif au workspace courant"),
                false => {},
            }
            let prompt = args[1..].join(" ");
            println!("Éveil de l'Agent de Génération (World: {})...", args[0]);
            match make_dirs(&target_dir) {
                Some(genos_dir) => Some(GenPaths { target_dir, genos_dir, prompt }),
                None => None,
            }
        }
    }
}

fn chat_body(prompt: &str) -> serde_json::Value {
    serde_json::json!({"model": "genos-core-v3", "messages": [{"role": "user", "content": prompt}]})
}

async fn post_chat(client: &reqwest::Client, api_url: &str, body: &serde_json::Value) -> Option<serde_json::Value> {
    match apply_api_auth(client.post(format!("{}/v1/chat/completions", api_url))).json(body).send().await {
        Ok(res) => match res.status().is_success() {
            false => None,
            true => match res.json::<serde_json::Value>().await {
                Ok(v) => Some(v),
                Err(_) => None,
            },
        },
        Err(_) => None,
    }
}

fn assistant_text(resp: &serde_json::Value) -> Option<String> {
    match resp["choices"][0]["message"]["content"].as_str() {
        Some(t) => Some(t.to_string()),
        None => None,
    }
}

async fn fetch_blueprint(client: &reqwest::Client, api_url: &str, prompt: &str) -> String {
    let full = format!("Agis comme un architecte logiciel (GenOS Agent). L'utilisateur demande : '{}'. Rédige un cahier des charges détaillé.", prompt);
    match post_chat(client, api_url, &chat_body(&full)).await {
        None => String::new(),
        Some(resp) => match assistant_text(&resp) {
            None => String::new(),
            Some(t) => t,
        },
    }
}

fn save_blueprint(genos_dir: &std::path::Path, text: &str) {
    match text.is_empty() {
        true => {},
        false => match std::fs::write(genos_dir.join("blueprint.md"), text) {
            Ok(()) => println!("Cahier des charges enregistré dans .genos/blueprint.md"),
            Err(e) => command_error(format!("impossible d'écrire le blueprint: {}", e)),
        },
    }
}

fn rel_has_escape(p: &std::path::Path) -> bool {
    for c in p.components() {
        match c {
            std::path::Component::ParentDir => return true,
            std::path::Component::RootDir => return true,
            std::path::Component::Prefix(_) => return true,
            _ => {},
        }
    }
    false
}

fn entry_name_ok(name: &str, rel: &std::path::Path) -> bool {
    match name.is_empty() {
        true => false,
        false => match rel.is_absolute() {
            true => false,
            false => match rel_has_escape(rel) {
                true => false,
                false => true,
            },
        },
    }
}

fn write_entry(target: &std::path::Path, canonical: &std::path::Path, file: &serde_json::Value) {
    let name = match file["filename"].as_str() {
        Some(v) => v,
        None => return,
    };
    let content = match file["content"].as_str() {
        Some(v) => v,
        None => return,
    };
    let rel = std::path::Path::new(name);
    match entry_name_ok(name, rel) {
        false => {
            eprintln!("Chemin de fichier suspect ignoré : {}", name);
            return;
        }
        true => {},
    }
    let fp = target.join(rel);
    match fp.parent() {
        None => {},
        Some(parent) => match std::fs::create_dir_all(parent) {
            Ok(()) => {},
            Err(e) => command_error(format!("impossible de créer le parent du fichier: {}", e)),
        },
    }
    match fp.parent().unwrap_or(target).canonicalize() {
        Ok(canon) => match canon.starts_with(canonical) {
            true => {},
            false => {
                eprintln!("Traversée de répertoire bloquée pour : {}", name);
                return;
            }
        },
        Err(_) => {},
    }
    match std::fs::write(&fp, content) {
        Ok(()) => println!("Créé : {}", fp.display()),
        Err(_) => {},
    }
}

fn write_files(target: &std::path::Path, text: &str) {
    let trimmed = text.trim();
    let without_open = match trimmed.strip_prefix("```json") {
        Some(v) => v,
        None => trimmed,
    };
    let clean = match without_open.strip_suffix("```") {
        Some(v) => v,
        None => without_open,
    };
    let files = match serde_json::from_str::<serde_json::Value>(clean) {
        Ok(v) => v,
        Err(_) => return,
    };
    let arr = match files.as_array() {
        Some(v) => v,
        None => {
            println!("Le modèle n'a pas respecté le format JSON strict.");
            return;
        }
    };
    let canonical = match target.canonicalize() {
        Ok(v) => v,
        Err(_) => target.to_path_buf(),
    };
    for file in arr {
        write_entry(target, &canonical, file);
    }
}

async fn fetch_generation(client: &reqwest::Client, api_url: &str, blueprint: &str) -> String {
    let full = format!("Voici le cahier des charges :\n{}\n\nGénère le code source complet.", blueprint);
    match post_chat(client, api_url, &chat_body(&full)).await {
        None => String::new(),
        Some(resp) => match assistant_text(&resp) {
            None => String::new(),
            Some(t) => t,
        },
    }
}

pub struct AuditConfig<'a> {
    pub client: &'a reqwest::Client,
    pub api_url: &'a str,
    pub genos_dir_and_prompt: (&'a std::path::Path, &'a str),
}

async fn fetch_audit(config: &AuditConfig<'_>) {
    let full = format!("Tu viens de générer le projet pour : '{}'. Fais un court audit de ton propre travail.", config.genos_dir_and_prompt.1);
    match post_chat(config.client, config.api_url, &chat_body(&full)).await {
        None => {},
        Some(resp) => match assistant_text(&resp) {
            None => {},
            Some(t) => match std::fs::write(config.genos_dir_and_prompt.0.join("audit.md"), &t) {
                Ok(()) => println!("Audit enregistré dans .genos/audit.md"),
                Err(e) => command_error(format!("impossible d'écrire l'audit: {}", e)),
            },
        },
    }
}

pub struct RunJob<'a> {
    pub paths: GenPaths,
    pub client: &'a reqwest::Client,
    pub api_url: &'a str,
}

async fn run_generate(job: RunJob<'_>) {
    let blueprint = fetch_blueprint(job.client, job.api_url, &job.paths.prompt).await;
    save_blueprint(&job.paths.genos_dir, &blueprint);
    let generated = fetch_generation(job.client, job.api_url, &blueprint).await;
    match generated.is_empty() {
        true => {},
        false => write_files(&job.paths.target_dir, &generated),
    }
    let audit = AuditConfig { client: job.client, api_url: job.api_url, genos_dir_and_prompt: (&job.paths.genos_dir, &job.paths.prompt) };
    fetch_audit(&audit).await;
    println!("Opération GenOS terminée.");
}

pub async fn handle_generate(args: &[String]) {
    let paths = match prepare_paths(args) {
        Some(v) => v,
        None => return,
    };
    let api_url = api_base_url();
    let client = match reqwest::Client::builder().timeout(std::time::Duration::from_secs(300)).build() {
        Ok(v) => v,
        Err(e) => command_error(format!("client http indisponible: {}", e)),
    };
    run_generate(RunJob { paths, client: &client, api_url: &api_url }).await;
}

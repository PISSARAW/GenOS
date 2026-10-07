use std::fs;
use std::path::{Component, Path, PathBuf};
use serde_json::json;

pub struct PersistParams<'a> {
    pub index_file: &'a Path,
    pub docs: &'a [serde_json::Value],
    pub idx: &'a str,
    pub document: &'a str,
}
fn is_skipped_dir(path: &Path) -> bool {
    match path.ends_with(".git") {
        true => true,
        false => match path.ends_with("node_modules") {
            true => true,
            false => path.ends_with("target"),
        },
    }
}

fn append_file_content(path: &Path, content: &mut String) {
    match fs::read_to_string(path) {
        Ok(text) => content.push_str(&format!("\n--- File: {} ---\n{}\n", path.display(), text)),
        Err(_) => {},
    }
}

fn read_dir_recursive(dir: &Path, root: &Path, content: &mut String) {
    let canonical_dir = match dir.canonicalize() {
        Ok(v) => v,
        Err(_) => return,
    };
    match canonical_dir.starts_with(root) {
        false => return,
        true => {},
    }
    let entries = match fs::read_dir(dir) {
        Ok(v) => v,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        match path.is_dir() {
            true => match is_skipped_dir(&path) {
                true => {},
                false => read_dir_recursive(&path, root, content),
            },
            false => append_file_content(&path, content),
        }
    }
}

fn default_index_name(index: &Option<String>) -> String {
    match index {
        Some(v) => v.clone(),
        None => "default".to_string(),
    }
}

fn read_document_content(document: &str) -> String {
    match std::path::Path::new(document).exists() {
        false => document.to_string(),
        true => match std::fs::read_to_string(document) {
            Ok(v) => v,
            Err(_) => document.to_string(),
        },
    }
}

fn load_index_docs(index_file: &Path) -> Vec<serde_json::Value> {
    match index_file.exists() {
        false => Vec::new(),
        true => match std::fs::read_to_string(index_file) {
            Ok(current) => match serde_json::from_str(&current) {
                Ok(v) => v,
                Err(_) => Vec::new(),
            },
            Err(_) => Vec::new(),
        },
    }
}

fn persist_index(params: &PersistParams) -> Result<(), String> {
    let text = match serde_json::to_string_pretty(&params.docs) {
        Ok(v) => v,
        Err(e) => return Err(e.to_string()),
    };
    match std::fs::write(params.index_file, text) {
        Ok(_) => {
            println!("{}", serde_json::to_string_pretty(&json!({
                "operation": "platform_ingest",
                "document": params.document,
                "index": params.idx,
                "docs_in_index": params.docs.len(),
                "status": "INGESTED"
            })).unwrap());
            Ok(())
        }
        Err(e) => Err(format!("Failed to persist index '{}': {}", params.idx, e)),
    }
}

pub fn handle_ingest(document: &str, index: &Option<String>) -> Result<(), String> {
    let idx = default_index_name(index);
    let index_dir = crate::commands::root_resolver::resolve_matrix_root().join("platform_indexes");
    let _ = std::fs::create_dir_all(&index_dir);
    let index_file = index_dir.join(format!("{}.json", idx));
    let content = read_document_content(document);
    let mut docs = load_index_docs(&index_file);
    docs.push(json!({
        "timestamp": chrono::Utc::now().to_rfc3339(),
        "content": content,
        "source": document
    }));
    let params = PersistParams { index_file: &index_file, docs: &docs, idx: &idx, document };
    persist_index(&params)
}

pub(crate) fn has_parent_component(path: &Path) -> bool {
    for component in path.components() {
        match component {
            Component::ParentDir => return true,
            _ => {},
        }
    }
    false
}

fn resolve_search_root(query: &str) -> Result<(PathBuf, PathBuf, PathBuf), String> {
    let root = match std::env::current_dir() {
        Ok(v) => v,
        Err(_) => PathBuf::from("."),
    };
    let query_path = Path::new(query);
    match query_path.is_absolute() {
        true => return Err("platform search path must be relative and must not contain '..'".to_string()),
        false => {},
    }
    match has_parent_component(query_path) {
        true => return Err("platform search path must be relative and must not contain '..'".to_string()),
        false => {},
    }
    let root = match root.canonicalize() {
        Ok(v) => v,
        Err(e) => return Err(format!("unable to resolve search root: {e}")),
    };
    let path = root.join(query_path);
    let canonical_path = match path.canonicalize() {
        Ok(v) => v,
        Err(e) => return Err(format!("unable to resolve search path: {e}")),
    };
    match canonical_path.starts_with(&root) {
        false => return Err("platform search path escapes the workspace root".to_string()),
        true => {},
    }
    Ok((root, path, canonical_path))
}

fn build_search_context(path: &Path, canonical_path: &Path, root: &Path) -> String {
    let mut context = String::new();
    match path.exists() {
        false => context = "No files found or directory doesn't exist.".to_string(),
        true => match path.is_dir() {
            false => context = "No files found or directory doesn't exist.".to_string(),
            true => read_dir_recursive(canonical_path, root, &mut context),
        },
    }
    match context.len() > 80_000 {
        true => {
            context.truncate(80_000);
        }
        false => {},
    }
    context
}

fn env_or(key: &str, fallback: &str) -> String {
    match std::env::var(key) {
        Ok(v) => v,
        Err(_) => fallback.to_string(),
    }
}

fn llm_url() -> String {
    match std::env::var("GENOS_LLM_URL") {
        Ok(v) => v,
        Err(_) => {
            let host = match std::env::var("GENOS_API_HOST") {
                Ok(v) => v,
                Err(_) => env_or("GENOS_HOST", "127.0.0.1"),
            };
            let port = match std::env::var("GENOS_API_PORT") {
                Ok(v) => v,
                Err(_) => env_or("GENOS_PORT", "8085"),
            };
            format!("http://{host}:{port}/v1/chat/completions")
        }
    }
}

fn model_name() -> String {
    match std::env::var("GENOS_CORE_MODEL") {
        Ok(v) => v,
        Err(_) => env_or("GENOS_MODEL", "genos-core-v3"),
    }
}

fn query_llm(prompt: &str) -> Result<String, String> {
    let client = reqwest::blocking::Client::new();
    let body = json!({
        "model": model_name(),
        "messages": [{ "role": "user", "content": prompt }]
    });
    let url = llm_url();
    let response = match client.post(&url).json(&body).send() {
        Ok(v) => v,
        Err(e) => return Err(format!("Platform search API unavailable: {}. Is the GenOS server running?", e)),
    };
    match response.status().is_success() {
        false => return Err(format!("Platform search API returned HTTP {}.", response.status())),
        true => {},
    }
    let json_resp = match response.json::<serde_json::Value>() {
        Ok(v) => v,
        Err(e) => return Err(format!("Platform search API returned invalid JSON: {}", e)),
    };
    match json_resp["choices"][0]["message"]["content"].as_str() {
        Some(v) => Ok(v.to_string()),
        None => Err(format!("Platform search API returned no assistant content: {}", json_resp)),
    }
}

pub fn handle_search(query: &str, index: &Option<String>) -> Result<(), String> {
    let idx = default_index_name(index);
    let (root, path, canonical_path) = match resolve_search_root(query) {
        Ok(v) => v,
        Err(e) => return Err(e),
    };
    let context = build_search_context(&path, &canonical_path, &root);
    let prompt = format!("You are an AI code analyzer. Here is the codebase for {}:\n\n{}\n\nProvide a very brief architectural summary of what this code does.", query, context);
    let result_content = match query_llm(&prompt) {
        Ok(v) => v,
        Err(e) => return Err(e),
    };
    let score = 0.95;
    println!("{}", json!({
        "operation": "platform_search", "query": query, "index": idx, "matches": [
            { "content": result_content.trim(), "score": score }
        ]
    }));
    Ok(())
}

pub mod config;
pub mod commands;
pub mod handlers;

pub fn exit_on_command_failure(status: std::io::Result<std::process::ExitStatus>) {
    match status {
        Ok(status) if status.success() => {}
        Ok(status) => std::process::exit(status.code().unwrap_or(1)),
        Err(error) => {
            eprintln!("Échec de l'exécution de la commande: {}", error);
            std::process::exit(1);
        }
    }
}

pub fn command_error(message: impl std::fmt::Display) -> ! {
    eprintln!("Erreur: {}", message);
    std::process::exit(1);
}

pub fn api_base_url() -> String {
    std::env::var("GENOS_API_URL")
        .or_else(|_| std::env::var("GENOS_PORT").map(|port| format!("http://127.0.0.1:{}", port)))
        .unwrap_or_else(|_| "http://127.0.0.1:8085".to_string())
        .trim_end_matches('/')
        .to_string()
}

pub fn api_port() -> u16 {
    std::env::var("GENOS_PORT").ok().and_then(|value| value.parse().ok()).unwrap_or(8085)
}

pub fn apply_api_auth(request: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
    match std::env::var("GENOS_API_KEY").or_else(|_| std::env::var("GENOS_API_TOKEN")) {
        Ok(token) if !token.trim().is_empty() => request.bearer_auth(token),
        _ => request,
    }
}

pub fn cargo_program() -> String {
    std::env::var("CARGO").unwrap_or_else(|_| {
        if cfg!(windows) {
            let candidate = std::path::PathBuf::from(std::env::var_os("USERPROFILE").unwrap_or_default()).join(".cargo").join("bin").join("cargo.exe");
            if candidate.exists() { return candidate.to_string_lossy().into_owned(); }
        }
        "cargo".to_string()
    })
}

pub fn ensure_cargo_on_path() {
    if !cfg!(windows) { return; }
    let cargo = std::path::PathBuf::from(cargo_program());
    let Some(parent) = cargo.parent() else { return; };
    if !parent.exists() { return; }
    let current = std::env::var_os("PATH").unwrap_or_default();
    let mut paths = std::env::split_paths(&current).collect::<Vec<_>>();
    if !paths.iter().any(|path| path == parent) {
        paths.insert(0, parent.to_path_buf());
        if let Ok(updated) = std::env::join_paths(paths) {
            unsafe { std::env::set_var("PATH", updated); }
        }
    }
}

pub fn api_is_healthy() -> bool {
    reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(2))
        .build()
        .ok()
        .and_then(|client| client.get(format!("{}/healthz", api_base_url())).send().ok())
        .map(|response| response.status().is_success())
        .unwrap_or(false)
}

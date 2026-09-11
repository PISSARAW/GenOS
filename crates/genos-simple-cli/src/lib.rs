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
    let raw = match std::env::var("GENOS_PORT") {
        Ok(value) => value,
        Err(_) => return 8085,
    };
    match raw.trim().parse::<u16>() {
        Ok(port) => check_port_value(port, &raw),
        Err(_) => {
            eprintln!("warning: invalid GENOS_PORT '{}', falling back to 8085", raw);
            8085
        }
    }
}

fn check_port_value(port: u16, raw: &str) -> u16 {
    if port == 0 {
        eprintln!("warning: invalid GENOS_PORT '{}' (port 0 is unusable), falling back to 8085", raw);
        return 8085;
    }
    port
}

pub fn apply_api_auth(request: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
    match std::env::var("GENOS_API_KEY").or_else(|_| std::env::var("GENOS_API_TOKEN")) {
        Ok(token) if !token.trim().is_empty() => request.bearer_auth(token),
        _ => request,
    }
}

/// Resolve the cargo binary to invoke.
///
/// The `CARGO` environment variable is only honored when it points to an
/// existing file whose file name is exactly `cargo` (or `cargo.exe` on
/// Windows). Any other value (missing, directory, wrapper script, absolute
/// path to another tool) is ignored and the lookup falls back to the
/// user-profile candidate then plain `cargo` from `PATH`. This prevents a
/// poisoned `CARGO` env var from redirecting builds to an arbitrary binary.
pub fn cargo_program() -> String {
    let from_env = match std::env::var("CARGO") {
        Ok(value) => value,
        Err(_) => String::new(),
    };
    if is_safe_cargo_env(&from_env) {
        return from_env;
    }
    fallback_cargo()
}

fn is_safe_cargo_env(value: &str) -> bool {
    if value.is_empty() {
        return false;
    }
    let name = match std::path::Path::new(value).file_name() {
        Some(valid) => valid.to_string_lossy().into_owned(),
        None => return false,
    };
    if name != "cargo" {
        if name != "cargo.exe" {
            return false;
        }
    }
    std::path::Path::new(value).is_file()
}

fn fallback_cargo() -> String {
    if cfg!(windows) {
        let candidate = std::path::PathBuf::from(std::env::var_os("USERPROFILE").unwrap_or_default()).join(".cargo").join("bin").join("cargo.exe");
        if candidate.exists() {
            return candidate.to_string_lossy().into_owned();
        }
    }
    "cargo".to_string()
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

#[cfg(test)]
mod cargo_tests {
    use super::is_safe_cargo_env;

    #[test]
    fn rejects_empty_env() {
        assert!(!is_safe_cargo_env(""));
    }

    #[test]
    fn rejects_other_binary_name() {
        assert!(!is_safe_cargo_env("/tmp/evil-tool"));
    }

    #[test]
    fn rejects_missing_cargo_path() {
        assert!(!is_safe_cargo_env("/tmp/does-not-exist-cargo-test/cargo"));
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

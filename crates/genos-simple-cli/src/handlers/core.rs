use crate::{api_is_healthy, api_port, cargo_program, command_error, exit_on_command_failure};
use crate::commands::core::CoreCommands;

/// Command line of a running process, when the OS exposes it.
fn process_command_line(pid: u32) -> Option<String> {
    #[cfg(windows)]
    {
        let script = format!(
            "(Get-CimInstance Win32_Process -Filter \"ProcessId = {}\").CommandLine",
            pid
        );
        let output = std::process::Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", &script])
            .output()
            .ok()?;
        Some(String::from_utf8_lossy(&output.stdout).to_string())
    }
    #[cfg(not(windows))]
    {
        std::fs::read_to_string(format!("/proc/{}/cmdline", pid))
            .ok()
            .map(|value| value.replace('\0', " "))
    }
}

/// A stale `.genos_server.pid` can point at a PID that the OS has since reused.
/// Never kill unless the process really looks like the GenOS server.
fn is_genos_server_process(pid: u32) -> bool {
    match process_command_line(pid) {
        Some(line) => {
            let lower = line.to_lowercase();
            lower.contains("genos")
        }
        None => false, // Process doesn't exist or we can't read its cmdline
    }
}

fn try_acquire_start_lock_at(path: &str) -> Result<std::fs::File, String> {
    match std::fs::OpenOptions::new().write(true).create_new(true).open(path) {
        Ok(lock) => Ok(lock),
        Err(_) => Err("another start is already in progress (.genos_server.lock exists)".to_string()),
    }
}

fn try_acquire_start_lock() -> Result<std::fs::File, String> {
    try_acquire_start_lock_at(".genos_server.lock")
}

fn acquire_start_lock() -> std::fs::File {
    match try_acquire_start_lock() {
        Ok(lock) => lock,
        Err(reason) => command_error(reason),
    }
}

fn release_start_lock() {
    let _ = std::fs::remove_file(".genos_server.lock");
}

fn spawn_server(port: u16) -> u32 {
    let log_file = std::fs::File::create("genos_server.log")
        .unwrap_or_else(|error| command_error(format!("impossible de créer genos_server.log: {}", error)));
    let err_file = log_file.try_clone().unwrap_or_else(|error| command_error(format!("impossible de préparer le journal d'erreurs: {}", error)));
    let child = std::process::Command::new(cargo_program())
        .args(["run", "-q", "-p", "genos-cli", "--", "serve", "--port", &port.to_string()])
        .stdout(std::process::Stdio::from(log_file))
        .stderr(std::process::Stdio::from(err_file))
        .spawn().unwrap_or_else(|error| command_error(format!("impossible de démarrer le serveur: {}", error)));
    child.id()
}

fn record_lock_pid(lock: &mut std::fs::File, pid: u32) {
    use std::io::Write;
    match lock.write_all(pid.to_string().as_bytes()) {
        Ok(()) => (),
        Err(error) => {
            release_start_lock();
            command_error(format!("impossible d'écrire dans .genos_server.lock: {}", error));
        }
    }
}

fn record_pid_file(pid: u32) {
    match std::fs::write(".genos_server.pid", pid.to_string()) {
        Ok(()) => (),
        Err(error) => {
            release_start_lock();
            command_error(format!("impossible d'écrire .genos_server.pid: {}", error));
        }
    }
}

fn handle_start() {
    println!("Démarrage du serveur GenOS API...");
    let port = api_port();
    if api_is_healthy() {
        command_error(format!("le serveur GenOS est déjà en ligne sur le port {}", port));
    }
    let mut lock = acquire_start_lock();
    let pid = spawn_server(port);
    record_lock_pid(&mut lock, pid);
    record_pid_file(pid);
    println!("Serveur démarré en arrière-plan avec le PID: {} (Logs dans genos_server.log)", pid);
    release_start_lock();
}

pub fn handle_core(cmd: &CoreCommands, _yes: bool) {
    match cmd {
        CoreCommands::Start => handle_start(),
        CoreCommands::Stop => {
            println!("Arrêt du serveur GenOS...");
            let port = api_port();
            if let Ok(pid_str) = std::fs::read_to_string(".genos_server.pid") {
                let pid = pid_str.trim().parse::<u32>().unwrap_or_else(|error| command_error(format!("PID invalide dans .genos_server.pid: {}", error)));
                if !api_is_healthy() {
                    let _ = std::fs::remove_file(".genos_server.pid");
                    command_error(format!("le serveur est déjà arrêté; PID stale supprimé ({})", pid));
                }
                if !is_genos_server_process(pid) {
                    let _ = std::fs::remove_file(".genos_server.pid");
                    command_error(format!(
                        "refus d'arrêter le PID {}: il ne correspond pas à un serveur GenOS (PID possiblement réutilisé); fichier PID supprimé",
                        pid
                    ));
                }
                if !api_is_healthy() {
                    let _ = std::fs::remove_file(".genos_server.pid");
                    command_error(format!("le serveur est déjà arrêté; PID stale supprimé ({})", pid));
                }
                // Verify the PID actually belongs to a GenOS server process before killing
                if !is_genos_server_process(pid) {
                    let _ = std::fs::remove_file(".genos_server.pid");
                    command_error(format!(
                        "refus d'arrêter le PID {}: il ne correspond pas à un serveur GenOS (PID possiblement réutilisé); fichier PID supprimé",
                        pid
                    ));
                }
                let status = {
                    #[cfg(windows)]
                    {
                        // Try graceful shutdown first (Ctrl+C equivalent)
                        let _ = std::process::Command::new("taskkill")
                            .args(["/PID", &pid.to_string()])
                            .status();
                        // Wait a bit for graceful shutdown
                        std::thread::sleep(std::time::Duration::from_secs(2));
                        if api_is_healthy() {
                            // Force kill if still alive
                            std::process::Command::new("taskkill")
                                .args(["/F", "/T", "/PID", &pid.to_string()])
                                .status()
                        } else {
                            Ok(std::process::ExitStatus::default())
                        }
                    }
                    #[cfg(not(windows))]
                    {
                        // Try graceful SIGTERM first
                        std::process::Command::new("kill")
                            .arg(pid.to_string())
                            .status()
                            .ok();
                        std::thread::sleep(std::time::Duration::from_secs(2));
                        if api_is_healthy() {
                            std::process::Command::new("kill")
                                .arg("-9")
                                .arg(pid.to_string())
                                .status()
                        } else {
                            Ok(std::process::ExitStatus::default())
                        }
                    }
                };
                match status {
                    Ok(status) if status.success() => println!("Serveur arrêté (PID: {}).", pid),
                    Ok(status) => command_error(format!("impossible d'arrêter le serveur (code {})", status.code().unwrap_or(1))),
                    Err(error) => command_error(format!("impossible d'arrêter le serveur: {}", error)),
                }
                if api_is_healthy() { command_error(format!("le port {} est encore ouvert après l'arrêt", port)); }
                let _ = std::fs::remove_file(".genos_server.pid");
            } else {
                println!("Aucun serveur GenOS en cours d'exécution (pid file introuvable).");
                std::process::exit(1);
            }
        }
        CoreCommands::Status => {
            println!("Vérification du statut du serveur GenOS...");
            let port = api_port();
            if let Ok(pid_str) = std::fs::read_to_string(".genos_server.pid") {
                println!("Le serveur semble être en cours d'exécution (PID: {}).", pid_str.trim());
                if api_is_healthy() { println!("Statut: EN LIGNE (Port {} ouvert)", port); }
                else { println!("Statut: HORS LIGNE (Port {} inaccessible)", port); let _ = std::fs::remove_file(".genos_server.pid"); std::process::exit(1); }
            } else { println!("Statut: ARRÊTÉ"); std::process::exit(1); }
        }
        CoreCommands::Run => {
            println!("Lancement d'une tâche (création d'agent de test)...");
            let status = std::process::Command::new(cargo_program())
                .args(["run", "-q", "-p", "genos-cli", "--", "agent", "create", "--name", "task-worker", "--out", ".genos-task.json", "--force"])
                .status();
            match status {
                Ok(s) if s.success() => println!("Tâche lancée et agent créé avec succès."),
                Ok(s) => command_error(format!("erreur lors du lancement de la tâche (code {})", s.code().unwrap_or(1))),
                Err(error) => command_error(format!("impossible de lancer la tâche: {}", error)),
            }
        }
        CoreCommands::List => {
            println!("Liste des fossiles stockés...");
            let mut cmd = std::process::Command::new(cargo_program());
            cmd.args(["run", "-q", "-p", "genos-cli", "--", "fossil", "list"]);
            exit_on_command_failure(cmd.status());
        }
        CoreCommands::Init => {
            println!("Initialisation de GenOS...");
            let mut cmd = std::process::Command::new(cargo_program());
            cmd.args(["run", "-q", "-p", "genos-cli", "--", "init"]);
            exit_on_command_failure(cmd.status());
        }
    }
}

#[cfg(test)]
mod start_lock_tests {
    use super::try_acquire_start_lock_at;

    #[test]
    fn second_acquire_fails() {
        let path = std::env::temp_dir().join("genos_start_lock_test_a.lock");
        let _ = std::fs::remove_file(&path);
        let name = path.to_string_lossy().into_owned();
        let _held = try_acquire_start_lock_at(&name).unwrap();
        assert!(try_acquire_start_lock_at(&name).is_err());
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn acquire_succeeds_when_free() {
        let path = std::env::temp_dir().join("genos_start_lock_test_b.lock");
        let _ = std::fs::remove_file(&path);
        let name = path.to_string_lossy().into_owned();
        assert!(try_acquire_start_lock_at(&name).is_ok());
        let _ = std::fs::remove_file(&path);
    }
}

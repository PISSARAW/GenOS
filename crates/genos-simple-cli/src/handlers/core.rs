use crate::{api_is_healthy, api_port, cargo_program, command_error, exit_on_command_failure};
use crate::commands::core::CoreCommands;

pub fn handle_core(cmd: &CoreCommands, _yes: bool) {
    match cmd {
        CoreCommands::Start => {
            println!("Démarrage du serveur GenOS API...");
            let port = api_port();
            if api_is_healthy() {
                command_error(format!("le serveur GenOS est déjà en ligne sur le port {}", port));
            }
            let log_file = std::fs::File::create("genos_server.log")
                .unwrap_or_else(|error| command_error(format!("impossible de créer genos_server.log: {}", error)));
            let err_file = log_file.try_clone().unwrap_or_else(|error| command_error(format!("impossible de préparer le journal d'erreurs: {}", error)));
            let child = std::process::Command::new(cargo_program())
                .args(["run", "-q", "-p", "genos-cli", "--", "serve", "--port", &port.to_string()])
                .stdout(std::process::Stdio::from(log_file))
                .stderr(std::process::Stdio::from(err_file))
                .spawn().unwrap_or_else(|error| command_error(format!("impossible de démarrer le serveur: {}", error)));
            println!("Serveur démarré en arrière-plan avec le PID: {} (Logs dans genos_server.log)", child.id());
            std::fs::write(".genos_server.pid", child.id().to_string())
                .unwrap_or_else(|error| command_error(format!("impossible d'écrire .genos_server.pid: {}", error)));
        }
        CoreCommands::Stop => {
            println!("Arrêt du serveur GenOS...");
            let port = api_port();
            if let Ok(pid_str) = std::fs::read_to_string(".genos_server.pid") {
                let pid = pid_str.trim().parse::<u32>().unwrap_or_else(|error| command_error(format!("PID invalide dans .genos_server.pid: {}", error)));
                if !api_is_healthy() {
                    let _ = std::fs::remove_file(".genos_server.pid");
                    command_error(format!("le serveur est déjà arrêté; PID stale supprimé ({})", pid));
                }
                let status = {
                    #[cfg(windows)]
                    { std::process::Command::new("taskkill").args(["/F", "/T", "/PID", &pid.to_string()]).status() }
                    #[cfg(not(windows))]
                    { std::process::Command::new("kill").arg(pid.to_string()).status() }
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
                .args(["run", "-q", "-p", "genos-cli", "--", "agent", "create", "--name", "task-worker", "--out", ".genos-task.json"])
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

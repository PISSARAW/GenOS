use crate::args::quantum_vfs::{QuantumVfsCmd, QuantumVfsSubcommands};
use serde_json::json;
use std::fs;
use std::path::Path;

fn get_api_client() -> (reqwest::blocking::Client, String) {
    let api_url = std::env::var("GENOS_API_URL")
        .unwrap_or_else(|_| format!("http://127.0.0.1:{}", std::env::var("GENOS_PORT").unwrap_or_else(|_| "4000".to_string())));
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_millis(5000))
        .build()
        .unwrap_or_default();
    (client, api_url)
}

pub fn handle_quantum_vfs(cmd: QuantumVfsCmd) -> Result<(), String> {
    let (client, api_url) = get_api_client();

    match cmd.subcommand {
        QuantumVfsSubcommands::Stage { workspace, file, content } => {
            let file_content = match content {
                Some(c) => c,
                None => {
                    if Path::new(&file).exists() {
                        fs::read_to_string(&file).map_err(|e| format!("Failed to read file {file}: {e}"))?
                    } else {
                        String::new()
                    }
                }
            };
            let endpoint = format!("{api_url}/api/quantum-vfs/stage");
            let body = json!({
                "workspaceId": workspace,
                "filePath": file,
                "content": file_content
            });
            let res = client.post(&endpoint).json(&body).send()
                .map_err(|e| format!("Failed to connect to GenOS Quantum VFS API ({endpoint}): {e}"))?;
            let data: serde_json::Value = res.json().map_err(|e| format!("Invalid JSON response: {e}"))?;
            println!("{}", serde_json::to_string_pretty(&data).unwrap_or_default());
            Ok(())
        }
        QuantumVfsSubcommands::Superpose { workspace, file, label, content, weight } => {
            let endpoint = format!("{api_url}/api/quantum-vfs/superpose");
            let body = json!({
                "workspaceId": workspace,
                "filePath": file,
                "label": label,
                "content": content,
                "weight": weight
            });
            let res = client.post(&endpoint).json(&body).send()
                .map_err(|e| format!("Failed to connect to GenOS Quantum VFS API ({endpoint}): {e}"))?;
            let data: serde_json::Value = res.json().map_err(|e| format!("Invalid JSON response: {e}"))?;
            println!("{}", serde_json::to_string_pretty(&data).unwrap_or_default());
            Ok(())
        }
        QuantumVfsSubcommands::Entangle { workspace, path_a, path_b, mode } => {
            let endpoint = format!("{api_url}/api/quantum-vfs/entangle");
            let body = json!({
                "workspaceId": workspace,
                "pathA": path_a,
                "pathB": path_b,
                "mode": mode
            });
            let res = client.post(&endpoint).json(&body).send()
                .map_err(|e| format!("Failed to connect to GenOS Quantum VFS API ({endpoint}): {e}"))?;
            let data: serde_json::Value = res.json().map_err(|e| format!("Invalid JSON response: {e}"))?;
            println!("{}", serde_json::to_string_pretty(&data).unwrap_or_default());
            Ok(())
        }
        QuantumVfsSubcommands::TunnelWrite { workspace, file, content, energy } => {
            let endpoint = format!("{api_url}/api/quantum-vfs/tunnel-write");
            let body = json!({
                "workspaceId": workspace,
                "filePath": file,
                "content": content,
                "agentEnergy": energy
            });
            let res = client.post(&endpoint).json(&body).send()
                .map_err(|e| format!("Failed to connect to GenOS Quantum VFS API ({endpoint}): {e}"))?;
            let data: serde_json::Value = res.json().map_err(|e| format!("Invalid JSON response: {e}"))?;
            println!("{}", serde_json::to_string_pretty(&data).unwrap_or_default());
            Ok(())
        }
        QuantumVfsSubcommands::Decohere { workspace, trigger, write_to_disk } => {
            let endpoint = format!("{api_url}/api/quantum-vfs/decoherence");
            let body = json!({
                "workspaceId": workspace,
                "trigger": trigger,
                "options": {
                    "writeToDisk": write_to_disk
                }
            });
            let res = client.post(&endpoint).json(&body).send()
                .map_err(|e| format!("Failed to connect to GenOS Quantum VFS API ({endpoint}): {e}"))?;
            let data: serde_json::Value = res.json().map_err(|e| format!("Invalid JSON response: {e}"))?;
            println!("{}", serde_json::to_string_pretty(&data).unwrap_or_default());
            Ok(())
        }
        QuantumVfsSubcommands::Metrics { workspace } => {
            let endpoint = format!("{api_url}/api/quantum-vfs/metrics?workspaceId={workspace}");
            let res = client.get(&endpoint).send()
                .map_err(|e| format!("Failed to connect to GenOS Quantum VFS API ({endpoint}): {e}"))?;
            let data: serde_json::Value = res.json().map_err(|e| format!("Invalid JSON response: {e}"))?;
            println!("{}", serde_json::to_string_pretty(&data).unwrap_or_default());
            Ok(())
        }
    }
}

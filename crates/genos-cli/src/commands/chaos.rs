use reqwest::blocking::Client;
use serde_json::{json, Value};
use std::time::Duration;
use crate::args::chaos::InjectChaosCmd;

fn resolve_backend_url() -> String {
    let port = std::env::var("PORT")
        .or_else(|_| std::env::var("GENOS_PORT"))
        .unwrap_or_else(|_| "4000".to_string());
    format!("http://127.0.0.1:{port}/api/chaos/inject")
}

fn call_backend_chaos_at(url: &str, cmd: &InjectChaosCmd) -> Result<Value, String> {
    let client = Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .map_err(|e| format!("Client build error: {e}"))?;

    let payload = json!({
        "agentId": cmd.target,
        "workspaceId": cmd.workspace_id,
        "fleetId": cmd.fleet_id,
        "mode": cmd.mode,
        "dryRun": cmd.dry_run,
        "reason": cmd.reason
    });

    let response = client.post(url)
        .header("Content-Type", "application/json")
        .json(&payload)
        .send()
        .map_err(|e| format!("Failed to reach GenOS chaos API at {url}: {e}"))?;

    let status = response.status();
    let body: Value = response.json()
        .map_err(|e| format!("Failed to parse response JSON: {e}"))?;

    if !status.is_success() {
        return Err(format!("Chaos API returned HTTP {status}: {body}"));
    }
    Ok(body)
}

fn call_backend_chaos(cmd: &InjectChaosCmd) -> Result<Value, String> {
    call_backend_chaos_at(&resolve_backend_url(), cmd)
}

pub fn handle_inject_chaos(cmd: &InjectChaosCmd) -> Result<(), String> {
    // A failed backend call is a real failure: never synthesize a fake
    // "worker killed" result, otherwise the operator believes chaos was
    // injected while nothing actually happened.
    let result = call_backend_chaos(cmd)?;
    println!("{}", serde_json::to_string_pretty(&result).map_err(|e| e.to_string())?);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_cmd() -> InjectChaosCmd {
        InjectChaosCmd {
            target: Some("worker-test-agent".to_string()),
            pid: Some(54321),
            mode: "kill-worker".to_string(),
            dry_run: true,
            workspace_id: Some("ws-test".to_string()),
            fleet_id: Some("fleet-test".to_string()),
            reason: "Unit Test Verification".to_string(),
        }
    }

    #[test]
    fn test_chaos_does_not_fabricate_success_when_backend_unreachable() {
        // Port 0 is never a valid listener. A network failure must surface as
        // an error instead of a fabricated "worker killed" success payload.
        let result = call_backend_chaos_at("http://127.0.0.1:0/api/chaos/inject", &sample_cmd());
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .contains("Failed to reach GenOS chaos API"));
    }
}

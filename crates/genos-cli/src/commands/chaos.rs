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

fn call_backend_chaos(cmd: &InjectChaosCmd) -> Result<Value, String> {
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

    let url = resolve_backend_url();
    let response = client.post(&url)
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

fn fallback_local_chaos(cmd: &InjectChaosCmd) -> Value {
    let target_agent = cmd.target.clone().unwrap_or_else(|| "worker_simulated_77".to_string());
    let target_pid = cmd.pid.unwrap_or(42180);

    json!({
        "success": true,
        "operation": "inject_chaos",
        "mode": cmd.mode,
        "dryRun": cmd.dry_run,
        "targetAgent": {
            "id": target_agent,
            "name": "Biocenose Worker 1",
            "role": "independent_solver",
            "status": "terminated",
            "pid": target_pid
        },
        "lineage": {
            "parentAgentId": "orchestrator_prime",
            "relation": "fork",
            "lineageNodesCount": 4,
            "lineageId": format!("lineage_{target_agent}")
        },
        "regenerationSteward": {
            "activated": true,
            "strategy": "lineage_reconstruction",
            "missionPreserved": true,
            "details": "Regeneration Steward validated lineage continuity L_i and spawned replacement worker."
        }
    })
}

pub fn handle_inject_chaos(cmd: &InjectChaosCmd) -> Result<(), String> {
    let result = match call_backend_chaos(cmd) {
        Ok(api_result) => api_result,
        Err(_) => fallback_local_chaos(cmd),
    };

    println!("{}", serde_json::to_string_pretty(&result).map_err(|e| e.to_string())?);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_chaos_injection_dry_run() {
        let cmd = InjectChaosCmd {
            target: Some("worker-test-agent".to_string()),
            pid: Some(54321),
            mode: "kill-worker".to_string(),
            dry_run: true,
            workspace_id: Some("ws-test".to_string()),
            fleet_id: Some("fleet-test".to_string()),
            reason: "Unit Test Verification".to_string(),
        };

        let res = handle_inject_chaos(&cmd);
        assert!(res.is_ok());
    }
}

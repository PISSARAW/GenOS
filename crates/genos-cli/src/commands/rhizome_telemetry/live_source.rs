use serde_json::{Value, json};
use std::path::PathBuf;
use std::process::Command;

#[derive(Clone)]
pub struct LiveSource {
    pub session: String,
    pub database: String,
}

impl LiveSource {
    pub fn read(&self) -> Result<Value, String> {
        let root = repository_root()?;
        let script = root.join("backend/bin/genos-rhizome-snapshot.cjs");
        let result = Command::new("node")
            .arg(script)
            .arg(&self.session)
            .arg(&self.database)
            .current_dir(root)
            .output()
            .map_err(|error| format!("Rhizome backend telemetry unavailable: {error}"))?;
        if !result.status.success() {
            return Err(String::from_utf8_lossy(&result.stderr).into_owned());
        }
        let value: Value = serde_json::from_slice(&result.stdout)
            .map_err(|error| format!("Invalid backend telemetry: {error}"))?;
        validate(&value)?;
        Ok(value)
    }
}

fn repository_root() -> Result<PathBuf, String> {
    let current = std::env::current_dir().map_err(|error| error.to_string())?;
    if current
        .join("backend/bin/genos-rhizome-snapshot.cjs")
        .is_file()
    {
        return Ok(current);
    }
    let compiled = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
    if compiled
        .join("backend/bin/genos-rhizome-snapshot.cjs")
        .is_file()
    {
        return compiled.canonicalize().map_err(|error| error.to_string());
    }
    Err("Run live Rhizome telemetry from the GenOS workspace.".into())
}

fn validate(value: &Value) -> Result<(), String> {
    if value["contract"] != "RhizomeLiveTelemetry/v1"
        || value["source"] != "backend"
        || !value["nodes"].is_array()
        || !value["edges"].is_array()
    {
        return Err("Expected a canonical backend Rhizome snapshot.".into());
    }
    Ok(())
}

pub fn dashboard_snapshot(value: &Value) -> Value {
    let empty = Vec::new();
    let nodes = value["nodes"].as_array().unwrap_or(&empty);
    let identifiers: std::collections::HashMap<_, _> = nodes
        .iter()
        .enumerate()
        .map(|(index, node)| (node["nodeId"].as_str().unwrap_or(""), index + 1))
        .collect();
    let display_nodes: Vec<_> = nodes
        .iter()
        .enumerate()
        .map(|(index, node)| {
            json!({
                "id": index + 1, "role": node["kind"], "label": node["nodeId"],
                "state": node["state"], "x": 0, "y": 0
            })
        })
        .collect();
    let edges: Vec<_> = value["edges"]
        .as_array()
        .unwrap_or(&empty)
        .iter()
        .enumerate()
        .map(|(index, edge)| {
            json!({ "id": index + 1,
                "from": identifiers.get(edge["from"].as_str().unwrap_or("")),
                "to": identifiers.get(edge["to"].as_str().unwrap_or("")), "kind": edge["relation"]
            })
        })
        .collect();
    json!({ "step": value["graphVersion"], "phase": "LIVE BACKEND", "nodes": display_nodes,
        "edges": edges, "evidence_score": 0, "source": "backend",
        "logs": [format!("session={} revision={} variant={}", value["sessionId"], value["revision"], value["variant"])] })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_simulation_as_live_evidence() {
        assert!(validate(&json!({"source": "simulation", "nodes": [], "edges": []})).is_err());
    }

    #[test]
    fn maps_backend_string_identifiers_without_inventing_edges() {
        let snapshot = json!({ "graphVersion": 2, "nodes": [
            {"nodeId":"a", "kind":"AGENT", "state":"ACTIVE"},
            {"nodeId":"b", "kind":"TOOL", "state":"ACTIVE"}],
            "edges": [{"from":"a", "to":"b", "relation":"VERIFIES"}] });
        let display = dashboard_snapshot(&snapshot);
        assert_eq!(display["edges"][0]["from"], 1);
        assert_eq!(display["edges"][0]["to"], 2);
        assert_eq!(display["evidence_score"], 0);
    }
}

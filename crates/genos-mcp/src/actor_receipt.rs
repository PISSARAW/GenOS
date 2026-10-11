use serde_json::Value;
use sha2::{Digest, Sha256};
use std::env;
use std::path::{Path, PathBuf};
use std::process::Command;

fn bridge_path() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../backend/bin/genos-mcp-actor-bridge.cjs")
}

fn invoke(arguments: &[&str]) -> Result<Value, String> {
    let output = Command::new("node")
        .arg(bridge_path())
        .args(arguments)
        .output()
        .map_err(|error| format!("MCP actor bridge unavailable: {error}"))?;
    if !output.status.success() {
        return Err(format!("MCP actor refused: {}", String::from_utf8_lossy(&output.stderr).trim()));
    }
    serde_json::from_slice(&output.stdout)
        .map_err(|_| "MCP actor bridge returned invalid JSON".to_string())
}

pub fn configured() -> bool {
    env::var("GENOS_MCP_ACTOR_TOKEN").is_ok()
}

pub fn begin(tool_name: &str) -> Result<Option<Value>, String> {
    if !configured() {
        return Ok(None);
    }
    let receipt = invoke(&["begin", tool_name])?;
    if receipt.get("actionId").and_then(Value::as_str).is_none()
        || receipt.get("agentId").and_then(Value::as_str).is_none()
    {
        return Err("MCP actor bridge returned incomplete identity".to_string());
    }
    Ok(Some(receipt))
}

pub fn finish(receipt: &Value, success: bool, output: &str) -> Result<(), String> {
    let action_id = receipt.get("actionId").and_then(Value::as_str)
        .ok_or("MCP actor receipt has no action ID")?;
    let output_hash = hex::encode(Sha256::digest(output.as_bytes()));
    invoke(&["finish", "", action_id, if success { "true" } else { "false" }, &output_hash])?;
    Ok(())
}

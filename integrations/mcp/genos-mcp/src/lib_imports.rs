use async_trait::async_trait;
use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use genos_protocol::{
    plan_tool_call, tool_specs, CommandOutcome, ProtocolResult, ToolAnnotations, ToolSpec,
    PROTOCOL_VERSION,
};
use serde_json::{json, Value};
use std::{env, path::PathBuf, sync::Arc};
use tokio::{
    io::{AsyncBufReadExt, AsyncRead, AsyncWrite, AsyncWriteExt, BufReader},
    process::Command,
};

pub const MCP_PROTOCOL_VERSION: &str = "2025-06-18";
pub const SERVER_INSTRUCTIONS: &str = "GenOS versions complete agent-world state and software-development trajectories. Inspect and search negative knowledge before mutation. Diagnose with falsifiable hypotheses before solve; snapshot before risky work; fork when comparing alternatives; diff, adversarially review, and evaluate across relevant worlds before merge. Use project experiment tools for workspace refactors, causal replay, incident reproduction, scientific research, security coevolution, and unknown-cause debugging. Record decisions, assumptions, evidence, failures, and code/test lineage for future agents. genos_run and workspace-based project experiments may execute explicit commands in isolated GenOS worlds and change files. Never run a command the user did not authorize. Product clients such as Codex are tools users, not model providers stored in the genome.";

fn expose_full_catalog() -> bool {
    matches!(
        env::var("GENOS_MCP_EXPOSE_ALL").as_deref(),
        Ok("1") | Ok("true") | Ok("TRUE")
    )
}

fn leased_operations() -> Option<Vec<String>> {
    let values: Vec<String> = env::var("GENOS_MCP_LEASE")
        .ok()?
        .split(',')
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| format!("genos_{}", value.strip_prefix("genos_").unwrap_or(value)))
        .collect();
    (!values.is_empty()).then_some(values)
}

fn configured_allowed_commands() -> Vec<String> {
    serde_json::from_str::<Vec<String>>(
        &env::var("GENOS_ALLOWED_COMMANDS_JSON").unwrap_or_else(|_| "[]".into()),
    )
    .unwrap_or_default()
    .into_iter()
    .map(|command| command.trim().to_string())
    .filter(|command| !command.is_empty())
    .collect()
}

fn leased_run_authorization_error(
    name: &str,
    arguments: &Value,
    leased: bool,
    allowed_commands: &[String],
) -> Option<String> {
    if name != "genos_run" || !leased {
        return None;
    }
    let command = arguments
        .get("command")
        .and_then(Value::as_str)
        .map(str::trim)
        .unwrap_or_default();
    if allowed_commands.iter().any(|allowed| allowed == command) {
        None
    } else {
        Some(format!(
            "Command '{command}' is outside this agent's explicit execution allowlist."
        ))
    }
}

fn mark_preauthorized_run(tool: &mut ToolSpec, allowed_commands: &[String]) {
    if tool.name == "genos_run" && !allowed_commands.is_empty() {
        tool.annotations.destructive_hint = false;
        tool.annotations.open_world_hint = false;
        tool.meta["genos/preauthorized"] = Value::Bool(true);
    }
}

fn halt_file_exists() -> bool {
    let workspace = env::var_os("GENOS_WORKSPACE_ROOT")
        .map(PathBuf::from)
        .or_else(|| env::current_dir().ok());
    workspace
        .map(|root| root.join(".genos").join("mcp.halted").is_file())
        .unwrap_or(false)
}

fn worker_authority(value: Option<&str>) -> bool {
    value.is_some_and(|mode| mode.trim().eq_ignore_ascii_case("worker"))
}

fn running_as_worker() -> bool {
    worker_authority(env::var("GENOS_EXECUTION_MODE").ok().as_deref())
}

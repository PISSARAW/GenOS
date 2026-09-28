use serde_json::{Value, json};
use std::env;

fn configured_tool_set(variable: &str) -> Option<Vec<String>> {
    env::var(variable).ok().map(|value| {
        value
            .split(',')
            .map(str::trim)
            .filter(|name| !name.is_empty())
            .map(|name| {
                if name.starts_with("genos_") {
                    name.to_string()
                } else {
                    format!("genos_{name}")
                }
            })
            .collect()
    })
}

pub fn public_tool_specs() -> Vec<Value> {
    if lease_expired() {
        return Vec::new();
    }
    let lease = configured_tool_set("GENOS_MCP_LEASE");
    let disabled = configured_tool_set("GENOS_MCP_DISABLED_TOOLS").unwrap_or_default();

    let expose_requested = env_flag("GENOS_MCP_EXPOSE_ALL");
    let unsafe_production_exposure = env_flag("GENOS_MCP_ALLOW_UNSAFE_EXPOSE_ALL");
    let node_env = env::var("NODE_ENV").ok();
    let expose_all = expose_all_allowed(expose_requested, node_env.as_deref(), unsafe_production_exposure);

    let all_tools = vec![
        json!({
            "name": "genos_orchestrate",
            "description": "Launch or continue an autonomous GenOS mission. Decomposes tasks, coordinates workers, and produces verified claims.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "mission": { "type": "string", "description": "Goal or user request to achieve." },
                    "strategy": { "type": "string", "description": "Optional strategy hint (catalog counts: see docs/03-reference/inventaire-technique.md)." },
                    "background": { "type": "boolean", "description": "Defaults to true: return a launch receipt and run detached. False waits within the MCP timeout." }
                },
                "required": ["mission"]
            }
        }),
        json!({
            "name": "genos_delegate_worker",
            "description": "Delegate an isolated bounded sub-task to a GenOS worker inside a dedicated capsule.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "mission": { "type": "string", "description": "Sub-task for the delegated worker." },
                    "role": { "type": "string", "description": "Specialized role of the worker." },
                    "background": { "type": "boolean", "description": "Defaults to true. False waits within the MCP timeout." }
                },
                "required": ["mission"]
            }
        }),
        json!({
            "name": "genos_snapshot",
            "description": "Create an immutable content-addressed checkpoint of the workspace.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "agent": { "type": "string", "description": "Path to the agent genome input." },
                    "out": { "type": "string", "description": "Output path for the snapshot JSON." }
                },
                "required": ["agent", "out"]
            }
        }),
        json!({
            "name": "genos_replay",
            "description": "Replay a validated snapshot and return its reproduction receipt.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "snapshot": { "type": "string", "description": "Snapshot path relative to the workspace root." },
                    "snapshot_id": { "type": "string", "description": "Snapshot identifier." }
                },
                "anyOf": [
                    { "required": ["snapshot"] },
                    { "required": ["snapshot_id"] }
                ]
            }
        }),
        json!({
            "name": "genos_execute_primitive",
            "description": "Execute one registered GenOS strategy primitive.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "primitive_name": { "type": "string", "description": "Primitive identifier." },
                    "args": { "type": "object", "description": "Primitive context." }
                },
                "required": ["primitive_name"]
            }
        }),
        json!({
            "name": "genos_capsule_create",
            "description": "Provision an isolated copy-on-write execution capsule from a snapshot.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "snapshot_id": { "type": "string", "description": "Source snapshot ID." },
                    "seed": { "type": "string", "description": "Optional seed identifier." }
                },
                "required": ["snapshot_id"]
            }
        }),
        json!({
            "name": "genos_change_strategy",
            "description": "Switch active strategy portfolio at any runtime decision gate based on empirical evidence.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "strategy": { "type": "string", "description": "Target strategy identifier." },
                    "reason": { "type": "string", "description": "Evidence justifying the transition." }
                },
                "required": ["strategy", "reason"]
            }
        }),
        json!({
            "name": "genos_report_progress",
            "description": "Report concise milestone progress or blocker update to the orchestrator and user.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "phase": { "type": "string", "description": "Current phase name." },
                    "message": { "type": "string", "description": "Outcome and next steps." },
                    "progress_percent": { "type": "number", "minimum": 0, "maximum": 100 }
                },
                "required": ["phase", "message"]
            }
        }),
        json!({
            "name": "genos_change_organization",
            "description": "Modify the communication and routing topology of the agent collective.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "organization": { "type": "string", "description": "Target organization topology." },
                    "reason": { "type": "string", "description": "Justification for topology change." }
                },
                "required": ["organization", "reason"]
            }
        }),
        json!({
            "name": "genos_organization_state",
            "description": "Read the active organization topology, permissions, and visible communication links.",
            "inputSchema": {
                "type": "object",
                "properties": {}
            }
        }),
        json!({
            "name": "genos_worker_publish",
            "description": "Publish evidence, hypotheses, or signals to peer workers through enforced routing.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "kind": { "type": "string", "description": "Type of publication (evidence, challenge, vote, trace)." },
                    "content": { "type": "string", "description": "Message payload." },
                    "signal_type": { "type": "string", "enum": ["ligand", "voltage", "pheromone", "plasmid", "tensor", "text"], "description": "Biomimetic non-textual signal type." },
                    "signal_data": { "type": "object", "description": "Physico-chemical signal data (0 LLM tokens)." }
                },
                "required": ["kind"]
            }
        }),
        json!({
            "name": "genos_worker_inbox",
            "description": "Retrieve messages and evidence visible to this worker under the current topology.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "after_id": { "type": "integer", "description": "Cursor offset." },
                    "limit": { "type": "integer", "description": "Max messages to return." }
                }
            }
        }),
        json!({
            "name": "genos_trinity_launch",
            "description": "Deploy Trinity worlds (thesis, antithesis, synthesis) for deep comparative exploration.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "mission": { "type": "string", "description": "Mission to analyze via dialectic tension." }
                },
                "required": ["mission"]
            }
        }),
        json!({
            "name": "genos_a_team_preview",
            "description": "Compose an A-Team of 2 to 3 multidisciplinary specialists for multi-competency missions.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "project_goal": { "type": "string", "description": "Overarching project goal." },
                    "sub_systems": { "type": "array", "items": { "type": "string" }, "description": "2 or 3 distinct subsystems." }
                },
                "required": ["project_goal", "sub_systems"]
            }
        }),
        json!({
            "name": "genos_merge",
            "description": "Merge changes from an isolated worker branch into the root workspace under invariants.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "branch_id": { "type": "string", "description": "Branch ID to merge." },
                    "conditions": { "type": "string", "description": "Conditions or checks to satisfy." }
                },
                "required": ["branch_id"]
            }
        }),
        json!({
            "name": "genos_audit",
            "description": "Audit a snapshot or lineage trace for security, compliance, and deterministic reproducibility.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "snapshot_id": { "type": "string", "description": "Snapshot ID to audit." },
                    "output": { "type": "string", "description": "Output path for audit report." }
                },
                "required": ["snapshot_id"]
            }
        }),
        json!({
            "name": "genos_biomimicry",
            "description": "Invoke native biomimetic features (allostatic, active sensing, endocrine, instinct, mycelium, apoptosis).",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "feature": { "type": "string", "description": "Biomimetic feature name." },
                    "action": { "type": "string", "description": "Action within feature." },
                    "params": { "type": "object", "description": "Optional parameters." }
                },
                "required": ["feature", "action"]
            }
        }),
        json!({
            "name": "genos_biological_mode",
            "description": "Deploy a Biome, Syncytium, Holobiont, Biocenosis, Rhizome, or Metapopulation collective for a mission.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "mode": {
                        "type": "string",
                        "enum": ["biome", "syncytium", "holobionte", "biocenose", "rhizome", "metapopulation"],
                        "description": "Biological organization mode."
                    },
                    "mission": { "type": "string", "description": "Mission shared by the collective." }
                },
                "required": ["mode", "mission"]
            }
        }),
        json!({
            "name": "genos_v2_init",
            "description": "Initialize GenOS workspace state and directories.",
            "inputSchema": { "type": "object", "properties": {} }
        }),
        json!({
            "name": "genos_v2_fork",
            "description": "Fork workspace state into an isolated branch.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "parent_id": { "type": "string", "description": "Parent snapshot or branch ID." }
                }
            }
        }),
        json!({
            "name": "genos_philosophy",
            "description": "Read-only philosophical concept registry and bounded evaluations.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "operation": { "type": "string", "description": "Philosophy operation." },
                    "arguments": { "type": "object", "description": "Operation arguments." }
                },
                "required": ["operation"]
            }
        }),
    ];

    let filter_disabled = |tool: &Value| {
        let name = tool.get("name").and_then(Value::as_str).unwrap_or("");
        !disabled.iter().any(|entry| entry == name)
    };

    if let Some(ref leased) = lease {
        all_tools
            .into_iter()
            .filter(|t| {
                let name = t.get("name").and_then(Value::as_str).unwrap_or("");
                filter_disabled(t) && leased.iter().any(|l| l == name)
            })
            .collect()
    } else if expose_all {
        all_tools.into_iter().filter(filter_disabled).collect()
    } else { Vec::new() }
}

pub fn is_tool_allowed(name: &str) -> bool {
    if lease_expired() {
        return false;
    }
    public_tool_specs()
        .iter()
        .any(|tool| tool.get("name").and_then(Value::as_str) == Some(name))
}

fn lease_expired() -> bool {
    let raw = match env::var("GENOS_MCP_LEASE_EXPIRES_AT") {
        Ok(value) => value,
        Err(_) => return false,
    };
    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0);
    lease_expired_at(Some(raw.as_str()), now_ms)
}

fn lease_expired_at(raw: Option<&str>, now_ms: i64) -> bool {
    let Some(raw) = raw else {
        return false;
    };
    let raw = raw.trim();
    if raw.is_empty() {
        return false;
    }
    let expires_at: i64 = match raw.parse() {
        Ok(value) => value,
        Err(_) => return true,
    };
    now_ms >= expires_at
}

fn env_flag(name: &str) -> bool {
    env::var(name).is_ok_and(|value| matches!(value.trim().to_ascii_lowercase().as_str(), "1" | "true" | "yes"))
}

fn expose_all_allowed(requested: bool, node_env: Option<&str>, unsafe_production: bool) -> bool {
    requested && (!node_env.is_some_and(|value| value.eq_ignore_ascii_case("production")) || unsafe_production)
}

#[cfg(test)]
mod lease_tests {
    use super::{expose_all_allowed, lease_expired_at};

    #[test]
    fn lease_expires_at_the_boundary_and_invalid_values_fail_closed() {
        assert!(lease_expired_at(Some("1000"), 1000));
        assert!(!lease_expired_at(Some("1001"), 1000));
        assert!(lease_expired_at(Some("invalid"), 1000));
        assert!(!lease_expired_at(None, 1000));
        assert!(!lease_expired_at(Some("  "), 1000));
    }

    #[test]
    fn exposure_is_disabled_by_default_and_guarded_in_production() {
        assert!(!expose_all_allowed(false, None, false));
        assert!(expose_all_allowed(true, Some("development"), false));
        assert!(!expose_all_allowed(true, Some("production"), false));
        assert!(expose_all_allowed(true, Some("production"), true));
    }
}

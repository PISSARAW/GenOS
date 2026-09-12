use serde_json::{json, Value};
use std::env;

fn configured_tool_set(variable: &str) -> Option<Vec<String>> {
    env::var(variable).ok().map(|value| {
        value.split(',')
            .map(str::trim)
            .filter(|name| !name.is_empty())
            .map(|name| {
                if name.starts_with("genos_") { name.to_string() } else { format!("genos_{name}") }
            })
            .collect()
    })
}

pub fn public_tool_specs() -> Vec<Value> {
    let lease = configured_tool_set("GENOS_MCP_LEASE");
    let disabled = configured_tool_set("GENOS_MCP_DISABLED_TOOLS").unwrap_or_default();

    let expose_all = !matches!(
        env::var("GENOS_MCP_EXPOSE_ALL").as_deref(),
        Ok(value) if value == "0" || value.eq_ignore_ascii_case("false")
    );

    let all_tools = vec![
        json!({
            "name": "genos_orchestrate",
            "description": "Launch or continue an autonomous GenOS mission. Decomposes tasks, coordinates workers, and produces verified claims.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "mission": { "type": "string", "description": "Goal or user request to achieve." },
                    "strategy": { "type": "string", "description": "Optional strategy hint from the 78 available." },
                    "background": { "type": "boolean", "description": "True to run detached in the background." }
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
                    "role": { "type": "string", "description": "Specialized role of the worker." }
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
                    "content": { "type": "string", "description": "Message payload." }
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
            "description": "Invoke native biomimetic features (allostatic, active sensing, endocrine, mycelium, apoptosis).",
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
        })
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
    } else {
        all_tools.into_iter().filter(filter_disabled).take(1).collect()
    }
}

pub fn is_tool_allowed(name: &str) -> bool {
    public_tool_specs().iter().any(|tool| {
        tool.get("name").and_then(Value::as_str) == Some(name)
    })
}

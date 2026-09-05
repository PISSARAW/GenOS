use serde_json::{json, Value};
use std::env;

pub fn public_tool_specs() -> Vec<Value> {
    let lease = env::var("GENOS_MCP_LEASE").ok().map(|s| {
        s.split(',')
            .map(|t| t.trim().to_string())
            .filter(|t| !t.is_empty())
            .collect::<Vec<String>>()
    });

    let expose_all = matches!(
        env::var("GENOS_MCP_EXPOSE_ALL").as_deref(),
        Ok("1") | Ok("true") | Ok("TRUE")
    );

    let all_tools = vec![
        json!({
            "name": "genos_orchestrate",
            "description": "Launch or continue an autonomous GenOS mission. Decomposes tasks, coordinates workers, and produces verified claims.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "mission": { "type": "string", "description": "Goal or user request to achieve." },
                    "strategy": { "type": "string", "description": "Optional strategy hint from the 77 available." },
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
                    "message": { "type": "string", "description": "Snapshot commit/audit message." },
                    "branch_id": { "type": "string", "description": "Optional branch identifier." }
                },
                "required": ["message"]
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
            "name": "genos_execute_primitive",
            "description": "Execute one of the 96 GenOS strategic primitives directly with telemetry and verification.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "primitive_name": { "type": "string", "description": "Name of the primitive (e.g. mcts_select, stdp_update, compile_memory)." },
                    "args": { "type": "object", "description": "Input arguments for the primitive." }
                },
                "required": ["primitive_name"]
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
                "required": ["kind", "content"]
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

    if let Some(ref leased) = lease {
        all_tools
            .into_iter()
            .filter(|t| {
                let name = t.get("name").and_then(Value::as_str).unwrap_or("");
                leased.iter().any(|l| l == name || name.strip_prefix("genos_") == Some(l))
            })
            .collect()
    } else if expose_all {
        all_tools
    } else {
        vec![all_tools[0].clone()] // Default to genos_orchestrate only
    }
}

use serde_json::{json, Value};

pub(super) fn base_tool_specs() -> Vec<Value> {
    let mut specs = core_specs();
    specs.extend(worker_specs());
    canonicalize_worker_specs(specs)
}

fn core_specs() -> Vec<Value> {
    vec![
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
                    "background": { "type": "boolean", "description": "Defaults to true: return a launch receipt and run detached. Set false to wait for the worker within the MCP timeout." },
                    "executor": { "type": "string", "enum": ["caller_mcp", "codex", "local", "hermes", "antigravity"], "description": "Cognitive executor inherited by the worker." },
                    "provider": { "type": "string", "description": "Optional declared provider identity for the worker; GenOS does not infer it from the harness." },
                    "modelId": { "type": "string", "description": "Optional declared model identity. Leave unspecified when the host does not disclose it." }
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
    ]
}

fn worker_specs() -> Vec<Value> {
    vec![
        json!({
            "name": "genos_worker_publish",
            "description": "Publish evidence, hypotheses, or signals to peer workers through enforced routing.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "kind": { "type": "string", "enum": ["evidence", "question", "answer", "challenge", "proposal", "vote", "trace", "budget", "critical", "success", "handoff"], "description": "Immutable organization message kind." },
                    "signal_type": { "type": "string", "enum": ["ligand", "voltage", "pheromone", "plasmid", "tensor"], "description": "Required non-text biomimetic signal type." },
                    "signal_data": { "type": ["object", "string"], "description": "Physico-chemical signal payload (0-token) — object or string." },
                    "orchestrator_id": { "type": "string", "description": "Owning orchestrator that may react to the collective signal." },
                    "recipient_agent_id": { "type": "string", "description": "Explicit direct recipient; omit for topology-defined shared delivery." },
                    "in_reply_to": { "type": "integer", "minimum": 1, "description": "Message ID this publication answers." },
                    "relational": {
                        "type": "object",
                        "description": "HTTP MCP: targeted typed references; signal_type=ligand and signal_data={}.",
                        "properties": {
                            "operationId": { "type": "string" },
                            "receiverId": { "type": "string" },
                            "refs": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "id": { "type": "string" },
                                        "hash": { "type": "string" },
                                        "kind": { "type": "string" }
                                    },
                                    "required": ["id", "hash", "kind"]
                                }
                            },
                            "event": { "type": "string" },
                            "blind": { "type": "boolean" },
                            "expectedRevision": { "type": "integer", "minimum": 0 }
                        },
                        "required": ["operationId", "receiverId", "refs"]
                    }
                },
                "required": ["kind", "signal_type", "signal_data"]
            }
        }),
        json!({
            "name": "genos_worker_inbox",
            "description": "Retrieve messages and evidence visible to this worker under the current topology.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "after_id": { "type": "integer", "description": "Cursor offset." },
                    "limit": { "type": "integer", "description": "Max messages to return." },
                    "acknowledge_message_ids": { "type": "array", "items": { "type": "integer", "minimum": 1 }, "description": "Messages explicitly understood by this worker." },
                    "orchestrator_id": { "type": "string", "description": "Owning orchestrator to monitor." },
                    "cursor_only": { "type": "boolean", "description": "Return the latest visible inbox cursor without marking messages read." },
                    "include_bootstrap_requests": { "type": "boolean", "description": "Include only verified, newly delivered initial coordination requests alongside a matching reply." },
                    "handshake_id": { "type": "string", "description": "Filter to a verified reply for this coordination handshake." },
                    "in_reply_to": { "type": "integer", "minimum": 1, "description": "Require a reply to this exact message." },
                    "sender_agent_id": { "type": "string", "description": "Require the reply from this exact worker." },
                    "mission_id": { "type": "string", "description": "Require bootstrap messages for this exact mission cycle." }
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
    ]
}

fn canonicalize_worker_specs(mut specs: Vec<Value>) -> Vec<Value> {
    let catalog: Value = serde_json::from_str(include_str!(
        "../../../../shared/toolDefinitions.json"
    ))
    .expect("canonical tool catalog");
    let canonical_tools = catalog["tools"].as_array().expect("catalog tools");
    for worker_name in ["genos_delegate_worker", "genos_worker_publish", "genos_worker_inbox"] {
        let canonical = canonical_tools
            .iter()
            .find(|tool| tool["name"] == worker_name)
            .unwrap_or_else(|| panic!("missing canonical worker tool: {worker_name}"));
        if let Some(spec) = specs.iter_mut().find(|tool| tool["name"] == worker_name) {
            *spec = canonical.clone();
        }
    }
    specs
}

#[cfg(test)]
mod tests {
    use super::base_tool_specs;

    fn tool_schema<'a>(tools: &'a [serde_json::Value], name: &str) -> &'a serde_json::Value {
        tools
            .iter()
            .find(|tool| tool["name"] == name)
            .unwrap_or_else(|| panic!("missing tool spec: {name}"))
            .get("inputSchema")
            .expect("tool inputSchema")
    }

    #[test]
    fn worker_tools_advertise_routing_replies_and_acknowledgements() {
        let tools = base_tool_specs();
        let publish = tool_schema(&tools, "genos_worker_publish");
        let publish_fields = publish["properties"].as_object().expect("publish properties");
        for field in ["orchestrator_id", "recipient_agent_id", "in_reply_to", "relational"] {
            assert!(publish_fields.contains_key(field), "missing publish field {field}");
        }
        assert_eq!(publish["required"], serde_json::json!(["kind", "signal_type", "signal_data"]));

        let inbox = tool_schema(&tools, "genos_worker_inbox");
        let inbox_fields = inbox["properties"].as_object().expect("inbox properties");
        for field in ["acknowledge_message_ids", "orchestrator_id"] {
            assert!(inbox_fields.contains_key(field), "missing inbox field {field}");
        }
    }

    #[test]
    fn worker_tool_schemas_match_the_canonical_catalog() {
        let tools = base_tool_specs();
        let catalog: serde_json::Value = serde_json::from_str(include_str!(
            "../../../../shared/toolDefinitions.json"
        ))
        .expect("canonical tool catalog");
        for name in ["genos_delegate_worker", "genos_worker_publish", "genos_worker_inbox"] {
            let canonical = catalog["tools"]
                .as_array()
                .expect("catalog tools")
                .iter()
                .find(|tool| tool["name"] == name)
                .unwrap_or_else(|| panic!("missing canonical tool: {name}"));
            assert_eq!(
                tool_schema(&tools, name),
                &canonical["inputSchema"],
                "Rust schema drift for {name}"
            );
        }
    }
}

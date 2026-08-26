fn orchestrator_tool() -> ToolSpec {
    ToolSpec {
        name: "genos_orchestrate".into(),
        title: "GenOS Orchestrator".into(),
        description: "Start or continue an evidence-driven GenOS orchestration. Give a task on the first call. On later calls choose an operation (search_failures, diagnose, snapshot, fork, create, evaluate_trajectories, merge, replay, resilience_hypermutation, security_coevolution) and pass its arguments. The orchestrator decides when to delegate, fork, replay, or merge; workers receive only leased operations.".into(),
        input_schema: json!({"type":"object","additionalProperties":false,"properties":{
            "task":{"type":"string","description":"Mission on the first call."},
            "operation":{"type":"string","description":"Leased GenOS operation for this decision gate."},
            "arguments":{"type":"object","description":"Arguments for the leased operation."},
            "allowed_commands":{"type":"array","items":{"type":"string"},"description":"Exact shell commands authorized for the whole mission. Every other shell command is denied synchronously."},
            "allow_file_edits":{"type":"boolean","description":"Whether agents may edit files inside their isolated capsules. Defaults to false."},
            "silent_updates":{"type":"boolean","description":"Suppress user-facing progress milestones. Defaults to false and should be true only when the user explicitly requests silence."},
            "autonomous_orchestration":{"type":"boolean","description":"Whether the root orchestrator may dispatch its bounded worker fleet. Defaults to true."}
        },"required":[]}),
        output_schema: json!({"type":"object"}),
        annotations: ToolAnnotations { read_only_hint: false, destructive_hint: false, idempotent_hint: false, open_world_hint: false },
        meta: json!({"genos/protocolVersion": PROTOCOL_VERSION, "genos/authority":"orchestrator"}),
    }
}

fn delegate_worker_tool() -> ToolSpec {
    ToolSpec {
        name: "genos_delegate_worker".into(),
        title: "Delegate GenOS Worker".into(),
        description: "Dispatch one mission-named worker into the orchestrator's three-slot garage. GenOS first revives an idle specialist when the new mission matches its role and scope; otherwise it creates a worker. A completed or stopped worker releases its slot, and dispatch is refused while all three slots are occupied.".into(),
        input_schema: json!({"type":"object","additionalProperties":false,"properties":{
            "mission":{"type":"string","minLength":1,"description":"Concrete bounded mission assigned to the worker."},
            "role":{"type":"string","description":"Worker specialty, for example implementation, independent_reviewer, or security_reviewer."},
            "name":{"type":"string","description":"Optional explicit display name. By default GenOS derives it from the mission."},
            "model_tier":{"type":"string","description":"Optional worker model tier."},
            "execution_budget":{"type":"object","description":"Optional bounded worker execution budget."}
        },"required":["mission"]}),
        output_schema: json!({"type":"object"}),
        annotations: ToolAnnotations { read_only_hint: false, destructive_hint: false, idempotent_hint: false, open_world_hint: false },
        meta: json!({"genos/protocolVersion": PROTOCOL_VERSION, "genos/authority":"orchestrator"}),
    }
}

fn a_team_tool() -> ToolSpec {
    ToolSpec {
        name: "genos_a_team_preview".into(),
        title: "Compose GenOS A-Team".into(),
        description: "Analyzes a complex project requirement and dynamically provisions an elite GenOS A-Team (Swarm). This tool formally defines the specialized roles, partitions the tasks according to GenOS constraints (max 400 lines/file, max 3 params/function), and automatically incorporates the mandatory 'telemetry_observer' agent before orchestration.".into(),
        input_schema: json!({"type":"object","additionalProperties":false,"properties":{
            "project_goal":{"type":"string","minLength":10,"description":"Detailed description of the final objective for the A-Team."},
            "sub_systems":{"type":"array","items":{"type":"string"},"description":"List of decoupled subsystems the project is divided into (e.g., 'Backend', 'Frontend', 'Database', 'QA')."},
            "assigned_roles":{"type":"array","items":{"type":"string"},"description":"List of tailored roles that will be created and orchestrated for this swarm. Must include 'telemetry_observer'."},
            "enforce_genos_rules":{"type":"boolean","description":"Whether to enforce strict GenOS rules (max 400 lines, max 3 parameters, visual style) across all agents in the swarm. Should always be true."}
        },"required":["project_goal","sub_systems","assigned_roles","enforce_genos_rules"]}),
        output_schema: json!({"type":"object"}),
        annotations: ToolAnnotations { read_only_hint: false, destructive_hint: false, idempotent_hint: false, open_world_hint: false },
        meta: json!({"genos/protocolVersion": PROTOCOL_VERSION, "genos/authority":"orchestrator"}),
    }
}

fn trinity_tool() -> ToolSpec {
    ToolSpec {
        name: "genos_trinity_launch".into(),
        title: "Launch GenOS Trinity".into(),
        description: "Launch Trinity's three isolated comparison worlds: raw need, interview-derived plan, and AI-corrected implementation. Use it when Trinity is explicitly requested, or after a requested planning interview has produced a concrete mission and comparison remains valuable.".into(),
        input_schema: json!({"type":"object","additionalProperties":false,"properties":{
            "mission":{"type":"string","minLength":1,"description":"Concrete shared mission, including requirements learned during the interview."},
            "rationale":{"type":"string","description":"Why three comparative Trinity worlds are useful for this mission."},
            "execution_budget":{"type":"object","description":"Optional bounded budget inherited by each Trinity world."}
        },"required":["mission"]}),
        output_schema: json!({"type":"object"}),
        annotations: ToolAnnotations { read_only_hint: false, destructive_hint: false, idempotent_hint: false, open_world_hint: false },
        meta: json!({"genos/protocolVersion": PROTOCOL_VERSION, "genos/authority":"orchestrator"}),
    }
}

fn change_strategy_tool() -> ToolSpec {
    ToolSpec {
        name: "genos_change_strategy".into(),
        title: "Change GenOS Strategy".into(),
        description: "Re-evaluate the complete 77-strategy registry against a materially changed mission need. If a different portfolio fits better, create a versioned strategy contract and continue with the remaining mission budget; otherwise retain the current strategy.".into(),
        input_schema: json!({"type":"object","additionalProperties":false,"properties":{
            "need":{"type":"string","minLength":1,"description":"Current concrete need or newly discovered problem, including relevant evidence."},
            "reason":{"type":"string","minLength":1,"description":"Evidence-backed reason why the current strategy may no longer fit."},
            "problem_profile":{"type":"object","additionalProperties":false,"description":"Optional explicit problem-profile overrides.","properties":{
                "type":{"type":"string","enum":["incident","unknown_cause_bug","critical_refactor","security","scientific_research","architecture_decision","implementation"]},
                "complexity":{"type":"number","minimum":0,"maximum":1},
                "uncertainty":{"type":"number","minimum":0,"maximum":1},
                "risk":{"type":"string","enum":["low","medium","high"]},
                "evaluability":{"type":"string"},
                "reversibility":{"type":"string","enum":["low","medium","high"]},
                "requires_reproducibility":{"type":"boolean"},
                "objectives_conflict":{"type":"boolean"},
                "temporal_dependency":{"type":"boolean"}
            }},
            "max_cost_level":{"type":"integer","minimum":1,"maximum":5},
            "allow_experimental":{"type":"boolean","description":"Allow experimental strategies when policy and risk permit."},
            "allow_prototype":{"type":"boolean","description":"Allow prototype strategies when policy and risk permit."},
            "allow_experimental_at_high_risk":{"type":"boolean","description":"Explicitly allow non-implemented strategies for a high-risk need."}
        },"required":["need","reason"]}),
        output_schema: json!({"type":"object"}),
        annotations: ToolAnnotations { read_only_hint: false, destructive_hint: false, idempotent_hint: false, open_world_hint: false },
        meta: json!({"genos/protocolVersion": PROTOCOL_VERSION, "genos/authority":"orchestrator"}),
    }
}

fn report_progress_tool() -> ToolSpec {
    ToolSpec {
        name: "genos_report_progress".into(),
        title: "Report GenOS Progress".into(),
        description: "Publish a concise user-facing mission milestone over the Studio telemetry stream. Report meaningful changes, completed units, blockers, and next steps; do not expose private chain-of-thought or emit one update per tool call. Explicit silent mode suppresses the event.".into(),
        input_schema: json!({"type":"object","additionalProperties":false,"properties":{
            "phase":{"type":"string","enum":["started","working","completed","blocked","verifying"]},
            "message":{"type":"string","minLength":1,"maxLength":1200},
            "progress_percent":{"type":"number","minimum":0,"maximum":100},
            "completed":{"type":"array","maxItems":10,"items":{"type":"string"}},
            "next":{"type":"array","maxItems":10,"items":{"type":"string"}},
            "blockers":{"type":"array","maxItems":10,"items":{"type":"string"}}
        },"required":["phase","message"]}),
        output_schema: json!({"type":"object"}),
        annotations: ToolAnnotations { read_only_hint: false, destructive_hint: false, idempotent_hint: false, open_world_hint: false },
        meta: json!({"genos/protocolVersion": PROTOCOL_VERSION, "genos/authority":"orchestrator", "genos/audience":"user"}),
    }
}

fn change_organization_tool() -> ToolSpec {
    ToolSpec {
        name: "genos_change_organization".into(),
        title: "Change GenOS Organization".into(),
        description: "Change the owning orchestrator's worker topology at any runtime decision gate. The selected organization controls whether worker communication is direct, indirect, anonymous, implicit, buffered, competitive, or routed through the orchestrator.".into(),
        input_schema: json!({"type":"object","additionalProperties":false,"properties":{
            "organization":{"type":"string","minLength":1,"description":"GenOS collective organization or runtime topology to activate."},
            "reason":{"type":"string","minLength":1,"description":"Evidence-backed need that justifies the transition."}
        },"required":["organization","reason"]}),
        output_schema: json!({"type":"object"}),
        annotations: ToolAnnotations { read_only_hint: false, destructive_hint: false, idempotent_hint: false, open_world_hint: false },
        meta: json!({"genos/protocolVersion": PROTOCOL_VERSION, "genos/authority":"orchestrator"}),
    }
}

fn organization_state_tool() -> ToolSpec {
    ToolSpec {
        name: "genos_organization_state".into(),
        title: "Read GenOS Organization".into(),
        description: "Read the current versioned organization, topology, visibility, and communication routing selected by the owning orchestrator.".into(),
        input_schema: json!({"type":"object","additionalProperties":false,"properties":{}}),
        output_schema: json!({"type":"object"}),
        annotations: ToolAnnotations { read_only_hint: true, destructive_hint: false, idempotent_hint: true, open_world_hint: false },
        meta: json!({"genos/protocolVersion": PROTOCOL_VERSION, "genos/authority":"orchestrator_or_worker"}),
    }
}

fn worker_publish_tool() -> ToolSpec {
    ToolSpec {
        name: "genos_worker_publish".into(),
        title: "Publish Worker Evidence".into(),
        description: "Publish evidence, questions, challenges, traces, votes, handoffs, or critical signals through the current organization's enforced routing. Sender identity is supplied by the runtime lease.".into(),
        input_schema: json!({"type":"object","additionalProperties":false,"properties":{
            "kind":{"type":"string","enum":["evidence","question","answer","challenge","proposal","vote","trace","budget","critical","success","handoff"]},
            "content":{"type":"string","minLength":1,"maxLength":12000},
            "recipient_agent_id":{"type":"string","description":"Optional intended peer. The organization may reroute or suppress direct delivery."},
            "payload":{"type":"object","description":"Optional structured evidence metadata."}
        },"required":["kind","content"]}),
        output_schema: json!({"type":"object"}),
        annotations: ToolAnnotations { read_only_hint: false, destructive_hint: false, idempotent_hint: false, open_world_hint: false },
        meta: json!({"genos/protocolVersion": PROTOCOL_VERSION, "genos/authority":"orchestrator_or_worker"}),
    }
}

fn worker_inbox_tool() -> ToolSpec {
    ToolSpec {
        name: "genos_worker_inbox".into(),
        title: "Read Worker Organization Inbox".into(),
        description: "Read peer evidence visible under the current organization. Use after_id as a cursor; anonymous and buffered modes are enforced by the control plane.".into(),
        input_schema: json!({"type":"object","additionalProperties":false,"properties":{
            "after_id":{"type":"integer","minimum":0},
            "limit":{"type":"integer","minimum":1,"maximum":50}
        }}),
        output_schema: json!({"type":"object"}),
        annotations: ToolAnnotations { read_only_hint: true, destructive_hint: false, idempotent_hint: true, open_world_hint: false },
        meta: json!({"genos/protocolVersion": PROTOCOL_VERSION, "genos/authority":"orchestrator_or_worker"}),
    }
}

fn public_tool_specs() -> Vec<ToolSpec> {
    if let Some(lease) = leased_operations() {
        let mut tools: Vec<ToolSpec> = tool_specs()
            .into_iter()
            .filter(|tool| lease.contains(&tool.name))
            .collect();
        let allowed_commands = configured_allowed_commands();
        for tool in &mut tools {
            mark_preauthorized_run(tool, &allowed_commands);
        }
        if lease.contains(&"genos_delegate_worker".to_string()) {
            tools.push(delegate_worker_tool());
        }
        if lease.contains(&"genos_a_team_preview".to_string()) {
            tools.push(a_team_tool());
        }
        if lease.contains(&"genos_trinity_launch".to_string()) {
            tools.push(trinity_tool());
        }
        if lease.contains(&"genos_change_strategy".to_string()) {
            tools.push(change_strategy_tool());
        }
        if lease.contains(&"genos_report_progress".to_string()) {
            tools.push(report_progress_tool());
        }
        if lease.contains(&"genos_change_organization".to_string()) {
            tools.push(change_organization_tool());
        }
        if lease.contains(&"genos_organization_state".to_string()) {
            tools.push(organization_state_tool());
        }
        if lease.contains(&"genos_worker_publish".to_string()) {
            tools.push(worker_publish_tool());
        }
        if lease.contains(&"genos_worker_inbox".to_string()) {
            tools.push(worker_inbox_tool());
        }
        return tools;
    }
    if expose_full_catalog() {
        tool_specs()
    } else {
        vec![orchestrator_tool()]
    }
}
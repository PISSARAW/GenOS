use genos_protocol::{plan_tool_call, tool_specs, ProtocolResult, PROTOCOL_VERSION};
use serde_json::json;
use std::collections::HashSet;

#[test]
fn catalog_contains_canonical_and_software_development_tools() {
    let specs = tool_specs();
    assert_eq!(specs.len(), 75);
    let names = specs
        .iter()
        .map(|tool| tool.name.as_str())
        .collect::<HashSet<_>>();
    assert_eq!(names.len(), specs.len());
    assert!(specs.iter().all(|tool| {
        tool.meta["genos/protocolVersion"] == PROTOCOL_VERSION
            && tool.input_schema["type"] == "object"
            && tool.output_schema["type"] == "object"
    }));
    for expected in [
        "create", "snapshot", "restore", "fork", "run", "inspect", "diff", "lineage", "replay",
        "merge",
    ] {
        assert!(names.contains(format!("genos_{expected}").as_str()));
    }
    for expected in [
        "workspace_experiment",
        "causal_replay_experiment",
        "incident_experiment",
        "scientific_experiment",
        "security_coevolution",
        "bug_investigation",
    ] {
        assert!(names.contains(format!("genos_{expected}").as_str()));
    }
    for expected in [
        "diagnose",
        "hypothesis_evidence",
        "solve",
        "evaluate_trajectories",
        "record_decision",
        "blame",
        "invalidate_assumption",
        "record_experience",
        "search_failures",
        "cherry_pick_experience",
        "adversarial_review",
        "future_ci",
        "repository_genome",
        "bisect_agent",
        "analyze_trajectory",
        "compile_memory",
    ] {
        assert!(names.contains(format!("genos_{expected}").as_str()));
    }
    for expected in ["configure_gateway", "inject_crispr_spacer"] {
        assert!(names.contains(format!("genos_{expected}").as_str()));
        assert!(!names.contains(format!("genos_genos_{expected}").as_str()));
    }
}

#[test]
fn security_tools_map_to_cli_arguments() {
    let gateway = plan_tool_call(
        "genos_configure_gateway",
        &json!({"threshold": 3, "cooldown_ms": 1500}),
    )
    .unwrap();
    assert_eq!(
        gateway.args,
        [
            "security",
            "configure-gateway",
            "--threshold",
            "3",
            "--cooldown-ms",
            "1500"
        ]
    );

    let spacer = plan_tool_call(
        "genos_inject_crispr_spacer",
        &json!({"spacer_signature": "sha256:abc"}),
    )
    .unwrap();
    assert_eq!(
        spacer.args,
        [
            "security",
            "inject-crispr-spacer",
            "--spacer-signature",
            "sha256:abc"
        ]
    );
}

#[test]
fn adversarial_review_maps_boolean_value_for_clap() {
    let planned = plan_tool_call(
        "genos_adversarial_review",
        &json!({
            "target": "solution.js",
            "critics": ["correctness"],
            "rounds": 2,
            "blind": false,
            "root": ".genos"
        }),
    )
    .unwrap();
    assert_eq!(
        planned.args,
        [
            "dev",
            "adversarial-review",
            "solution.js",
            "--critic",
            "correctness",
            "--rounds",
            "2",
            "--blind",
            "false",
            "--root",
            ".genos"
        ]
    );
}

#[test]
fn fork_maps_to_distinct_process_arguments_without_shell_interpolation() {
    let planned = plan_tool_call(
        "genos_fork",
        &json!({
            "capsule_id": "cap 1",
            "branches": [{"label": "A", "hypothesis": "try; echo unsafe"}],
            "root": ".state"
        }),
    )
    .unwrap();
    assert_eq!(
        planned.args,
        [
            "agent",
            "fork",
            "cap 1",
            "--branch",
            "A=try; echo unsafe",
            "--root",
            ".state"
        ]
    );
}

#[test]
fn mutually_exclusive_replay_anchors_are_rejected() {
    let error = plan_tool_call(
        "genos_replay",
        &json!({"snapshot": "snap", "branch_id": "branch"}),
    )
    .unwrap_err();
    assert!(error.to_string().contains("mutually exclusive"));
}

#[test]
fn replay_maps_directly_to_the_agent_replay_command() {
    let planned = plan_tool_call(
        "genos_replay",
        &json!({"snapshot": "snap-1", "root": ".state"}),
    )
    .unwrap();
    assert_eq!(
        planned.args,
        [
            "agent",
            "replay",
            "--root",
            ".state",
            "--snapshot",
            "snap-1",
            "--format",
            "json"
        ]
    );
}

#[test]
fn protocol_result_parses_structured_cli_output() {
    let result = ProtocolResult::new(
        "diff",
        genos_protocol::CommandOutcome {
            exit_code: 0,
            stdout: "{\"empty\":true}\n".into(),
            stderr: String::new(),
        },
    );
    assert_eq!(result.output, Some(json!({"empty": true})));
    assert_eq!(result.protocol_version, PROTOCOL_VERSION);
}

#[test]
fn diagnose_maps_arrays_to_repeated_safe_arguments() {
    let planned = plan_tool_call(
        "genos_diagnose",
        &json!({"problem":"freeze", "hypotheses":["deadlock", "pool; echo no"]}),
    )
    .unwrap();
    assert_eq!(
        planned.args,
        [
            "dev",
            "diagnose",
            "freeze",
            "--hypothesis",
            "deadlock",
            "--hypothesis",
            "pool; echo no",
            "--root",
            ".genos"
        ]
    );
}

#[test]
fn future_ci_rejects_an_empty_world_set() {
    let error =
        plan_tool_call("genos_future_ci", &json!({"target":"patch-A", "worlds":[]})).unwrap_err();
    assert!(error.to_string().contains("non-empty"));
}

#[test]
fn workspace_experiment_maps_direct_inputs_without_shell_interpolation() {
    let planned = plan_tool_call(
        "genos_workspace_experiment",
        &json!({"repo":"repo; echo no", "plan":"plans/refactor.yaml", "root":"runs"}),
    )
    .unwrap();
    assert_eq!(
        planned.args,
        [
            "experiment",
            "workspace",
            "--repo",
            "repo; echo no",
            "--plan",
            "plans/refactor.yaml",
            "--root",
            "runs",
            "--format",
            "json"
        ]
    );
}

#[test]
fn incident_experiment_requires_manifest_or_complete_direct_inputs() {
    let error = plan_tool_call(
        "genos_incident_experiment",
        &json!({"snapshot":"production@incident-42", "evidence":"evidence.yaml"}),
    )
    .unwrap_err();
    assert!(error.to_string().contains("all direct experiment inputs"));

    let planned = plan_tool_call(
        "genos_incident_experiment",
        &json!({
            "snapshot":"production@incident-42",
            "evidence":"evidence.yaml",
            "search_plan":"search.yaml",
            "summary":true
        }),
    )
    .unwrap();
    assert_eq!(planned.args[0..2], ["experiment", "incident"]);
    assert!(planned.args.contains(&"--summary".to_string()));
}

#[test]
fn project_experiment_rejects_mixed_manifest_and_direct_inputs() {
    let error = plan_tool_call(
        "genos_bug_investigation",
        &json!({"manifest":"all.yaml", "repo":"service", "plan":"bugs.yaml"}),
    )
    .unwrap_err();
    assert!(error.to_string().contains("cannot be combined"));
}

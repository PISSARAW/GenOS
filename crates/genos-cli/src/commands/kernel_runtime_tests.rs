use super::{
    DIAGNOSTIC_HYPOTHESES, LiveMissionBinding, RuntimePaths, orchestrator_payload,
    MISSION_TOKEN_BUDGET, MAX_TIMEOUT_MS, VERIFICATION_TIMEOUT_MS,
    normalize_windows_verbatim_prefix, parse_completion_contract, parse_native_objectives,
    parse_success_criteria,
    resolve_workspace_root, validate_executor, validate_timeout_ms,
};
use genos_orchestrator::kernel_morphogenesis::MorphogenesisPlan;
use std::path::PathBuf;

#[test]
fn payload_provides_read_only_workspace_and_falsifiable_preflight() {
    let root = std::env::current_dir().expect("workspace should exist");
    let paths = RuntimePaths {
        root: root.clone(),
        database: root.join("backend/genos.db"),
        workspace_root: root.clone(),
    };
    let binding = LiveMissionBinding {
        mission_id: "mission-test",
        objective: "inspect the repository",
        plan_hash: "plan-hash".into(),
        plan_json: "{}".into(),
        objective_hash: "objective-hash".into(),
        completion_contract: None,
        success_criteria: None,
        native_objectives: None,
        read_only_workspace_evidence: false,
        timeout_ms: MAX_TIMEOUT_MS,
        executor: String::from("codex"),
    };
    let payload = orchestrator_payload(&paths, &binding, &MorphogenesisPlan::default());

    assert_eq!(payload["workspaceRoot"], root.to_string_lossy().as_ref());
    assert_eq!(payload["allowFileEdits"], false);
    assert_eq!(payload["readOnlyWorkspaceEvidence"], false);
    assert_eq!(payload["timeoutMs"], MAX_TIMEOUT_MS);
    assert_eq!(payload["executor"], "codex");
    assert_eq!(payload["executionBudget"]["tokens"], MISSION_TOKEN_BUDGET);
    assert_eq!(payload["executionBudget"]["latencyMs"], MAX_TIMEOUT_MS);
    assert_eq!(payload["executionBudget"]["verification"]["latencyMs"], VERIFICATION_TIMEOUT_MS);
    assert!(payload.get("completionContract").is_none());
    assert!(payload.get("successCriteria").is_none());
    assert!(payload.get("native_objectives").is_none());
    for (index, hypothesis) in DIAGNOSTIC_HYPOTHESES.iter().enumerate() {
        assert_eq!(payload["diagnosticHypotheses"][index]["statement"], *hypothesis);
    }
}

#[test]
fn workspace_root_resolves_relative_to_repository_and_rejects_missing_paths() {
    let root = tempfile::tempdir().expect("repository fixture should be created");
    let workspace = root.path().join("workspace");
    std::fs::create_dir(&workspace).expect("workspace fixture should be created");

    let resolved = resolve_workspace_root(root.path(), Some(PathBuf::from("workspace")))
        .expect("relative workspace should resolve under repository root");
    assert_eq!(resolved, workspace);
    assert!(resolve_workspace_root(root.path(), Some(PathBuf::from("missing"))).is_err());
}

#[test]
fn windows_verbatim_workspace_paths_match_registered_drive_and_unc_paths() {
    assert_eq!(
        normalize_windows_verbatim_prefix(r"\\?\C:\Users\worker\workspace"),
        r"C:\Users\worker\workspace"
    );
    assert_eq!(
        normalize_windows_verbatim_prefix(r"\\?\UNC\server\share\workspace"),
        r"\\server\share\workspace"
    );
    assert_eq!(
        normalize_windows_verbatim_prefix(r"C:\Users\worker\workspace"),
        r"C:\Users\worker\workspace"
    );
}

#[test]
fn completion_contract_is_optional_but_explicit_contracts_are_validated_and_forwarded() {
    assert!(parse_completion_contract(None).unwrap().is_none());
    assert!(parse_completion_contract(Some(r#"{"invariants":[]}"#)).is_err());
    assert!(parse_completion_contract(Some("not-json")).is_err());
    let raw = r#"{"invariants":[{"kind":"functional","verifier":{"type":"mission.outcome_success"}}],"requiredEvidence":["worker_receipt"]}"#;
    let contract = parse_completion_contract(Some(raw)).unwrap().unwrap();
    let binding = LiveMissionBinding {
        mission_id: "mission-test",
        objective: "inspect the repository",
        plan_hash: "plan-hash".into(),
        plan_json: "{}".into(),
        objective_hash: "objective-hash".into(),
        completion_contract: Some(contract.clone()),
        success_criteria: Some(serde_json::json!(["verified claim"])),
        native_objectives: Some(serde_json::json!([{
            "goal": "inspect repository",
            "successCriteria": ["cite evidence"],
            "methodContract": {"version": 1, "methodId": "scan_literal", "parameters": {}}
        }])),
        read_only_workspace_evidence: true,
        timeout_ms: 120_000,
        executor: String::from("codex"),
    };
    let root = std::env::current_dir().expect("workspace should exist");
    let paths = RuntimePaths {
        root: root.clone(),
        database: root.clone().join("backend/genos.db"),
        workspace_root: root,
    };
    let payload = orchestrator_payload(&paths, &binding, &MorphogenesisPlan::default());
    assert_eq!(payload["completionContract"], contract);
    assert_eq!(payload["successCriteria"], serde_json::json!(["verified claim"]));
    assert_eq!(payload["native_objectives"][0]["methodContract"]["methodId"], "scan_literal");
    assert_eq!(payload["readOnlyWorkspaceEvidence"], true);
    assert_eq!(payload["timeoutMs"], 120_000);
    assert_eq!(payload["executor"], "codex");
    assert_eq!(payload["executionBudget"]["latencyMs"], 120_000);
}

#[test]
fn timeout_must_be_positive_and_within_the_cli_deadline_limit() {
    assert!(validate_timeout_ms(1_000).is_ok());
    assert!(validate_timeout_ms(120_000).is_ok());
    assert!(validate_timeout_ms(0).is_err());
    assert!(validate_timeout_ms(999).is_err());
    assert!(validate_timeout_ms(180_001).is_err());
}

#[test]
fn executor_validation_requires_the_receipt_producing_codex_runtime() {
    assert!(validate_executor("codex").is_ok());
    assert!(validate_executor("local").is_err());
}

#[test]
fn success_criteria_require_non_empty_string_arrays_and_are_forwarded() {
    assert!(parse_success_criteria(None).unwrap().is_none());
    assert!(parse_success_criteria(Some("[]")).is_err());
    assert!(parse_success_criteria(Some(r#"[" "]"#)).is_err());
    assert!(parse_success_criteria(Some(r#"["ok",1]"#)).is_err());
    assert_eq!(
        parse_success_criteria(Some(r#"["completed build","passing focused tests"]"#)).unwrap(),
        Some(serde_json::json!(["completed build", "passing focused tests"]))
    );
}

#[test]
fn native_objectives_require_explicit_valid_inputs_and_are_forwarded() {
    assert!(parse_native_objectives(None).unwrap().is_none());
    assert!(parse_native_objectives(Some("not-json")).is_err());
    assert!(parse_native_objectives(Some("[]")).is_err());
    assert!(parse_native_objectives(Some("{}" )).is_err());
    assert!(parse_native_objectives(Some(r#"[{"goal":"x","successCriteria":[],"methodContract":{"version":1,"methodId":"scan_literal"}}]"#)).is_err());
    assert!(parse_native_objectives(Some(r#"[{"goal":"x","successCriteria":["ok"],"methodContract":{"version":2,"methodId":"scan_literal"}}]"#)).is_err());
    let objectives = parse_native_objectives(Some(r#"[{"goal":"Inspect source","successCriteria":["Cite matching text"],"methodContract":{"version":1,"methodId":"scan_literal","parameters":{"terms":["timeout"]}}}]"#))
        .expect("valid caller input should parse")
        .expect("explicit input should be retained");
    assert_eq!(objectives[0]["goal"], "Inspect source");
    assert_eq!(objectives[0]["methodContract"]["methodId"], "scan_literal");
    assert_eq!(objectives[0]["methodContract"]["parameters"]["terms"][0], "timeout");
}

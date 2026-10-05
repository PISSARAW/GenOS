use super::*;
use crate::omega::{OmegaEnvelope, OmegaOperation, SCHEMA};
use serde_json::json;

fn envelope() -> OmegaEnvelope {
    let op = |id: &str, kind: &str, reference: &str, depends: Vec<String>| {
        OmegaOperation(
            id.into(),
            kind.into(),
            Some(reference.into()),
            depends,
            "open".into(),
        )
    };
    OmegaEnvelope {
        schema: SCHEMA.into(),
        version: 1,
        id: "runtime".into(),
        operations: vec![
            op("read", "READ", "repo", vec![]),
            op("select", "SELECT", "slice", vec!["read".into()]),
            op("call", "CALL", "tool", vec!["select".into()]),
            op("infer", "INFER", "model", vec!["call".into()]),
            op("check", "CHECK", "verify", vec!["infer".into()]),
            op("emit", "EMIT", "publish", vec!["check".into()]),
        ],
        policy: vec![
            ("read".into(), vec!["repo".into()]),
            ("select".into(), vec!["slice".into()]),
            ("call".into(), vec!["tool".into()]),
            ("infer".into(), vec!["model".into()]),
            ("check".into(), vec!["verify".into()]),
            ("emit".into(), vec!["publish".into()]),
        ],
        payload: None,
    }
}

#[test]
fn executes_all_semantic_operations() {
    let mut runtime = OmegaRuntime::default();
    runtime.register_selector("slice", |ctx| Ok(json!({ "selected": ctx.input })));
    runtime.register_tool("tool", |ctx| Ok(json!({ "called": ctx.input })));
    runtime.register_inferer("model", |ctx| Ok(json!({ "candidate": ctx.input })));
    runtime.register_verifier("verify", |_| {
        Ok(json!({ "status": "verified", "valid": true }))
    });
    runtime.register_emitter("publish", |ctx| Ok(json!({ "emitted": ctx.input })));
    let mut input = ExecutionInput {
        objects: [("repo".into(), json!({ "ok": true }))].into(),
        policy: envelope().policy.iter().cloned().collect(),
        ..Default::default()
    };
    input.allow_emit = true;
    let result = runtime.execute(&envelope(), input);
    assert_eq!(result.status, "emitted");
    assert_eq!(
        result
            .results
            .iter()
            .filter(|item| item.status == "ready")
            .count(),
        4
    );
    assert_eq!(
        result
            .results
            .iter()
            .filter(|item| item.status == "verified")
            .count(),
        1
    );
    assert_eq!(
        result
            .results
            .iter()
            .filter(|item| item.status == "emitted")
            .count(),
        1
    );
    assert!(result.values.contains_key("emit"));
}

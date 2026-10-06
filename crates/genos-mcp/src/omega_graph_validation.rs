use super::OmegaEnvelope;
use std::collections::HashSet;

pub fn validate(envelope: &OmegaEnvelope) -> Result<(), String> {
    let ids: HashSet<_> = envelope.operations.iter().map(|op| &op.0).collect();
    for op in &envelope.operations {
        if op.3.iter().any(|dependency| !ids.contains(dependency)) { return Err("dependency_missing".into()); }
        if op.3.iter().collect::<HashSet<_>>().len() != op.3.len() { return Err("obligation_dependencies_invalid".into()); }
        if op.4 == "blocked" { return Err("obligation_blocked".into()); }
    }
    validate_order(envelope)
}

fn validate_order(envelope: &OmegaEnvelope) -> Result<(), String> {
    let mut done = HashSet::new();
    let mut pending: Vec<_> = envelope.operations.iter().collect();
    while !pending.is_empty() {
        let Some(index) = pending.iter().position(|op| op.3.iter().all(|id| done.contains(id))) else {
            return Err("dependency_cycle".into());
        };
        done.insert(pending.remove(index).0.clone());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::super::read_compatible_json;
    use serde_json::json;
    #[test]
    fn reject_bad_graph_before_any_execution() {
        for (dependencies, reason) in [(json!(["missing"]), "dependency_missing"), (json!(["read"]), "dependency_cycle")] {
            let source = json!({"schema":"genos.gcir.omega/v1","version":1,"id":"graph",
                "operations":[{"id":"read","kind":"READ","reference":"source","dependsOn":dependencies,"state":"open"}]});
            assert_eq!(read_compatible_json(&serde_json::to_vec(&source).unwrap()).unwrap_err(), reason);
        }
    }
    #[test]
    fn version_numbers_do_not_wrap_or_default() {
        for version in [json!(257), json!(-1), json!(1.5), json!("1")] {
            let source = json!({"version":version});
            assert!(read_compatible_json(&serde_json::to_vec(&source).unwrap()).is_err());
        }
    }
}

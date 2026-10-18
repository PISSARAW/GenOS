use serde_json::Value;
use sha2::{Digest, Sha256};

fn canonical_json(value: &Value) -> Value {
    match value {
        Value::Array(items) => Value::Array(items.iter().map(canonical_json).collect()),
        Value::Object(map) => {
            let mut entries = map.iter().collect::<Vec<_>>();
            entries.sort_by(|left, right| left.0.cmp(right.0));
            Value::Object(
                entries
                    .into_iter()
                    .map(|(key, value)| (key.clone(), canonical_json(value)))
                    .collect(),
            )
        }
        _ => value.clone(),
    }
}

fn validate_action(action: &Value) -> Result<(), String> {
    let object = action
        .as_object()
        .ok_or("transition action must be an object")?;
    let kind = object
        .get("type")
        .and_then(Value::as_str)
        .ok_or("transition action type is required")?;
    if !["spawn", "retire", "rebind", "genome"].contains(&kind) {
        return Err(format!(
            "unsupported authenticated transition action: {kind}"
        ));
    }
    if object.get("continueOnFailure").and_then(Value::as_bool) == Some(true) {
        return Err("unsafe continueOnFailure transition action".into());
    }
    Ok(())
}

pub(crate) fn validate(plan: &Value, expected_hash: &str) -> Result<(), String> {
    let bytes = serde_json::to_vec(&canonical_json(plan))
        .map_err(|error| format!("transition plan serialization failed: {error}"))?;
    let actual = format!("{:x}", Sha256::digest(bytes));
    if expected_hash != actual {
        return Err("authenticated transition plan hash mismatch".into());
    }
    let object = plan
        .as_object()
        .ok_or("authenticated transition plan must be an object")?;
    let actions = object
        .get("actions")
        .and_then(Value::as_array)
        .ok_or("authenticated transition plan actions are required")?;
    if actions.len() > 128 {
        return Err("authenticated transition plan has too many actions".into());
    }
    for action in actions {
        validate_action(action)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn hash(plan: &Value) -> String {
        let bytes = serde_json::to_vec(&canonical_json(plan)).unwrap();
        format!("{:x}", Sha256::digest(bytes))
    }

    #[test]
    fn exact_plan_is_hash_bound_and_action_checked() {
        let plan = serde_json::json!({"id":"p1","actions":[{"type":"rebind","agentId":"a"}]});
        assert!(validate(&plan, &hash(&plan)).is_ok());
        assert!(validate(&plan, &"0".repeat(64)).is_err());
        let unsafe_plan = serde_json::json!({"id":"p2","actions":[{"type":"shell"}]});
        assert!(validate(&unsafe_plan, &hash(&unsafe_plan)).is_err());
    }
}

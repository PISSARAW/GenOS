use crate::omega::OmegaOperation;
use serde_json::Value;
use std::collections::BTreeMap;

pub fn verified(value: &Value) -> bool {
    if value.get("valid").and_then(Value::as_bool) == Some(false) { return false; }
    match value.get("status") {
        Some(status) => matches!(status.as_str(), Some("verified" | "formally_proved")),
        None => value.get("valid").and_then(Value::as_bool) == Some(true),
    }
}

pub fn emission(operation: &OmegaOperation, values: &BTreeMap<String, Value>, receipts: &BTreeMap<String, Value>) -> Option<(Value, Value)> {
    let first = operation.3.first()?;
    let value = values.get(first)?;
    let all_verified = operation.3.iter().all(|id| receipts.get(id).is_some_and(verified)
        && values.get(id) == Some(value));
    if !all_verified { return None; }
    Some((value.clone(), receipts.get(first)?.clone()))
}

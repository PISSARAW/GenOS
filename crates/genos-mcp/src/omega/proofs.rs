use serde_json::Value;
use std::collections::BTreeMap;

pub fn verified(receipt: &Value) -> bool {
    receipt.get("verified").and_then(|v| v.as_bool()).unwrap_or(false)
}

pub fn emission(
    _operation: &crate::omega::OmegaOperation,
    _values: &BTreeMap<String, Value>,
    _receipts: &BTreeMap<String, Value>,
) -> Option<(Value, Value)> {
    None
}
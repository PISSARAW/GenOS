use super::{ERROR_ENVELOPE_INVALID, ERROR_VERSION_UNSUPPORTED, SCHEMA, OmegaEnvelope, OmegaOperation, is_legacy_schema, legacy_operation, migrate_legacy, validate};
use serde_json::Value;
pub fn parse_envelope_value(bytes: &[u8]) -> Result<Value, String> {
    match serde_json::from_slice(bytes) {
        Ok(v) => Ok(v),
        Err(_) => Err(ERROR_ENVELOPE_INVALID.to_string()),
    }
}

pub fn parse_version(value: &Value) -> Result<u8, String> {
    match value.get("version") {
        None => Ok(1),
        Some(raw) => match raw.as_u64() {
            None => Err(ERROR_VERSION_UNSUPPORTED.to_string()),
            Some(n) => match u8::try_from(n) {
                Ok(v) => Ok(v),
                Err(_) => Err(ERROR_VERSION_UNSUPPORTED.to_string()),
            },
        },
    }
}

pub fn parse_schema(value: &Value) -> &str {
    match value.get("schema") {
        None => SCHEMA,
        Some(v) => match v.as_str() {
            None => SCHEMA,
            Some(s) => s,
        },
    }
}

pub fn is_legacy_envelope(version: u8, schema: &str) -> bool {
    match version {
        0 => true,
        _ => is_legacy_schema(schema),
    }
}

pub fn array_field<'a>(value: &'a Value, primary: &str, fallback: &str) -> Option<&'a Vec<Value>> {
    match value.get(primary) {
        Some(v) => match v.as_array() {
            Some(a) => Some(a),
            None => match value.get(fallback) {
                Some(w) => w.as_array(),
                None => None,
            },
        },
        None => match fallback.is_empty() {
            true => value.get(primary).and_then(Value::as_array),
            false => match value.get(fallback) {
                Some(w) => w.as_array(),
                None => None,
            },
        },
    }
}

pub fn collect_ops(items: &[Value]) -> Result<Vec<OmegaOperation>, String> {
    let mut out = Vec::with_capacity(items.len());
    for item in items {
        match legacy_operation(item) {
            Ok(op) => out.push(op),
            Err(e) => return Err(e),
        }
    }
    Ok(out)
}

pub fn legacy_ops_from(value: &Value) -> Result<Vec<OmegaOperation>, String> {
    match array_field(value, "operations", "ops") {
        None => Err(ERROR_ENVELOPE_INVALID.to_string()),
        Some(items) => collect_ops(items),
    }
}

pub fn modern_ops_from(value: &Value) -> Result<Vec<OmegaOperation>, String> {
    match value.get("operations") {
        None => Err(ERROR_ENVELOPE_INVALID.to_string()),
        Some(v) => match v.as_array() {
            None => Err(ERROR_ENVELOPE_INVALID.to_string()),
            Some(items) => collect_ops(items),
        },
    }
}

pub fn policy_entries(items: &serde_json::Map<String, Value>, strict: bool) -> Result<Vec<(String, Vec<String>)>, String> {
    let mut out = Vec::with_capacity(items.len());
    for (key, values) in items {
        match values.as_array() {
            None => return Err(ERROR_ENVELOPE_INVALID.to_string()),
            Some(arr) => {
                let entries = match strict {
                    true => strict_entries(arr),
                    false => lenient_entries(arr),
                };
                out.push((key.clone(), entries));
            }
        }
    }
    Ok(out)
}

pub fn lenient_entries(arr: &[Value]) -> Vec<String> {
    let mut out = Vec::with_capacity(arr.len());
    for item in arr {
        match item.as_str() {
            Some(s) => out.push(s.to_string()),
            None => out.push(String::new()),
        }
    }
    out
}

pub fn strict_entries(arr: &[Value]) -> Vec<String> {
    let mut out = Vec::new();
    for item in arr {
        match item.as_str() {
            Some(s) => out.push(s.to_string()),
            None => {},
        }
    }
    out
}

pub fn object_field<'a>(value: &'a Value, primary: &str, fallback: &str) -> Option<&'a serde_json::Map<String, Value>> {
    match value.get(primary) {
        Some(v) => match v.as_object() {
            Some(o) => Some(o),
            None => match value.get(fallback) {
                Some(w) => w.as_object(),
                None => None,
            },
        },
        None => match value.get(fallback) {
            Some(w) => w.as_object(),
            None => None,
        },
    }
}

pub fn legacy_policy_from(value: &Value) -> Result<Vec<(String, Vec<String>)>, String> {
    match object_field(value, "policy", "permissions") {
        None => Ok(Vec::new()),
        Some(items) => policy_entries(items, false),
    }
}

pub fn modern_policy_from(value: &Value) -> Result<Vec<(String, Vec<String>)>, String> {
    match value.get("policy") {
        None => Ok(Vec::new()),
        Some(v) => match v.as_object() {
            None => Ok(Vec::new()),
            Some(items) => policy_entries(items, true),
        },
    }
}

pub fn legacy_payload(value: &Value) -> Option<Value> {
    match value.get("payload") {
        Some(v) => Some(v.clone()),
        None => match value.get("context") {
            Some(w) => Some(w.clone()),
            None => None,
        },
    }
}

pub fn legacy_id(value: &Value) -> String {
    match value.get("id") {
        Some(v) => match v.as_str() {
            Some(s) => return s.to_string(),
            None => {},
        },
        None => {},
    }
    match value.get("runId") {
        Some(v) => match v.as_str() {
            Some(s) => return s.to_string(),
            None => {},
        },
        None => {},
    }
    "omega-legacy".to_string()
}

pub fn modern_id(value: &Value) -> Result<String, String> {
    match value.get("id") {
        None => Err(ERROR_ENVELOPE_INVALID.to_string()),
        Some(v) => match v.as_str() {
            None => Err(ERROR_ENVELOPE_INVALID.to_string()),
            Some(s) => Ok(s.to_string()),
        },
    }
}

pub fn build_legacy_envelope(value: &Value, version: u8, schema: &str) -> Result<OmegaEnvelope, String> {
    let operations = match legacy_ops_from(value) {
        Ok(v) => v,
        Err(e) => return Err(e),
    };
    let policy = match legacy_policy_from(value) {
        Ok(v) => v,
        Err(e) => return Err(e),
    };
    migrate_legacy(OmegaEnvelope {
        schema: schema.to_string(),
        version,
        id: legacy_id(value),
        operations,
        policy,
        payload: legacy_payload(value),
    })
}

pub fn build_modern_envelope(value: &Value, version: u8, schema: &str) -> Result<OmegaEnvelope, String> {
    let operations = match modern_ops_from(value) {
        Ok(v) => v,
        Err(e) => return Err(e),
    };
    let policy = match modern_policy_from(value) {
        Ok(v) => v,
        Err(e) => return Err(e),
    };
    let id = match modern_id(value) {
        Ok(v) => v,
        Err(e) => return Err(e),
    };
    let envelope = OmegaEnvelope {
        schema: schema.to_string(),
        version,
        id,
        operations,
        policy,
        payload: value.get("payload").cloned(),
    };
    match validate(&envelope) {
        Ok(()) => Ok(envelope),
        Err(e) => Err(e),
    }
}

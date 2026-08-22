use async_trait::async_trait;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ToolInvocation {
    pub name: String,
    pub input: serde_json::Value,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ToolResult {
    pub success: bool,
    pub output: serde_json::Value,
}

/// Validates tool arguments against the strict subset of JSON Schema used by
/// manifests: object properties, required fields, primitive types and enums.
/// Unknown fields are rejected when `additionalProperties: false` is set.
pub fn validate_arguments(
    arguments: &serde_json::Value,
    schema: &serde_json::Value,
) -> anyhow::Result<()> {
    let object = arguments
        .as_object()
        .ok_or_else(|| anyhow::anyhow!("tool arguments must be a JSON object"))?;
    if schema.get("type").and_then(serde_json::Value::as_str) == Some("object") {
        for required in schema
            .get("required")
            .and_then(serde_json::Value::as_array)
            .into_iter()
            .flatten()
        {
            let name = required
                .as_str()
                .ok_or_else(|| anyhow::anyhow!("schema required entries must be strings"))?;
            if !object.contains_key(name) {
                anyhow::bail!("missing required tool argument: {name}");
            }
        }
        if schema
            .get("additionalProperties")
            .and_then(serde_json::Value::as_bool)
            == Some(false)
        {
            if let Some(properties) = schema
                .get("properties")
                .and_then(serde_json::Value::as_object)
            {
                if let Some(unknown) = object.keys().find(|key| !properties.contains_key(*key)) {
                    anyhow::bail!("unknown tool argument: {unknown}");
                }
            }
        }
        if let Some(properties) = schema
            .get("properties")
            .and_then(serde_json::Value::as_object)
        {
            for (name, value) in object {
                if let Some(rule) = properties.get(name) {
                    validate_value(name, value, rule)?;
                }
            }
        }
    }
    Ok(())
}

fn validate_value(
    name: &str,
    value: &serde_json::Value,
    schema: &serde_json::Value,
) -> anyhow::Result<()> {
    let valid_type = match schema.get("type").and_then(serde_json::Value::as_str) {
        Some("string") => value.is_string(),
        Some("number") => value.is_number(),
        Some("integer") => value.as_i64().is_some(),
        Some("boolean") => value.is_boolean(),
        Some("array") => value.is_array(),
        Some("object") => value.is_object(),
        _ => true,
    };
    if !valid_type {
        anyhow::bail!("invalid type for tool argument: {name}");
    }
    if let Some(values) = schema.get("enum").and_then(serde_json::Value::as_array) {
        if !values.iter().any(|candidate| candidate == value) {
            anyhow::bail!("invalid enum value for tool argument: {name}");
        }
    }
    Ok(())
}

#[async_trait]
pub trait ToolExecutor: Send + Sync {
    async fn execute(&self, call: ToolInvocation) -> anyhow::Result<ToolResult>;
}

pub mod gateway;
pub use gateway::*;
pub mod controlled;
pub use controlled::*;

#[cfg(test)]
mod tests {
    use super::validate_arguments;
    use serde_json::json;

    #[test]
    fn strict_schema_rejects_missing_unknown_and_wrong_arguments() {
        let schema = json!({"type":"object","required":["query"],"additionalProperties":false,"properties":{"query":{"type":"string"}}});
        assert!(validate_arguments(&json!({"query":"ok"}), &schema).is_ok());
        assert!(validate_arguments(&json!({}), &schema).is_err());
        assert!(validate_arguments(&json!({"query":4}), &schema).is_err());
        assert!(validate_arguments(&json!({"query":"ok","extra":true}), &schema).is_err());
    }
}

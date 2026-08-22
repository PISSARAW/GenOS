use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::Value;

pub mod adapters;
pub mod factory;
pub mod fake;
pub mod inference;
pub mod reliability;
pub mod router;
pub mod ssm;

/// Standardized roles for LLM messages
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Role {
    System,
    User,
    Assistant,
    Tool,
}

/// A universal message type for communicating with LLMs
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub role: Role,
    pub content: String,
    pub tool_call_id: Option<String>,
}

/// Configuration grouping to keep function parameters < 3
#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct GenerationConfig {
    pub exact_model_version: Option<String>,
    pub temperature: Option<f32>,
    pub seed: Option<u64>,
    pub top_p: Option<f32>,
    pub top_k: Option<u32>,
    pub max_tokens: Option<u32>,
    pub stop_sequences: Vec<String>,
    #[serde(default)]
    pub tools: Vec<ToolDefinition>,
    #[serde(default)]
    pub response_format: Option<Value>,
}

/// A standardized tool call request returned by the model
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCall {
    pub id: String,
    pub function_name: String,
    pub arguments: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolDefinition {
    pub name: String,
    pub description: String,
    pub parameters: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamChunk {
    pub delta: String,
    pub done: bool,
}

/// Usage statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenUsage {
    pub prompt_tokens: u64,
    pub completion_tokens: u64,
    pub total_tokens: u64,
    pub latency_ms: u64,
}

/// Universal response from a provider
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LlmResponse {
    pub content: Option<String>,
    pub tool_calls: Vec<ToolCall>,
    pub usage: TokenUsage,
    pub request_hash: String,
    pub response_hash: String,
    pub model_version: Option<String>,
    pub system_fingerprint: Option<String>,
    pub seed_used: Option<u64>,
    pub temperature_used: Option<f32>,
    pub top_p_used: Option<f32>,
    pub top_k_used: Option<u32>,
}

/// The main abstraction trait for all LLM providers
#[async_trait]
pub trait LlmProvider: Send + Sync {
    /// Returns the name of the provider (e.g. "OpenAI", "Fake")
    fn provider_name(&self) -> &str;

    /// Generates a response based on a history of messages and a configuration.
    async fn generate(
        &self,
        messages: &[Message],
        config: &GenerationConfig,
    ) -> anyhow::Result<LlmResponse>;

    /// Normalized streaming surface. Providers with native streaming can
    /// override this; the default keeps every adapter usable by emitting one
    /// final chunk.
    async fn stream(
        &self,
        messages: &[Message],
        config: &GenerationConfig,
    ) -> anyhow::Result<Vec<StreamChunk>> {
        let response = self.generate(messages, config).await?;
        Ok(vec![StreamChunk {
            delta: response.content.unwrap_or_default(),
            done: true,
        }])
    }
}

pub fn parse_structured<T: serde::de::DeserializeOwned>(
    response: &LlmResponse,
) -> anyhow::Result<T> {
    let content = response
        .content
        .as_deref()
        .ok_or_else(|| anyhow::anyhow!("model returned no structured content"))?;
    Ok(serde_json::from_str(content)?)
}

pub fn validate_required_fields(value: &Value, schema: &Value) -> anyhow::Result<()> {
    validate_json_schema(value, schema)
}

/// Validates the portable JSON-Schema subset used by GenOS contracts.
/// Supports objects, arrays, primitive types, required fields, enums and
/// `additionalProperties: false`, including nested values.
pub fn validate_json_schema(value: &Value, schema: &Value) -> anyhow::Result<()> {
    validate_schema_at(value, schema, "$" )
}

fn validate_schema_at(value: &Value, schema: &Value, path: &str) -> anyhow::Result<()> {
    if let Some(expected) = schema.get("type").and_then(Value::as_str) {
        let valid = match expected {
            "object" => value.is_object(), "array" => value.is_array(), "string" => value.is_string(),
            "number" => value.is_number(), "integer" => value.as_i64().is_some(), "boolean" => value.is_boolean(), "null" => value.is_null(), _ => true,
        };
        if !valid { anyhow::bail!("{path}: expected {expected}"); }
    }
    if let Some(values) = schema.get("enum").and_then(Value::as_array) {
        if !values.iter().any(|candidate| candidate == value) { anyhow::bail!("{path}: value is not in enum"); }
    }
    if let Some(object) = value.as_object() {
        if let Some(required) = schema.get("required").and_then(Value::as_array) {
            for field in required { let field = field.as_str().ok_or_else(|| anyhow::anyhow!("{path}: required fields must be strings"))?; if !object.contains_key(field) { anyhow::bail!("{path}.{field}: required field is missing"); } }
        }
        let properties = schema.get("properties").and_then(Value::as_object);
        if schema.get("additionalProperties").and_then(Value::as_bool) == Some(false) {
            if let Some(properties) = properties { if let Some(unknown) = object.keys().find(|key| !properties.contains_key(*key)) { anyhow::bail!("{path}.{unknown}: additional property is not allowed"); } }
        }
        if let Some(properties) = properties { for (key, child_schema) in properties { if let Some(child) = object.get(key) { validate_schema_at(child, child_schema, &format!("{path}.{key}"))?; } } }
    }
    if let Some(items) = value.as_array() { if let Some(item_schema) = schema.get("items") { for (index, item) in items.iter().enumerate() { validate_schema_at(item, item_schema, &format!("{path}[{index}]"))?; } } }
    Ok(())
}

pub fn parse_structured_with_schema<T: serde::de::DeserializeOwned>(response: &LlmResponse, schema: &Value) -> anyhow::Result<T> {
    let content = response.content.as_deref().ok_or_else(|| anyhow::anyhow!("model returned no structured content"))?;
    let value: Value = serde_json::from_str(content)?;
    validate_json_schema(&value, schema)?;
    Ok(serde_json::from_value(value)?)
}

#[cfg(test)]
mod schema_tests {
    use super::*;
    #[test]
    fn validates_nested_contracts() {
        let schema = serde_json::json!({"type":"object","required":["items"],"additionalProperties":false,"properties":{"items":{"type":"array","items":{"type":"object","required":["name"],"properties":{"name":{"type":"string"}}}}}});
        assert!(validate_json_schema(&serde_json::json!({"items":[{"name":"ok"}]}), &schema).is_ok());
        assert!(validate_json_schema(&serde_json::json!({"items":[{}]}), &schema).is_err());
        assert!(validate_json_schema(&serde_json::json!({"items":[],"extra":true}), &schema).is_err());
    }
}

pub fn validate_tool_call(call: &ToolCall, tools: &[ToolDefinition]) -> anyhow::Result<Value> {
    let tool = tools
        .iter()
        .find(|tool| tool.name == call.function_name)
        .ok_or_else(|| anyhow::anyhow!("unknown tool {}", call.function_name))?;
    let arguments: Value = serde_json::from_str(&call.arguments).map_err(|error| {
        anyhow::anyhow!("invalid arguments for {}: {error}", call.function_name)
    })?;
    validate_required_fields(&arguments, &tool.parameters)?;
    Ok(arguments)
}

use serde_json::Value;
use std::collections::BTreeSet;

/// Profil de schéma borné, sans résolution de référence ni validation sémantique d'un outil.
pub(super) fn validate(schema: &Value) -> Result<(), String> {
    if schema["type"].as_str() != Some("object") { return Err("NATIVE_LLM_TOOL_OBJECT_SCHEMA_REQUIRED".into()); }
    visit(schema)
}

fn visit(schema: &Value) -> Result<(), String> {
    let object = schema.as_object().ok_or("NATIVE_LLM_TOOL_SCHEMA_INVALID")?;
    for (key, value) in object {
        keyword(key, value)?;
    }
    let kind = schema["type"].as_str().ok_or("NATIVE_LLM_TOOL_SCHEMA_TYPE_REQUIRED")?;
    if !["object", "array", "string", "integer", "number", "boolean", "null"].contains(&kind) {
        return Err("NATIVE_LLM_TOOL_SCHEMA_TYPE_INVALID".into());
    }
    required(schema)?;
    Ok(())
}

fn keyword(key: &str, value: &Value) -> Result<(), String> {
    match key {
        "type" | "description" => { value.as_str().ok_or("NATIVE_LLM_TOOL_SCHEMA_INVALID")?; }
        "properties" => properties(value)?,
        "items" => visit(value)?,
        "required" => { value.as_array().ok_or("NATIVE_LLM_TOOL_SCHEMA_INVALID")?; }
        "additionalProperties" => { value.as_bool().ok_or("NATIVE_LLM_TOOL_SCHEMA_INVALID")?; }
        "enum" => enumeration(value)?,
        "minimum" | "maximum" => { value.as_number().ok_or("NATIVE_LLM_TOOL_SCHEMA_INVALID")?; }
        "minLength" | "maxLength" | "minItems" | "maxItems" => { value.as_u64().ok_or("NATIVE_LLM_TOOL_SCHEMA_INVALID")?; }
        _ => return Err("NATIVE_LLM_TOOL_SCHEMA_KEYWORD_UNSUPPORTED".into()),
    }
    Ok(())
}

fn properties(value: &Value) -> Result<(), String> {
    let properties = value.as_object().ok_or("NATIVE_LLM_TOOL_SCHEMA_INVALID")?;
    for (key, schema) in properties {
        if key.is_empty() || key.len() > 128 { return Err("NATIVE_LLM_TOOL_SCHEMA_PROPERTY_INVALID".into()); }
        visit(schema)?;
    }
    Ok(())
}

fn required(schema: &Value) -> Result<(), String> {
    let Some(required) = schema.get("required") else { return Ok(()); };
    let mut names = BTreeSet::new();
    for key in required.as_array().ok_or("NATIVE_LLM_TOOL_SCHEMA_INVALID")? {
        let key = key.as_str().ok_or("NATIVE_LLM_TOOL_SCHEMA_REQUIRED_INVALID")?;
        if schema["properties"].get(key).is_none() || !names.insert(key) { return Err("NATIVE_LLM_TOOL_SCHEMA_REQUIRED_INVALID".into()); }
    }
    Ok(())
}

fn enumeration(value: &Value) -> Result<(), String> {
    let items = value.as_array().filter(|items| !items.is_empty()).ok_or("NATIVE_LLM_TOOL_SCHEMA_INVALID")?;
    let mut values = BTreeSet::new();
    for item in items {
        if !values.insert(item.to_string()) { return Err("NATIVE_LLM_TOOL_SCHEMA_ENUM_DUPLICATE".into()); }
    }
    Ok(())
}

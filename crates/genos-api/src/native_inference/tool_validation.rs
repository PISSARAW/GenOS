use super::{ToolInferenceRequest, ToolMessage, ToolCall, tool_base_messages};
use serde_json::Value;
use std::collections::{BTreeSet, VecDeque};

pub(super) fn bounded(request: &ToolInferenceRequest) -> Result<(), String> {
    if request.messages.len() > 64 || request.tools.len() > 8 { return Err("NATIVE_LLM_TOOL_COUNT_LIMIT".into()); }
    if request.base.messages.len() > 64 { return Err("NATIVE_LLM_MESSAGE_COUNT_INVALID".into()); }
    for definition in &request.tools { bounded_definition(definition)?; }
    for message in &request.messages { bounded_message(message)?; }
    if request.base.messages.iter().any(|message| message.content.len() > 65536) { return Err("NATIVE_LLM_PROMPT_TOO_LARGE".into()); }
    Ok(())
}

fn bounded_definition(definition: &super::ToolDefinition) -> Result<(), String> {
    if definition.description.len() > 4096 || definition.name.len() > 64 { return Err("NATIVE_LLM_TOOL_DEFINITION_INVALID".into()); }
    json_bound(&definition.parameters)
}

fn bounded_message(message: &ToolMessage) -> Result<(), String> {
    if message_content(message).len() > 65536 { return Err("NATIVE_LLM_PROMPT_TOO_LARGE".into()); }
    if let ToolMessage::Assistant { tool_calls, .. } = message {
        if tool_calls.len() > 4 { return Err("NATIVE_LLM_TOOL_CALL_LIMIT".into()); }
        for call in tool_calls { json_bound(&call.arguments)?; }
    }
    Ok(())
}

pub(super) fn json_bound(value: &Value) -> Result<(), String> {
    let mut pending = vec![(value, 0usize)];
    let mut nodes = 0usize;
    while let Some((value, depth)) = pending.pop() {
        nodes += 1;
        if depth > 16 || nodes > 4096 { return Err("NATIVE_LLM_TOOL_JSON_LIMIT".into()); }
        match value {
            Value::Object(values) => pending.extend(values.values().map(|value| (value, depth + 1))),
            Value::Array(values) => pending.extend(values.iter().map(|value| (value, depth + 1))),
            _ => {}
        }
    }
    if serde_json::to_vec(value).map_err(|error| error.to_string())?.len() > 16384 {
        return Err("NATIVE_LLM_TOOL_JSON_LIMIT".into());
    }
    Ok(())
}

pub(super) fn identifier(value: &str) -> Result<(), String> {
    if value.is_empty() || value.len() > 128 || !value.bytes().all(|byte| byte.is_ascii_alphanumeric() || b"_-:.".contains(&byte)) {
        return Err("NATIVE_LLM_TOOL_IDENTIFIER_INVALID".into());
    }
    Ok(())
}

pub(super) fn name(value: &str) -> Result<(), String> {
    identifier(value)?;
    if value.len() > 64 || value.bytes().any(|byte| b":.".contains(&byte)) { return Err("NATIVE_LLM_TOOL_NAME_INVALID".into()); }
    Ok(())
}

pub(super) fn validate(request: &ToolInferenceRequest) -> Result<(), String> {
    bounded(request)?;
    super::validate_request(&request.base)?;
    if request.messages.is_empty() || request.tools.is_empty() { return Err("NATIVE_LLM_TOOLS_REQUIRED".into()); }
    if request.base.messages != tool_base_messages(&request.messages) { return Err("NATIVE_LLM_TOOL_BASE_PROJECTION_MISMATCH".into()); }
    let names = definitions(request)?;
    dialogue(&request.messages, &names)?;
    if serde_json::to_vec(&super::tool_request_descriptor(request)).map_err(|error| error.to_string())?.len() > 262144 {
        return Err("NATIVE_LLM_TOOL_REQUEST_TOO_LARGE".into());
    }
    Ok(())
}

fn definitions(request: &ToolInferenceRequest) -> Result<BTreeSet<&str>, String> {
    let mut names = BTreeSet::new();
    for tool in &request.tools {
        name(&tool.name)?;
        if !names.insert(tool.name.as_str()) || tool.description.len() > 4096 { return Err("NATIVE_LLM_TOOL_DEFINITION_INVALID".into()); }
        super::tool_schema::validate(&tool.parameters)?;
    }
    Ok(names)
}

pub(super) fn call(call: &ToolCall, names: &BTreeSet<&str>) -> Result<(), String> {
    identifier(&call.id)?;
    name(&call.name)?;
    if !names.contains(call.name.as_str()) || !call.arguments.is_object() { return Err("NATIVE_LLM_UNDECLARED_OR_INVALID_TOOL_CALL".into()); }
    json_bound(&call.arguments)
}

fn dialogue(messages: &[ToolMessage], names: &BTreeSet<&str>) -> Result<(), String> {
    let mut pending = VecDeque::new();
    let mut ids = BTreeSet::new();
    let mut bytes = 0usize;
    for message in messages {
        bytes += message_content(message).len();
        message_step(message, (&mut pending, &mut ids), names)?;
    }
    if !pending.is_empty() { return Err("NATIVE_LLM_TOOL_RESULTS_MISSING".into()); }
    if bytes > 65536 { return Err("NATIVE_LLM_PROMPT_TOO_LARGE".into()); }
    Ok(())
}

fn message_content(message: &ToolMessage) -> &str {
    match message {
        ToolMessage::System { content } | ToolMessage::User { content } |
        ToolMessage::Assistant { content, .. } | ToolMessage::Tool { content, .. } => content,
    }
}

fn message_step<'a>(message: &'a ToolMessage, state: (&mut VecDeque<(&'a str, &'a str)>, &mut BTreeSet<&'a str>), names: &BTreeSet<&str>) -> Result<(), String> {
    if let ToolMessage::Tool { tool_call_id, name, .. } = message {
        if state.0.pop_front() != Some((tool_call_id.as_str(), name.as_str())) { return Err("NATIVE_LLM_TOOL_RESULT_MISMATCH".into()); }
        return Ok(());
    }
    if !state.0.is_empty() { return Err("NATIVE_LLM_TOOL_RESULTS_MISSING".into()); }
    if let ToolMessage::Assistant { content, tool_calls } = message {
        if content.trim().is_empty() && tool_calls.is_empty() { return Err("NATIVE_LLM_EMPTY_MESSAGE".into()); }
        return register_calls(tool_calls, state, names);
    }
    if message_content(message).trim().is_empty() { return Err("NATIVE_LLM_EMPTY_MESSAGE".into()); }
    Ok(())
}

fn register_calls<'a>(calls: &'a [ToolCall], state: (&mut VecDeque<(&'a str, &'a str)>, &mut BTreeSet<&'a str>), names: &BTreeSet<&str>) -> Result<(), String> {
    for item in calls {
        call(item, names)?;
        if !state.1.insert(item.id.as_str()) { return Err("NATIVE_LLM_DUPLICATE_TOOL_CALL_ID".into()); }
        state.0.push_back((item.id.as_str(), item.name.as_str()));
    }
    Ok(())
}

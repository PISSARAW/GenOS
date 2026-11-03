use super::{ToolInferenceRequest, ToolMessage, ToolCall, ProviderConfig, ModelObservation, Finish};
use serde_json::{Value, json};
use std::collections::BTreeSet;

pub(super) fn body(request: &ToolInferenceRequest) -> Result<Value, String> {
    let mut body = super::transport::body(&request.base);
    let openai = matches!(request.base.provider, ProviderConfig::OpenAi { .. });
    let messages: Result<Vec<_>, _> = request.messages.iter().map(|item| message(item, openai)).collect();
    body["messages"] = Value::Array(messages?);
    body["tools"] = Value::Array(request.tools.iter().map(|tool| json!({"type":"function",
        "function":{"name":tool.name,"description":tool.description,"parameters":tool.parameters}})).collect());
    Ok(body)
}

fn message(message: &ToolMessage, openai: bool) -> Result<Value, String> {
    Ok(match message {
        ToolMessage::System { content } => json!({"role":"system","content":content}),
        ToolMessage::User { content } => json!({"role":"user","content":content}),
        ToolMessage::Assistant { content, tool_calls } => {
            let calls: Result<Vec<_>, _> = tool_calls.iter().map(|call| encoded_call(call, openai)).collect();
            let mut value = json!({"role":"assistant","content":content});
            if !tool_calls.is_empty() { value["tool_calls"] = Value::Array(calls?); }
            value
        }
        ToolMessage::Tool { tool_call_id, name, content } => {
            if openai { json!({"role":"tool","tool_call_id":tool_call_id,"content":content}) }
            else { json!({"role":"tool","tool_name":name,"content":content}) }
        }
    })
}

fn encoded_call(call: &ToolCall, openai: bool) -> Result<Value, String> {
    if openai {
        Ok(json!({"id":call.id,"type":"function","function":{"name":call.name,
            "arguments":serde_json::to_string(&call.arguments).map_err(|error| error.to_string())?}}))
    } else { Ok(json!({"type":"function","function":{"name":call.name,"arguments":call.arguments}})) }
}

pub(super) fn decode(request: &ToolInferenceRequest, native: &ModelObservation) -> Result<(Vec<ToolCall>, Finish), String> {
    let data: Value = serde_json::from_slice(native.response_body()).map_err(|_| "NATIVE_LLM_INVALID_JSON")?;
    let message = match request.base.provider {
        ProviderConfig::Ollama { .. } => &data["message"],
        ProviderConfig::OpenAi { .. } => &data["choices"][0]["message"],
    };
    let calls = parsed_calls(request, native, message)?;
    let finish = finish(request, native, (&data, &calls))?;
    Ok((calls, finish))
}

fn parsed_calls(request: &ToolInferenceRequest, native: &ModelObservation, message: &Value) -> Result<Vec<ToolCall>, String> {
    let Some(value) = message.get("tool_calls").filter(|value| !value.is_null()) else { return Ok(Vec::new()); };
    let values = value.as_array().filter(|values| values.len() <= 4).ok_or("NATIVE_LLM_TOOL_CALL_LIMIT")?;
    let names = request.tools.iter().map(|tool| tool.name.as_str()).collect();
    let mut ids: BTreeSet<String> = request.messages.iter().filter_map(|message| {
        if let ToolMessage::Assistant { tool_calls, .. } = message { Some(tool_calls) } else { None }
    }).flatten().map(|call| call.id.clone()).collect();
    let mut calls = Vec::new();
    for (index, value) in values.iter().enumerate() {
        let call = parse_call(value, (request, native), index)?;
        super::tool_validation::call(&call, &names)?;
        if !ids.insert(call.id.clone()) { return Err("NATIVE_LLM_DUPLICATE_TOOL_CALL_ID".into()); }
        calls.push(call);
    }
    Ok(calls)
}

fn parse_call(value: &Value, input: (&ToolInferenceRequest, &ModelObservation), index: usize) -> Result<ToolCall, String> {
    let (request, native) = input;
    let function = value["function"].as_object().ok_or("NATIVE_LLM_TOOL_FUNCTION_REQUIRED")?;
    let name = function.get("name").and_then(Value::as_str).ok_or("NATIVE_LLM_TOOL_NAME_REQUIRED")?.to_owned();
    let openai = matches!(request.base.provider, ProviderConfig::OpenAi { .. });
    if openai || value.get("type").is_some() {
        if value["type"].as_str() != Some("function") { return Err("NATIVE_LLM_FUNCTION_TOOL_ONLY".into()); }
    }
    let arguments = arguments(function.get("arguments"), openai)?;
    let id = match value.get("id") {
        Some(Value::String(id)) => id.clone(),
        None if !openai => synthetic_id(native, index)?,
        _ => return Err("NATIVE_LLM_TOOL_CALL_ID_REQUIRED".into()),
    };
    Ok(ToolCall { id, name, arguments })
}

fn arguments(value: Option<&Value>, openai: bool) -> Result<Value, String> {
    let value = value.ok_or("NATIVE_LLM_TOOL_ARGUMENTS_REQUIRED")?;
    if openai {
        let text = value.as_str().filter(|text| text.len() <= 16384).ok_or("NATIVE_LLM_TOOL_ARGUMENTS_INVALID")?;
        serde_json::from_str(text).map_err(|_| "NATIVE_LLM_TOOL_ARGUMENTS_INVALID".into())
    } else { Ok(value.clone()) }
}

fn synthetic_id(native: &ModelObservation, index: usize) -> Result<String, String> {
    let hash = super::json_hash(&json!({"profile":"genos.native-inference/ollama-call-id/v1",
        "request_hash":native.request_hash(),"response_hash":native.response_hash(),"index":index}))?;
    Ok(format!("ollama_{}", hash.trim_start_matches("sha256:")))
}

fn finish(request: &ToolInferenceRequest, native: &ModelObservation, response: (&Value, &[ToolCall])) -> Result<Finish, String> {
    if native.finish() == Finish::Refused { return Ok(Finish::Refused); }
    if matches!(native.finish_reason(), Some("length" | "max_tokens")) { return Ok(Finish::Truncated); }
    match request.base.provider {
        ProviderConfig::Ollama { .. } => {
            let done = response.0["done"].as_bool().ok_or("NATIVE_LLM_OLLAMA_DONE_FLAG_REQUIRED")?;
            if !done { return Ok(Finish::Incomplete); }
        }
        ProviderConfig::OpenAi { .. } => {
            if !response.1.is_empty() && native.finish_reason() != Some("tool_calls") { return Ok(Finish::Incomplete); }
        }
    }
    if !response.1.is_empty() { return Ok(Finish::ToolRequested); }
    if native.finish() == Finish::ToolRequested { return Err("NATIVE_LLM_TOOL_CALLS_REQUIRED".into()); }
    Ok(native.finish())
}

#[cfg(test)]
#[path = "tool_wire_tests.rs"]
mod tests;

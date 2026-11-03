use super::{Finish, ProviderConfig, TokenUsage, bytes_hash};
use super::observation::ResponseFacts;
use serde_json::Value;

pub(super) fn facts(provider: &ProviderConfig, status: u16, bytes: &[u8]) -> ResponseFacts {
    let data: Value = serde_json::from_slice(bytes).unwrap_or(Value::Null);
    let (input, output, total) = observed_usage(provider, &data);
    let usage = usage_values(provider, &data).ok().and_then(|_| input.zip(output))
        .map(|(input_tokens, output_tokens)| TokenUsage { input_tokens, output_tokens, total_tokens: total });
    ResponseFacts { status, response_hash: bytes_hash(bytes), provider_request_id: None,
        reported_model: data["model"].as_str().map(str::to_owned), input_tokens: input, output_tokens: output, total_tokens: total,
        usage, finish_reason: None, refusal: None }
}

fn observed_usage(provider: &ProviderConfig, data: &Value) -> (Option<u64>, Option<u64>, Option<u64>) {
    match provider {
        ProviderConfig::Ollama { .. } => (token(data.get("prompt_eval_count")).ok().flatten(),
            token(data.get("eval_count")).ok().flatten(), None),
        ProviderConfig::OpenAi { .. } => (token(data["usage"].get("prompt_tokens")).ok().flatten(),
            token(data["usage"].get("completion_tokens")).ok().flatten(), token(data["usage"].get("total_tokens")).ok().flatten()),
    }
}

pub(super) fn decode(provider: &ProviderConfig, bytes: &[u8], facts: &mut ResponseFacts) -> Result<(String, Finish), String> {
    let data: Value = serde_json::from_slice(bytes).map_err(|_| "NATIVE_LLM_INVALID_JSON")?;
    usage_values(provider, &data)?;
    match provider {
        ProviderConfig::Ollama { .. } => ollama(&data, facts),
        ProviderConfig::OpenAi { .. } => openai(&data, facts),
    }
}

fn token(value: Option<&Value>) -> Result<Option<u64>, String> {
    match value {
        None | Some(Value::Null) => Ok(None),
        Some(value) => value.as_u64().filter(|count| *count <= i64::MAX as u64)
            .map(Some).ok_or_else(|| "NATIVE_LLM_INVALID_PROVIDER_USAGE".into()),
    }
}

fn usage_values(provider: &ProviderConfig, data: &Value) -> Result<(Option<u64>, Option<u64>, Option<u64>), String> {
    match provider {
        ProviderConfig::Ollama { .. } => Ok((token(data.get("prompt_eval_count"))?, token(data.get("eval_count"))?, None)),
        ProviderConfig::OpenAi { .. } => {
            let usage = &data["usage"];
            if !usage.is_null() && !usage.is_object() { return Err("NATIVE_LLM_INVALID_PROVIDER_USAGE".into()); }
            Ok((token(usage.get("prompt_tokens"))?, token(usage.get("completion_tokens"))?, token(usage.get("total_tokens"))?))
        }
    }
}

fn optional_text(value: Option<&Value>) -> Result<Option<String>, String> {
    match value {
        None | Some(Value::Null) => Ok(None),
        Some(Value::String(text)) => Ok(Some(text.clone())),
        Some(_) => Err("NATIVE_LLM_EXPECTED_TEXT_RESPONSE".into()),
    }
}

fn message_text(message: &Value) -> Result<String, String> {
    if message["role"].as_str() != Some("assistant") { return Err("NATIVE_LLM_RESPONSE_ROLE_INVALID".into()); }
    let text = optional_text(message.get("content"))?.unwrap_or_default();
    if text.len() > 262144 { return Err("NATIVE_LLM_OUTPUT_TOO_LARGE".into()); }
    Ok(text)
}

fn tools_requested(message: &Value) -> Result<bool, String> {
    match message.get("tool_calls") {
        None | Some(Value::Null) => Ok(false),
        Some(Value::Array(tools)) => Ok(!tools.is_empty()),
        Some(_) => Err("NATIVE_LLM_INVALID_TOOL_RESPONSE".into()),
    }
}

fn termination(message: &Value, facts: &ResponseFacts) -> Result<Option<Finish>, String> {
    if facts.refusal.as_ref().is_some_and(|value| !value.is_empty()) { return Ok(Some(Finish::Refused)); }
    if tools_requested(message)? { return Ok(Some(Finish::ToolRequested)); }
    Ok(None)
}

fn finish_for(reason: Option<&str>) -> Finish {
    match reason {
        Some("stop") => Finish::Complete,
        Some("length" | "max_tokens") => Finish::Truncated,
        Some("tool_calls" | "function_call") => Finish::ToolRequested,
        Some("content_filter") => Finish::Refused,
        _ => Finish::Incomplete,
    }
}

fn ollama(data: &Value, facts: &mut ResponseFacts) -> Result<(String, Finish), String> {
    let message = &data["message"];
    let text = message_text(message)?;
    facts.finish_reason = optional_text(data.get("done_reason"))?;
    facts.refusal = optional_text(message.get("refusal"))?;
    if let Some(finish) = termination(message, facts)? { return Ok((text, finish)); }
    let done = data["done"].as_bool().ok_or("NATIVE_LLM_OLLAMA_DONE_FLAG_REQUIRED")?;
    let finish = if done { finish_for(facts.finish_reason.as_deref()) } else { Finish::Incomplete };
    Ok((text.clone(), nonempty_finish(&text, finish)))
}

fn openai(data: &Value, facts: &mut ResponseFacts) -> Result<(String, Finish), String> {
    let choices = data["choices"].as_array().filter(|values| values.len() == 1)
        .ok_or("NATIVE_LLM_SINGLE_CHOICE_REQUIRED")?;
    let message = &choices[0]["message"];
    let text = message_text(message)?;
    facts.finish_reason = optional_text(choices[0].get("finish_reason"))?;
    facts.refusal = optional_text(message.get("refusal"))?;
    if let Some(finish) = termination(message, facts)? { return Ok((text, finish)); }
    let finish = nonempty_finish(&text, finish_for(facts.finish_reason.as_deref()));
    Ok((text, finish))
}

fn nonempty_finish(text: &str, finish: Finish) -> Finish {
    if text.trim().is_empty() && finish == Finish::Complete { Finish::Incomplete } else { finish }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn openai_text_finish_and_full_provider_usage_are_preserved() {
        let provider = ProviderConfig::OpenAi { model: "configured-alias".into(), generation: 1 };
        let bytes = serde_json::to_vec(&json!({"model":"provider-reported-snapshot",
            "choices":[{"message":{"role":"assistant","content":"provider completion"},"finish_reason":"stop"}],
            "usage":{"prompt_tokens":12,"completion_tokens":31,"total_tokens":43,
                "completion_tokens_details":{"reasoning_tokens":20}}})).unwrap();
        let mut response = facts(&provider, 200, &bytes);
        let (text, finish) = decode(&provider, &bytes, &mut response).unwrap();
        assert_eq!(text, "provider completion");
        assert_eq!(finish, Finish::Complete);
        assert_eq!(response.reported_model.as_deref(), Some("provider-reported-snapshot"));
        assert_eq!(response.usage.unwrap().output_tokens, 31);
    }

    #[test]
    fn openai_length_and_refusal_are_not_complete() {
        let provider = ProviderConfig::OpenAi { model: "configured-alias".into(), generation: 1 };
        for (message, reason, expected) in [(json!({"role":"assistant","content":"partial"}), "length", Finish::Truncated),
            (json!({"role":"assistant","content":null,"refusal":"provider refusal"}), "stop", Finish::Refused)] {
            let bytes = serde_json::to_vec(&json!({"choices":[{"message":message,"finish_reason":reason}]})).unwrap();
            let mut response = facts(&provider, 200, &bytes);
            assert_eq!(decode(&provider, &bytes, &mut response).unwrap().1, expected);
            assert!(response.usage.is_none());
        }
    }

    #[test]
    fn provider_total_only_remains_observed_but_does_not_invent_missing_components() {
        let provider = ProviderConfig::OpenAi { model: "configured-alias".into(), generation: 1 };
        let bytes = serde_json::to_vec(&json!({"choices":[{"message":{"role":"assistant","content":"text"},
            "finish_reason":"stop"}],"usage":{"total_tokens":25000}})).unwrap();
        let mut response = facts(&provider, 200, &bytes);
        assert_eq!(response.input_tokens, None);
        assert_eq!(response.output_tokens, None);
        assert_eq!(response.total_tokens, Some(25000));
        assert!(response.usage.is_none());
        assert_eq!(decode(&provider, &bytes, &mut response).unwrap().1, Finish::Complete);
    }

    #[test]
    fn invalid_total_preserves_valid_partial_counters_without_claiming_full_usage() {
        let provider = ProviderConfig::OpenAi { model: "configured-alias".into(), generation: 1 };
        let bytes = serde_json::to_vec(&json!({"choices":[{"message":{"role":"assistant","content":"text"},
            "finish_reason":"stop"}],"usage":{"prompt_tokens":17,"completion_tokens":23,"total_tokens":-1}})).unwrap();
        let mut response = facts(&provider, 200, &bytes);
        assert_eq!(response.input_tokens, Some(17));
        assert_eq!(response.output_tokens, Some(23));
        assert_eq!(response.total_tokens, None);
        assert!(response.usage.is_none());
        assert!(decode(&provider, &bytes, &mut response).is_err());
    }
}

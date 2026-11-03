mod native_inference_fixture;
use native_inference_fixture::{Reply, Server, completion, request};
use genos_api::native_inference::{self as api, Finish, FailurePhase, ToolCall, ToolDefinition, ToolMessage, ToolInferenceRequest};
use serde_json::{Value, json};
use std::sync::{Arc, atomic::AtomicBool};

fn tool_request(server: &Server) -> ToolInferenceRequest {
    let base = request(server.address);
    let messages = vec![ToolMessage::User { content: base.messages[0].content.clone() }];
    ToolInferenceRequest { base, messages, tools: vec![ToolDefinition {
        name: "read_source".into(), description: "Read one installed source".into(),
        parameters: json!({"type":"object","properties":{"path":{"type":"string"}},
            "required":["path"],"additionalProperties":false}),
    }] }
}

fn tool_response() -> Value {
    let mut response = completion("");
    response["message"]["tool_calls"] = json!([{"function":{"name":"read_source","arguments":{"path":"notes.txt"}}}]);
    response
}

fn body(server: &Server) -> Value {
    serde_json::from_str(server.requests()[0].split_once("\r\n\r\n").unwrap().1).unwrap()
}

#[test]
fn ollama_calls_are_actual_fields_bound_to_the_exact_effective_request() {
    let reply = Reply::json(tool_response());
    let bytes = reply.bytes.clone();
    let server = Server::start(reply);
    let request = tool_request(&server);
    let observation = api::execute_tools(&request).unwrap();
    observation.assert_request(&request).unwrap();
    let native = observation.native();
    assert_eq!(native.finish(), Finish::ToolRequested);
    assert_eq!(native.response_body(), bytes);
    assert_eq!(native.usage().unwrap().input_tokens, 19);
    assert_eq!(native.request_hash(), api::tool_request_hash(&request).unwrap());
    assert_ne!(native.request_hash(), api::request_hash(&request.base).unwrap());
    let call = &observation.tool_calls()[0];
    assert!(call.id.starts_with("ollama_"));
    assert_eq!(call.name, "read_source");
    assert_eq!(call.arguments, json!({"path":"notes.txt"}));
    assert_eq!(body(&server)["tools"][0]["function"]["parameters"], request.tools[0].parameters);
    assert_eq!(server.requests().len(), 1);
    let mut changed = request.clone();
    changed.tools[0].description.push_str(" changed");
    assert!(observation.assert_request(&changed).is_err());
    changed = request.clone();
    changed.base.context_hash.push('x');
    assert!(observation.assert_request(&changed).is_err());
}

#[test]
fn followup_encodes_assistant_calls_and_tool_results_without_prose_interpretation() {
    let server = Server::start(Reply::json(completion("final fixture response")));
    let mut request = tool_request(&server);
    request.messages.extend([
        ToolMessage::Assistant { content: String::new(), tool_calls: vec![ToolCall {
            id:"ollama_previous".into(), name:"read_source".into(), arguments:json!({"path":"notes.txt"}) }] },
        ToolMessage::Tool { tool_call_id:"ollama_previous".into(), name:"read_source".into(), content:"trusted source bytes".into() },
    ]);
    request.base.messages = api::tool_base_messages(&request.messages);
    let expected_hash = api::tool_request_hash(&request).unwrap();
    let observation = api::execute_tools(&request).unwrap();
    assert_eq!(observation.native().finish(), Finish::Complete);
    assert!(observation.tool_calls().is_empty());
    assert_eq!(body(&server)["messages"][1]["tool_calls"][0]["function"]["arguments"], json!({"path":"notes.txt"}));
    assert_eq!(body(&server)["messages"][2], json!({"role":"tool","tool_name":"read_source","content":"trusted source bytes"}));
    if let ToolMessage::Tool { tool_call_id, .. } = &mut request.messages[2] { tool_call_id.push('x'); }
    assert_ne!(api::tool_request_hash(&request).unwrap(), expected_hash);
    assert!(api::validate_tool_request(&request).is_err());
}

#[test]
fn json_in_content_is_never_an_executable_call() {
    let server = Server::start(Reply::json(completion(r#"{"tool_calls":[{"name":"read_source","arguments":{}}]}"#)));
    let observation = api::execute_tools(&tool_request(&server)).unwrap();
    assert_eq!(observation.native().finish(), Finish::Complete);
    assert!(observation.tool_calls().is_empty());
}

#[test]
fn malformed_or_undeclared_calls_fail_with_real_usage_and_response_preserved() {
    for calls in [json!([{"function":{"name":"shell","arguments":{}}}]),
        json!([{"function":{"name":"read_source","arguments":"{}"}}]),
        json!([{"id":"duplicate","function":{"name":"read_source","arguments":{}}},
            {"id":"duplicate","function":{"name":"read_source","arguments":{}}}])] {
        let mut response = tool_response();
        response["message"]["tool_calls"] = calls;
        let reply = Reply::json(response);
        let bytes = reply.bytes.clone();
        let server = Server::start(reply);
        let request = tool_request(&server);
        let failure = api::execute_tools(&request).unwrap_err();
        assert_eq!(failure.phase(), FailurePhase::ObservedHttpFailure);
        assert_eq!(failure.request_hash(), api::tool_request_hash(&request).unwrap());
        assert_eq!(failure.usage().unwrap().output_tokens, 7);
        assert_eq!(failure.response_body().unwrap(), bytes);
        assert_eq!(server.requests().len(), 1);
    }
}

#[test]
fn refusal_truncation_and_unfinished_provider_turn_never_authorize_tools() {
    for (key, value, expected) in [("done_reason", json!("length"), Finish::Truncated),
        ("done", json!(false), Finish::Incomplete), ("refusal", json!("refused"), Finish::Refused)] {
        let mut response = tool_response();
        if key == "refusal" { response["message"][key] = value; } else { response[key] = value; }
        let server = Server::start(Reply::json(response));
        let observation = api::execute_tools(&tool_request(&server)).unwrap();
        assert_eq!(observation.native().finish(), expected);
        assert_eq!(observation.tool_calls().len(), 1);
    }
}

#[test]
fn invalid_schemas_projection_and_pending_results_are_refused_before_http() {
    let server = Server::start(Reply::json(tool_response()));
    let original = tool_request(&server);
    let mut invalid = Vec::new();
    let mut request = original.clone();
    request.tools[0].parameters = json!({"arbitrary":"not a schema"});
    invalid.push(request);
    let mut request = original.clone();
    request.base.messages[0].content.push('x');
    invalid.push(request);
    let mut request = original.clone();
    request.messages.push(ToolMessage::Tool { tool_call_id:"unknown".into(),name:"read_source".into(),content:"forged".into() });
    invalid.push(request);
    let mut request = original.clone();
    request.messages.push(ToolMessage::Assistant { content:String::new(),tool_calls:vec![ToolCall {
        id:"pending".into(),name:"read_source".into(),arguments:json!({}) }] });
    invalid.push(request);
    for request in invalid {
        let failure = api::execute_tools(&request).unwrap_err();
        assert_eq!(failure.phase(), FailurePhase::BeforeDispatch);
        assert_eq!(failure.request_hash(), api::tool_request_hash(&request).unwrap());
    }
    assert!(server.requests().is_empty());
}

#[test]
fn cancellation_after_http_and_lost_responses_remain_unknown_without_retry() {
    for disconnect in [false, true] {
        let cancelled = Arc::new(AtomicBool::new(false));
        let mut reply = Reply::json(tool_response());
        reply.disconnect = disconnect;
        reply.cancel_on_receive = Some(cancelled.clone());
        let server = Server::start(reply);
        let mut request = tool_request(&server);
        request.base.cancelled = Some(cancelled);
        let failure = api::execute_tools(&request).unwrap_err();
        assert_eq!(failure.phase(), FailurePhase::OutcomeUnknown);
        assert_eq!(failure.request_hash(), api::tool_request_hash(&request).unwrap());
        assert_eq!(server.requests().len(), 1);
    }
}

#[test]
fn json_depth_call_limits_and_schema_fields_are_bounded_before_dispatch() {
    let server = Server::start(Reply::json(tool_response()));
    let mut request = tool_request(&server);
    let mut deep = json!({});
    for _ in 0..18 { deep = json!({"child":deep}); }
    request.tools[0].parameters = deep;
    assert_eq!(api::execute_tools(&request).unwrap_err().phase(), FailurePhase::BeforeDispatch);
    let mut request = tool_request(&server);
    request.tools = vec![request.tools[0].clone();9];
    assert_eq!(api::execute_tools(&request).unwrap_err().phase(), FailurePhase::BeforeDispatch);
    let mut request = tool_request(&server);
    request.messages.push(ToolMessage::Assistant { content:String::new(),tool_calls:vec![ToolCall {
        id:"x".into(),name:"read_source".into(),arguments:json!({}) };5] });
    assert_eq!(api::execute_tools(&request).unwrap_err().phase(), FailurePhase::BeforeDispatch);
    assert!(server.requests().is_empty());
    assert!(serde_json::from_value::<ToolMessage>(json!({"role":"tool","name":"read_source", "tool_call_id":"x", "content":"x","authority":"fabricated"})).is_err());
}

#[test]
fn all_tool_results_must_close_in_order_without_duplicating_ids() {
    let server = Server::start(Reply::json(completion("unused")));
    let mut request = tool_request(&server);
    let first = ToolCall { id:"one".into(),name:"read_source".into(),arguments:json!({}) };
    let second = ToolCall { id:"two".into(),..first.clone() };
    request.messages.push(ToolMessage::Assistant { content:String::new(),tool_calls:vec![first.clone(),second] });
    request.messages.push(ToolMessage::Tool { tool_call_id:"two".into(),name:"read_source".into(),content:"second before first".into() });
    assert!(api::validate_tool_request(&request).is_err());
    request.messages.pop();
    request.messages.push(ToolMessage::Tool { tool_call_id:"one".into(),name:"read_source".into(),content:"first".into() });
    assert!(api::validate_tool_request(&request).is_err());
    request.messages.push(ToolMessage::Tool { tool_call_id:"two".into(),name:"read_source".into(),content:"second".into() });
    api::validate_tool_request(&request).unwrap();
    request.messages.push(ToolMessage::Assistant { content:String::new(),tool_calls:vec![first] });
    assert!(api::validate_tool_request(&request).is_err());
    assert!(server.requests().is_empty());
}

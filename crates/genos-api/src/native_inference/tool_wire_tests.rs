use super::*;
use crate::native_inference::{Generation, InferenceRequest, ToolDefinition, tool_base_messages};
use crate::native_inference::observation::Identity;

fn request() -> ToolInferenceRequest {
    let messages = vec![ToolMessage::User { content:"read the selected source".into() },
        ToolMessage::Assistant { content:String::new(), tool_calls:vec![ToolCall {
            id:"call_123".into(),name:"read_source".into(),arguments:json!({"path":"notes.txt"}) }] },
        ToolMessage::Tool { tool_call_id:"call_123".into(),name:"read_source".into(),content:"source contents".into() }];
    let base = InferenceRequest { operation_id:"tool-step".into(),binding_hash:"binding".into(),context_hash:"context".into(),
        actor_id:"producer".into(),input_hash:"input".into(),provider:ProviderConfig::OpenAi { model:"configured-model".into(),generation:1 },
        generation:Generation { max_output_tokens:32,temperature_milli:0 },messages:tool_base_messages(&messages),
        max_input_tokens:256,expires_ms:super::super::request::now_ms()+5000,credential:None,cancelled:None };
    ToolInferenceRequest { base,messages,tools:vec![ToolDefinition { name:"read_source".into(),description:"read".into(),
        parameters:json!({"type":"object","properties":{"path":{"type":"string"}},"required":["path"]}) }] }
}

fn observation(input: (&ToolInferenceRequest, Value)) -> ModelObservation {
    let (request, response) = input;
    let bytes = serde_json::to_vec(&response).unwrap();
    let mut facts = super::super::wire::facts(&request.base.provider, 200, &bytes);
    let (text, finish) = super::super::wire::decode(&request.base.provider, &bytes, &mut facts).unwrap();
    let mut identity = Identity::capture(&request.base).unwrap();
    identity.request_hash = super::super::tool_request_hash(request).unwrap();
    ModelObservation::from_response(identity, (facts,text,finish,bytes), 1).unwrap()
}

fn response(arguments: Value) -> Value {
    json!({"choices":[{"message":{"role":"assistant","content":null,
        "tool_calls":[{"id":"call_new","type":"function","function":{"name":"read_source","arguments":arguments}}]},
        "finish_reason":"tool_calls"}],"usage":{"prompt_tokens":11,"completion_tokens":9,"total_tokens":20}})
}

#[test]
fn openai_wire_uses_function_schema_json_argument_strings_and_exact_result_ids() {
    let request = request();
    super::super::validate_tool_request(&request).unwrap();
    let body = body(&request).unwrap();
    assert_eq!(body["messages"][1]["tool_calls"][0]["id"], "call_123");
    assert_eq!(body["messages"][1]["tool_calls"][0]["function"]["arguments"], r#"{"path":"notes.txt"}"#);
    assert_eq!(body["messages"][2], json!({"role":"tool","tool_call_id":"call_123","content":"source contents"}));
    assert_eq!(body["max_completion_tokens"], 32);
    assert_eq!(body["tools"][0]["function"]["name"], "read_source");
}

#[test]
fn openai_parser_returns_native_ids_and_object_arguments_only() {
    let request = request();
    let observation = observation((&request,response(json!(r#"{"path":"notes.txt"}"#))));
    let (calls, finish) = decode(&request,&observation).unwrap();
    assert_eq!(finish,Finish::ToolRequested);
    assert_eq!(calls[0], ToolCall { id:"call_new".into(),name:"read_source".into(),arguments:json!({"path":"notes.txt"}) });
    assert_eq!(observation.usage().unwrap().total_tokens, Some(20));
}

#[test]
fn openai_malformed_arguments_missing_ids_and_inconsistent_finish_are_not_executable() {
    let request = request();
    for arguments in [json!("{"),json!("null"),json!({"path":"not a JSON string"})] {
        let native = observation((&request,response(arguments)));
        assert!(decode(&request,&native).is_err());
    }
    let mut missing_id = response(json!("{}"));
    missing_id["choices"][0]["message"]["tool_calls"][0].as_object_mut().unwrap().remove("id");
    assert!(decode(&request,&observation((&request,missing_id))).is_err());
    let mut inconsistent = response(json!("{}"));
    inconsistent["choices"][0]["finish_reason"] = json!("stop");
    assert_eq!(decode(&request,&observation((&request,inconsistent))).unwrap().1,Finish::Incomplete);
}

#[test]
fn structured_results_schema_and_provider_generation_all_change_effective_hash() {
    let original = request();
    let hash = super::super::tool_request_hash(&original).unwrap();
    let mut changed = original.clone();
    if let ToolMessage::Tool { content,.. } = &mut changed.messages[2] { content.push('x'); }
    assert_ne!(super::super::tool_request_hash(&changed).unwrap(),hash);
    changed = original.clone();
    changed.tools[0].parameters["properties"]["path"]["description"] = json!("changed schema");
    assert_ne!(super::super::tool_request_hash(&changed).unwrap(),hash);
    changed = original;
    if let ProviderConfig::OpenAi { generation,.. } = &mut changed.base.provider { *generation+=1; }
    assert_ne!(super::super::tool_request_hash(&changed).unwrap(),hash);
}

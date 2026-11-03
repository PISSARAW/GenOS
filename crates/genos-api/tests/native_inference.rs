mod native_inference_fixture;
use native_inference_fixture::{Reply, Server, completion, request};
use genos_api::native_inference::{self as api, Credential, Finish, ProviderConfig};
use serde_json::{Value, json};
use std::sync::{Arc, atomic::AtomicBool};

#[test]
fn explicit_ollama_text_and_usage_come_from_one_actual_http_response() {
    let reply = Reply::json(completion("texte renvoyé par le serveur HTTP de test"));
    let original_bytes = reply.bytes.clone();
    let server = Server::start(reply);
    let request = request(server.address);
    let observation = api::execute(&request).unwrap();
    assert_eq!(observation.text(), "texte renvoyé par le serveur HTTP de test");
    assert_eq!(observation.finish(), Finish::Complete);
    assert_eq!(observation.usage().unwrap().input_tokens, 19);
    assert_eq!(observation.usage().unwrap().output_tokens, 7);
    assert_eq!(observation.usage().unwrap().total_tokens, None);
    assert_eq!(observation.operation_id(), "generate");
    assert_eq!(observation.request_hash(), api::request_hash(&request).unwrap());
    assert_eq!(observation.response_body(), original_bytes);
    observation.assert_request(&request).unwrap();
    let calls = server.requests();
    assert_eq!(calls.len(), 1);
    assert!(calls[0].starts_with("POST /api/chat HTTP/1.1"));
    let body: Value = serde_json::from_str(calls[0].split_once("\r\n\r\n").unwrap().1).unwrap();
    assert_eq!(body["model"], "transport-fixture-model");
    assert_eq!(body["stream"], false);
    assert_eq!(body["options"]["num_predict"], 64);
    assert!(body.get("binding_hash").is_none());
}

#[test]
fn immutable_observation_is_bound_to_all_request_metadata_and_parameters() {
    let server = Server::start(Reply::json(completion("received")));
    let original = request(server.address);
    let observation = api::execute(&original).unwrap();
    let mut changed = original.clone();
    changed.context_hash = "different-context".into();
    assert!(observation.assert_request(&changed).is_err());
    changed = original.clone();
    changed.generation.max_output_tokens += 1;
    assert!(observation.assert_request(&changed).is_err());
    changed = original.clone();
    changed.provider = ProviderConfig::Ollama { address: server.address, model: "other-model".into(), generation: 2 };
    assert!(observation.assert_request(&changed).is_err());
    assert_eq!(observation.clone().receipt_hash(), observation.receipt_hash());
}

#[test]
fn descriptor_never_serializes_credentials_or_cancel_state() {
    let server = Server::start(Reply::json(completion("unused")));
    let mut request = request(server.address);
    let expected = api::request_hash(&request).unwrap();
    request.credential = Some(Credential::new("secret-must-not-be-persisted".into()).unwrap());
    request.cancelled = Some(Arc::new(AtomicBool::new(true)));
    assert_eq!(api::request_hash(&request).unwrap(), expected);
    let public = api::request_descriptor(&request).to_string();
    assert!(!public.contains("secret-must-not-be-persisted"));
    assert!(!public.contains("credential"));
    assert!(!public.contains("cancelled"));
    assert!(!format!("{:?}", request.credential).contains("secret-must-not-be-persisted"));
}

#[test]
fn missing_provider_metrics_remain_unknown_and_are_never_chars_divided_by_four() {
    let mut value = completion("a long response without any provider usage measurement");
    value.as_object_mut().unwrap().remove("prompt_eval_count");
    value.as_object_mut().unwrap().remove("eval_count");
    let server = Server::start(Reply::json(value));
    let observation = api::execute(&request(server.address)).unwrap();
    assert!(observation.usage().is_none());
    assert_eq!(observation.observed_input_tokens(), None);
    assert_eq!(observation.observed_output_tokens(), None);
}

#[test]
fn truncation_refusal_and_tools_do_not_become_complete_text() {
    for (patch, expected) in [(json!({"done_reason":"length"}), Finish::Truncated),
        (json!({"message":{"role":"assistant","content":"","refusal":"policy refusal"}}), Finish::Refused),
        (json!({"message":{"role":"assistant","content":"","tool_calls":[{"function":{"name":"not-executed"}}]}}), Finish::ToolRequested)] {
        let mut value = completion("text");
        for (key, entry) in patch.as_object().unwrap() { value[key] = entry.clone(); }
        let server = Server::start(Reply::json(value));
        let observation = api::execute(&request(server.address)).unwrap();
        assert_eq!(observation.finish(), expected);
        assert_eq!(observation.usage().unwrap().output_tokens, 7);
    }
}

#[test]
fn provider_configuration_rejects_unknown_fields_and_non_loopback_routes() {
    assert!(serde_json::from_value::<ProviderConfig>(json!({"kind":"ollama","address":"127.0.0.1:11434",
        "model":"x","generation":1,"apiKey":"do-not-accept"})).is_err());
    let provider = ProviderConfig::Ollama { address: "192.0.2.1:11434".parse().unwrap(), model: "x".into(), generation: 1 };
    assert!(api::validate_provider(&provider).is_err());
}

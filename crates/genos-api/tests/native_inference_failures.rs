mod native_inference_fixture;
use native_inference_fixture::{Reply, Server, completion, now_ms, request};
use genos_api::native_inference::{self as api, FailurePhase, ProviderConfig};
use serde_json::json;
use std::sync::{Arc, atomic::AtomicBool};

#[test]
fn an_observed_http_error_preserves_body_hash_usage_and_request_identity() {
    let value = json!({"error":"provider rejected generation","prompt_eval_count":23,"eval_count":4});
    let mut reply = Reply::json(value);
    reply.status = 500;
    let expected_body = reply.bytes.clone();
    let server = Server::start(reply);
    let request = request(server.address);
    let failure = api::execute(&request).unwrap_err();
    assert_eq!(failure.phase(), FailurePhase::ObservedHttpFailure);
    assert_eq!(failure.http_status(), Some(500));
    assert_eq!(failure.response_body(), Some(expected_body.as_slice()));
    assert_eq!(failure.usage().unwrap().input_tokens, 23);
    assert_eq!(failure.usage().unwrap().output_tokens, 4);
    failure.assert_request(&request).unwrap();
    assert!(failure.elapsed_ms() > 0);
    assert_eq!(server.requests().len(), 1);
}

#[test]
fn redirect_is_an_observed_failure_and_does_not_send_a_second_request() {
    let target = Server::start(Reply::json(completion("must never be requested")));
    let mut reply = Reply::json(json!({"redirect":"not followed"}));
    reply.status = 307;
    reply.headers.push(("Location".into(), format!("http://{}/api/chat", target.address)));
    let redirect = Server::start(reply);
    let failure = api::execute(&request(redirect.address)).unwrap_err();
    assert_eq!(failure.phase(), FailurePhase::ObservedHttpFailure);
    assert_eq!(failure.http_status(), Some(307));
    assert_eq!(redirect.requests().len(), 1);
    assert!(target.requests().is_empty());
}

#[test]
fn lost_reply_and_timeout_keep_unknown_usage_and_never_retry() {
    let mut reply = Reply::json(completion("lost"));
    reply.disconnect = true;
    let server = Server::start(reply);
    let failure = api::execute(&request(server.address)).unwrap_err();
    assert_eq!(failure.phase(), FailurePhase::OutcomeUnknown);
    assert!(failure.usage().is_none());
    assert_eq!(server.requests().len(), 1);
    let mut reply = Reply::json(completion("late"));
    reply.delay_ms = 600;
    let server = Server::start(reply);
    let mut request = request(server.address);
    request.expires_ms = now_ms() + 300;
    let failure = api::execute(&request).unwrap_err();
    assert_eq!(failure.phase(), FailurePhase::OutcomeUnknown);
    assert!(failure.usage().is_none());
    assert_eq!(server.requests().len(), 1);
}

#[test]
fn cancellation_after_dispatch_preserves_observed_response_without_claiming_remote_cancellation() {
    let mut reply = Reply::json(completion("completed remotely after local cancellation"));
    let cancelled = Arc::new(AtomicBool::new(false));
    reply.cancel_on_receive = Some(cancelled.clone());
    let server = Server::start(reply);
    let mut request = request(server.address);
    request.cancelled = Some(cancelled.clone());
    let failure = api::execute(&request).unwrap_err();
    assert_eq!(failure.phase(), FailurePhase::OutcomeUnknown);
    assert_eq!(failure.usage().unwrap().input_tokens, 19);
    assert_eq!(failure.http_status(), Some(200));
    assert_eq!(server.requests().len(), 1);
}

#[test]
fn malformed_response_preserves_partial_usage_and_cannot_become_a_completion() {
    let server = Server::start(Reply::json(json!({"message":{"role":"assistant","content":"text"},
        "done":true,"done_reason":"stop","prompt_eval_count":11,"eval_count":-1})));
    let failure = api::execute(&request(server.address)).unwrap_err();
    assert_eq!(failure.phase(), FailurePhase::ObservedHttpFailure);
    assert!(failure.usage().is_none());
    assert_eq!(failure.observed_input_tokens(), Some(11));
    assert_eq!(failure.observed_output_tokens(), None);
}

#[test]
fn preflight_refuses_missing_credentials_or_cancellation_without_sending() {
    let server = Server::start(Reply::json(completion("must not be requested")));
    let mut request = request(server.address);
    request.cancelled = Some(Arc::new(AtomicBool::new(true)));
    assert_eq!(api::execute(&request).unwrap_err().phase(), FailurePhase::BeforeDispatch);
    request.cancelled = None;
    request.provider = ProviderConfig::OpenAi { model: "explicit-operator-model".into(), generation: 1 };
    assert_eq!(api::execute(&request).unwrap_err().phase(), FailurePhase::BeforeDispatch);
    assert!(server.requests().is_empty());
}

#[test]
fn oversized_response_is_bounded_unknown_and_does_not_invent_usage() {
    let mut reply = Reply::json(json!({}));
    reply.bytes = vec![b'x'; 2 * 1024 * 1024 + 1];
    let server = Server::start(reply);
    let failure = api::execute(&request(server.address)).unwrap_err();
    assert_eq!(failure.phase(), FailurePhase::OutcomeUnknown);
    assert_eq!(failure.response_body().unwrap().len(), 2 * 1024 * 1024);
    assert!(failure.usage().is_none());
    assert_eq!(server.requests().len(), 1);
}

#[test]
fn unsupported_content_encoding_is_not_transparently_transformed_into_an_observation() {
    let mut reply = Reply::json(completion("original entity bytes"));
    reply.headers.push(("Content-Encoding".into(), "gzip".into()));
    let bytes = reply.bytes.clone();
    let server = Server::start(reply);
    let failure = api::execute(&request(server.address)).unwrap_err();
    assert_eq!(failure.phase(), FailurePhase::ObservedHttpFailure);
    assert_eq!(failure.response_body(), Some(bytes.as_slice()));
    assert!(server.requests()[0].to_ascii_lowercase().contains("accept-encoding: identity"));
}

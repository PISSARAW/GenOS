use super::{InferenceRequest, ModelObservation, InferenceFailure, FailurePhase, ProviderConfig};
use super::request::{now_ms, validate_request};
use super::observation::Identity;
use super::wire;
use reqwest::blocking::{Client, Response};
use std::io::Read;
use std::time::{Duration, Instant};

const MAX_RESPONSE: usize = 2 * 1024 * 1024;

pub fn execute(request: &InferenceRequest) -> Result<ModelObservation, InferenceFailure> {
    let identity = Identity::capture(request).map_err(|error| InferenceFailure::before(request, error))?;
    execute_bound((request, identity), body(request))
}

pub(super) fn execute_bound(input: (&InferenceRequest, Identity), body: serde_json::Value) -> Result<ModelObservation, InferenceFailure> {
    let started = Instant::now();
    execute_inner(input, body).and_then(|(identity, facts, text, finish, bytes)| {
        ModelObservation::from_response(identity.clone(), (facts, text, finish, bytes), elapsed(started))
            .map_err(|error| InferenceFailure::dispatched(identity, FailurePhase::ObservedHttpFailure, error))
    }).map_err(|error| error.with_elapsed(elapsed(started)))
}

fn execute_inner(input: (&InferenceRequest, Identity), body: serde_json::Value) -> Result<DispatchResult, InferenceFailure> {
    let (request, identity) = input;
    let before = |error| InferenceFailure::dispatched(identity.clone(), FailurePhase::BeforeDispatch, error);
    request.validate().map_err(before)?;
    let client = client(request).map_err(before)?;
    let mut prepared = prepared((&client, request), body).map_err(before)?;
    validate_request(request).map_err(before)?;
    *prepared.timeout_mut() = Some(Duration::from_millis(remaining(request)
        .map_err(before)?));
    dispatch(&client, prepared, (request, identity))
}

fn client(request: &InferenceRequest) -> Result<Client, String> {
    let remaining = remaining(request)?;
    Client::builder().no_proxy().redirect(reqwest::redirect::Policy::none())
        .retry(reqwest::retry::never()).http1_only()
        .no_gzip().no_brotli().no_deflate().no_zstd()
        .connect_timeout(Duration::from_millis(remaining.min(5000)))
        .timeout(Duration::from_millis(remaining)).build().map_err(|_| "NATIVE_LLM_CLIENT_BUILD_FAILED".into())
}

fn remaining(request: &InferenceRequest) -> Result<u64, String> {
    request.expires_ms.checked_sub(now_ms()).filter(|remaining| *remaining > 0)
        .ok_or_else(|| "NATIVE_LLM_DEADLINE_EXPIRED".into())
}

fn prepared(input: (&Client, &InferenceRequest), body: serde_json::Value) -> Result<reqwest::blocking::Request, String> {
    let (client, request) = input;
    let encoded = serde_json::to_vec(&body).map_err(|error| error.to_string())?;
    if encoded.len() > 262144 { return Err("NATIVE_LLM_REQUEST_TOO_LARGE".into()); }
    let mut builder = client.post(request.provider.url()?).timeout(Duration::from_millis(remaining(request)?))
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .header(reqwest::header::ACCEPT_ENCODING, "identity").body(encoded);
    if let Some(credential) = &request.credential { builder = builder.header(reqwest::header::AUTHORIZATION, credential.bearer.clone()); }
    builder.build().map_err(|_| "NATIVE_LLM_REQUEST_BUILD_FAILED".into())
}

pub(super) fn body(request: &InferenceRequest) -> serde_json::Value {
    let temperature = f64::from(request.generation.temperature_milli) / 1000.0;
    match &request.provider {
        ProviderConfig::Ollama { model, .. } => serde_json::json!({"model":model,"messages":request.messages,"stream":false,
            "options":{"num_predict":request.generation.max_output_tokens,"temperature":temperature}}),
        ProviderConfig::OpenAi { model, .. } => serde_json::json!({"model":model,"messages":request.messages,"stream":false,
            "max_completion_tokens":request.generation.max_output_tokens,"temperature":temperature}),
    }
}

type DispatchResult = (Identity, super::observation::ResponseFacts, String, super::Finish, Vec<u8>);

fn dispatch(client: &Client, prepared: reqwest::blocking::Request, input: (&InferenceRequest, Identity)) -> Result<DispatchResult, InferenceFailure> {
    let (request, identity) = input;
    let response = client.execute(prepared).map_err(|_| InferenceFailure::dispatched(identity.clone(),
        FailurePhase::OutcomeUnknown, "NATIVE_LLM_TRANSPORT_OUTCOME_UNKNOWN".into()))?;
    received(response, (request, identity))
}

fn received(mut response: Response, input: (&InferenceRequest, Identity)) -> Result<DispatchResult, InferenceFailure> {
    let (request, identity) = input;
    let status = response.status().as_u16();
    let unsupported_encoding = response.headers().get(reqwest::header::CONTENT_ENCODING)
        .is_some_and(|value| value.as_bytes() != b"identity");
    let provider_request_id = request_id(&response);
    let mut bytes = Vec::new();
    let read = response.by_ref().take((MAX_RESPONSE + 1) as u64).read_to_end(&mut bytes);
    let incomplete = read.is_err() || bytes.len() > MAX_RESPONSE;
    bytes.truncate(MAX_RESPONSE);
    let mut facts = wire::facts(&request.provider, status, &bytes);
    facts.provider_request_id = provider_request_id;
    if incomplete {
        return Err(InferenceFailure::dispatched(identity, FailurePhase::OutcomeUnknown,
            "NATIVE_LLM_RESPONSE_INCOMPLETE".into()).with_response(facts, bytes));
    }
    if unsupported_encoding {
        return Err(InferenceFailure::dispatched(identity, FailurePhase::ObservedHttpFailure,
            "NATIVE_LLM_UNSUPPORTED_CONTENT_ENCODING".into()).with_response(facts, bytes));
    }
    classify((request, identity), (facts, bytes))
}

fn classify(input: (&InferenceRequest, Identity), response: (super::observation::ResponseFacts, Vec<u8>)) -> Result<DispatchResult, InferenceFailure> {
    let (request, identity) = input;
    let (mut facts, bytes) = response;
    if request.is_cancelled() || remaining(request).is_err() {
        return Err(InferenceFailure::dispatched(identity, FailurePhase::OutcomeUnknown,
            "NATIVE_LLM_CANCELLED_OR_EXPIRED_AFTER_DISPATCH".into()).with_response(facts, bytes));
    }
    if !(200..300).contains(&facts.status) {
        return Err(InferenceFailure::dispatched(identity, FailurePhase::ObservedHttpFailure,
            "NATIVE_LLM_HTTP_FAILURE".into()).with_response(facts, bytes));
    }
    match wire::decode(&request.provider, &bytes, &mut facts) {
        Ok((text, finish)) => Ok((identity, facts, text, finish, bytes)),
        Err(error) => Err(InferenceFailure::dispatched(identity, FailurePhase::ObservedHttpFailure, error).with_response(facts, bytes)),
    }
}

fn request_id(response: &Response) -> Option<String> {
    response.headers().get("x-request-id").and_then(|value| value.to_str().ok())
        .filter(|value| value.len() <= 256).map(str::to_owned)
}

fn elapsed(started: Instant) -> u64 { u64::try_from(started.elapsed().as_millis()).unwrap_or(u64::MAX).max(1) }

use axum::{
    body::{to_bytes, Body},
    http::{HeaderMap, Request, StatusCode},
    Router,
};
use genos_api::{router_with_security, security::RateLimitConfig};
use genos_model::factory::ModelFactory;
use serde_json::{json, Value};
use std::{collections::HashMap, sync::Arc};
use tower::ServiceExt;

const TENANT_TOKENS: [(&str, &str); 2] = [
    ("acme", "token-0123456789abcdef"),
    ("globex", "token-fedcba9876543210"),
];

fn tenant_map(capacity: u32, refill_per_sec: u32) -> (HashMap<String, String>, RateLimitConfig) {
    let tenants = TENANT_TOKENS
        .iter()
        .map(|(tenant, token)| ((*tenant).to_owned(), (*token).to_owned()))
        .collect();
    (tenants, RateLimitConfig::new(capacity, refill_per_sec))
}

fn provider() -> Arc<dyn genos_model::LlmProvider> {
    Arc::from(ModelFactory::create("fake://api", None).expect("fake provider is always available"))
}

fn router() -> Router {
    let (tenants, rate_limit) = tenant_map(120, 30);
    router_with_security(provider(), tenants, rate_limit)
}

fn bench_router() -> Router {
    let (tenants, rate_limit) = tenant_map(100_000, 1);
    router_with_security(provider(), tenants, rate_limit)
}

fn valid_headers() -> HeaderMap {
    let mut headers = HeaderMap::new();
    headers.insert(
        "authorization",
        "Bearer token-0123456789abcdef".parse().unwrap(),
    );
    headers.insert("x-genos-tenant", "acme".parse().unwrap());
    headers
}

async fn post_chat(router: Router, headers: HeaderMap) -> (StatusCode, Value) {
    let mut builder = Request::builder()
        .method("POST")
        .uri("/v1/chat/completions")
        .header("content-type", "application/json");
    for (name, value) in headers.iter() {
        builder = builder.header(name, value);
    }
    let response = router
        .oneshot(
            builder
                .body(Body::from(
                    json!({ "messages": [{ "role": "user", "content": "hi" }] }).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    let status = response.status();
    let body = to_bytes(response.into_body(), 64 * 1024).await.unwrap();
    let value = if body.is_empty() {
        Value::Null
    } else {
        serde_json::from_slice(&body).unwrap_or(Value::Null)
    };
    (status, value)
}

#[tokio::test]
async fn health_stays_public() {
    let response = router()
        .oneshot(
            Request::builder()
                .uri("/health")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
}

#[tokio::test]
async fn missing_credentials_are_rejected() {
    let (status, body) = post_chat(router(), HeaderMap::new()).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    assert_eq!(body["error"]["type"], "authentication_error");
}

#[tokio::test]
async fn invalid_secret_is_rejected() {
    let mut headers = valid_headers();
    headers.insert(
        "authorization",
        "Bearer token-ffffffffffffffff".parse().unwrap(),
    );
    let (status, _) = post_chat(router(), headers).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn unknown_tenant_is_rejected() {
    let mut headers = valid_headers();
    headers.insert("x-genos-tenant", "evil".parse().unwrap());
    let (status, _) = post_chat(router(), headers).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn malformed_token_is_rejected() {
    let mut headers = valid_headers();
    headers.insert("authorization", "Bearer short".parse().unwrap());
    let (status, body) = post_chat(router(), headers).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    assert_eq!(body["error"]["message"], "malformed credentials");
}

#[tokio::test]
async fn valid_credentials_pass_through() {
    let (status, body) = post_chat(router(), valid_headers()).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["object"], "chat.completion");
}

#[tokio::test]
async fn rate_limited_client_gets_429_and_retry_after() {
    let (tenants, rate_limit) = tenant_map(2, 1);
    let router = router_with_security(provider(), tenants, rate_limit);
    let mut last = (StatusCode::OK, Value::Null);
    for _ in 0..3 {
        last = post_chat(router.clone(), valid_headers()).await;
    }
    assert_eq!(last.0, StatusCode::TOO_MANY_REQUESTS);
    assert_eq!(last.1["error"]["type"], "rate_limit_error");
}

#[tokio::test]
async fn other_tenants_keep_their_own_budget() {
    let (tenants, rate_limit) = tenant_map(1, 1);
    let router = router_with_security(provider(), tenants, rate_limit);
    let (first_status, _) = post_chat(router.clone(), valid_headers()).await;
    let (second_status, _) = post_chat(router.clone(), valid_headers()).await;
    let mut globex = HeaderMap::new();
    globex.insert(
        "authorization",
        "Bearer token-fedcba9876543210".parse().unwrap(),
    );
    globex.insert("x-genos-tenant", "globex".parse().unwrap());
    let (globex_status, _) = post_chat(router, globex).await;
    assert_eq!(first_status, StatusCode::OK);
    assert_eq!(second_status, StatusCode::TOO_MANY_REQUESTS);
    assert_eq!(globex_status, StatusCode::OK);
}

/// Constraint: mean end-to-end latency over 10 000 authenticated requests
/// must stay under 1 ms.
#[tokio::test]
async fn ten_thousand_requests_average_under_one_millisecond() {
    let router = bench_router();
    let start = std::time::Instant::now();
    for _ in 0..10_000 {
        let (status, _) = post_chat(router.clone(), valid_headers()).await;
        assert_eq!(status, StatusCode::OK);
    }
    let per_request_us = start.elapsed().as_micros() as f64 / 10_000.0;
    assert!(
        per_request_us < 1_000.0,
        "mean latency {per_request_us}us exceeds the 1ms budget"
    );
}

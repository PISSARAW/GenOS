//! Authentication token validation and rate limiting middleware.
//!
//! Security properties:
//! - Tokens are compared through SHA-256 digests with a constant-time
//!   equality routine, so no wall-clock observable depends on the secret
//!   bytes of a presented credential.
//! - All inputs are strictly validated (length bounds + charset) before
//!   any cryptographic work and never interpolated into queries, paths or
//!   shells, which rules out injection vectors.
//! - The rate limiter is a fixed-capacity integer/f64-free token bucket
//!   keyed by an already-hashed client identifier, bounding memory usage
//!   even under unauthenticated flooding.

use axum::{
    extract::{Request, State},
    http::{header::AUTHORIZATION, HeaderMap, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    time::{SystemTime, UNIX_EPOCH},
};

/// Minimum accepted bearer token length in bytes.
pub const TOKEN_MIN_LEN: usize = 16;
/// Maximum accepted bearer token length in bytes.
pub const TOKEN_MAX_LEN: usize = 256;
/// Maximum accepted tenant header length in bytes.
pub const TENANT_MAX_LEN: usize = 128;
/// Hard cap on tracked rate-limit buckets; protects against memory
/// exhaustion from unauthenticated clients forging unique identities.
pub const MAX_TRACKED_CLIENTS: usize = 10_000;

const BEARER_PREFIX: &str = "Bearer ";
const TENANT_HEADER: &str = "x-genos-tenant";

/// SHA-256 digest of a credential.
pub type TokenHash = [u8; 32];

/// Constant-time byte-slice equality: the number of executed operations
/// depends only on the lengths of the slices, never on their contents.
pub fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (byte_a, byte_b) in a.iter().zip(b.iter()) {
        diff |= byte_a ^ byte_b;
    }
    diff == 0
}

/// Hashes a raw credential into a fixed-size digest. Every input of the
/// same length costs the same amount of work.
pub fn hash_token(token: &str) -> TokenHash {
    let mut hasher = Sha256::new();
    hasher.update(token.as_bytes());
    hasher.finalize().into()
}

/// Strict credential validation. Rejects empty, oversized or
/// non-conformant values before they can reach any sensitive code path.
fn is_valid_credential(value: &str, min_len: usize, max_len: usize) -> bool {
    let len = value.len();
    if len < min_len || len > max_len {
        return false;
    }
    value.bytes().all(|byte| {
        byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b'~' | b'/' | b'+' | b'=')
    })
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum AuthError {
    MissingCredentials,
    MalformedCredentials,
    InvalidCredentials,
}

/// Store of tenant credentials, kept as SHA-256 digests so plaintext tokens
/// never live in memory longer than the caller needs them to.
#[derive(Clone, Default)]
pub struct TokenStore {
    credentials: Vec<(TokenHash, String)>,
}

impl TokenStore {
    pub fn new() -> Self {
        Self::default()
    }

    /// Registers a tenant credential. Plaintext is digested immediately.
    pub fn insert(&mut self, tenant: &str, token: &str) {
        self.credentials.push((hash_token(token), tenant.to_owned()));
    }

    pub fn is_empty(&self) -> bool {
        self.credentials.is_empty()
    }

    /// Authenticates a `(tenant, bearer)` pair. The presented token is
    /// hashed once and compared against every stored digest using the
    /// constant-time routine, so the total work is identical whether the
    /// match happens on the first or the last entry.
    fn authenticate(&self, tenant: Option<&str>, bearer: Option<&str>) -> Result<&str, AuthError> {
        let (tenant, bearer) = match (tenant, bearer) {
            (Some(tenant), Some(bearer)) => (tenant, bearer),
            _ => return Err(AuthError::MissingCredentials),
        };
        if !is_valid_credential(tenant, 1, TENANT_MAX_LEN)
            || !is_valid_credential(bearer, TOKEN_MIN_LEN, TOKEN_MAX_LEN)
        {
            return Err(AuthError::MalformedCredentials);
        }
        let digest = hash_token(bearer);
        let mut matched: Option<&str> = None;
        for (stored_digest, stored_tenant) in &self.credentials {
            let hit = constant_time_eq(&digest, stored_digest);
            if hit {
                matched = Some(stored_tenant);
            }
        }
        matched.ok_or(AuthError::InvalidCredentials)
    }
}

/// Token bucket parameters: `capacity` bursts, `refill_per_sec` sustained.
#[derive(Clone, Copy, Debug)]
pub struct RateLimitConfig {
    pub capacity: f64,
    pub refill_per_sec: f64,
}

impl RateLimitConfig {
    /// Validates the configuration so the bucket math can never divide by
    /// zero or produce negative budgets.
    pub fn new(capacity: u32, refill_per_sec: u32) -> Self {
        Self {
            capacity: capacity.max(1) as f64,
            refill_per_sec: refill_per_sec.max(1) as f64,
        }
    }
}

#[derive(Clone, Copy)]
struct Bucket {
    tokens: f64,
    updated_ms: u64,
}

/// Outcome of one rate-limit check.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct RateDecision {
    pub allowed: bool,
    pub remaining: u32,
    pub retry_after_ms: u64,
}

/// Fixed-memory sliding token bucket keyed by hashed client identity.
/// Time is injected (`now_ms`) making every branch deterministically
/// testable without sleeping.
pub struct RateLimiter {
    config: RateLimitConfig,
    buckets: HashMap<u64, Bucket>,
}

impl RateLimiter {
    pub fn new(config: RateLimitConfig) -> Self {
        Self {
            config,
            buckets: HashMap::new(),
        }
    }

    fn retry_after_ms(&self, tokens: f64) -> u64 {
        let deficit = self.config.capacity - tokens;
        ((deficit / self.config.refill_per_sec) * 1000.0).ceil() as u64
    }

    fn purge_stale(&mut self) {
        self.buckets
            .retain(|_, bucket| bucket.tokens < self.config.capacity);
    }

    /// Consumes one token for `key` at logical time `now_ms`.
    pub fn check(&mut self, key: u64, now_ms: u64) -> RateDecision {
        if self.buckets.len() >= MAX_TRACKED_CLIENTS {
            self.purge_stale();
            if self.buckets.len() >= MAX_TRACKED_CLIENTS {
                return RateDecision {
                    allowed: false,
                    remaining: 0,
                    retry_after_ms: 1000,
                };
            }
        }
        let config = self.config;
        let bucket = self.buckets.entry(key).or_insert(Bucket {
            tokens: config.capacity,
            updated_ms: now_ms,
        });
        let elapsed_sec = now_ms.saturating_sub(bucket.updated_ms) as f64 / 1000.0;
        bucket.tokens = (bucket.tokens + elapsed_sec * config.refill_per_sec).min(config.capacity);
        bucket.updated_ms = now_ms;
        if bucket.tokens >= 1.0 {
            bucket.tokens -= 1.0;
            RateDecision {
                allowed: true,
                remaining: bucket.tokens as u32,
                retry_after_ms: 0,
            }
        } else {
            RateDecision {
                allowed: false,
                remaining: 0,
                retry_after_ms: self.retry_after_ms(bucket.tokens),
            }
        }
    }

    pub fn len(&self) -> usize {
        self.buckets.len()
    }

    pub fn is_empty(&self) -> bool {
        self.buckets.is_empty()
    }
}

/// Tenant identity attached to authenticated requests.
#[derive(Clone, Debug)]
pub struct AuthenticatedTenant(pub String);

/// Shared security state threaded through the axum middleware.
#[derive(Clone)]
pub struct SecurityState {
    tokens: Arc<TokenStore>,
    limiter: Arc<Mutex<RateLimiter>>,
}

impl SecurityState {
    pub fn new(credentials: impl IntoIterator<Item = (String, String)>, config: RateLimitConfig) -> Self {
        let mut store = TokenStore::new();
        for (tenant, token) in credentials {
            store.insert(&tenant, &token);
        }
        Self {
            tokens: Arc::new(store),
            limiter: Arc::new(Mutex::new(RateLimiter::new(config))),
        }
    }

    #[cfg(test)]
    fn tracked_clients(&self) -> usize {
        self.limiter.lock().expect("rate limiter mutex").len()
    }
}

fn client_key(authorization: Option<&str>, tenant: Option<&str>) -> u64 {
    let mut hasher = Sha256::new();
    hasher.update(authorization.unwrap_or("").as_bytes());
    hasher.update([0]);
    hasher.update(tenant.unwrap_or("").as_bytes());
    hasher.finalize()[..8]
        .try_into()
        .expect("8-byte slice is always a valid u64")
}

fn error_response(status: StatusCode, message: &'static str, error_type: &'static str) -> Response {
    (
        status,
        Json(json!({ "error": { "message": message, "type": error_type } })),
    )
        .into_response()
}

fn too_many_requests(retry_after_ms: u64) -> Response {
    let mut response = error_response(
        StatusCode::TOO_MANY_REQUESTS,
        "rate limit exceeded",
        "rate_limit_error",
    );
    if let Ok(value) = HeaderValue::from_str(&retry_after_ms.to_string()) {
        response.headers_mut().insert("retry-after", value);
    }
    response
}

fn extract_credentials(headers: &HeaderMap) -> (Option<&str>, Option<&str>) {
    let authorization = headers
        .get(AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix(BEARER_PREFIX));
    let tenant = headers
        .get(TENANT_HEADER)
        .and_then(|value| value.to_str().ok());
    (tenant, authorization)
}

/// Axum middleware: rate-limits first (brute-force protection), then
/// authenticates. Unprotected when no credentials are configured, matching
/// the historical behaviour of the API.
pub async fn middleware(
    State(state): State<SecurityState>,
    mut request: Request,
    next: Next,
) -> Response {
    let (tenant, bearer) = extract_credentials(request.headers());
    let key = client_key(bearer, tenant);
    let now_ms = now_unix_ms();
    let decision = {
        let mut limiter = state.limiter.lock().expect("rate limiter mutex");
        limiter.check(key, now_ms)
    };
    if !decision.allowed {
        return too_many_requests(decision.retry_after_ms);
    }
    if !state.tokens.is_empty() {
        let tenant = match state.tokens.authenticate(tenant, bearer) {
            Ok(tenant) => tenant,
            Err(AuthError::MissingCredentials | AuthError::InvalidCredentials) => {
                return error_response(
                    StatusCode::UNAUTHORIZED,
                    "invalid tenant credentials",
                    "authentication_error",
                )
            }
            Err(AuthError::MalformedCredentials) => {
                return error_response(
                    StatusCode::UNAUTHORIZED,
                    "malformed credentials",
                    "authentication_error",
                )
            }
        };
        request.extensions_mut().insert(AuthenticatedTenant(tenant.to_owned()));
    }
    next.run(request).await
}

fn now_unix_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn store_with_one() -> TokenStore {
        let mut store = TokenStore::new();
        store.insert("acme", "token-0123456789abcdef");
        store
    }

    #[test]
    fn constant_time_eq_matches_equal_slices() {
        assert!(constant_time_eq(b"abc", b"abc"));
    }

    #[test]
    fn constant_time_eq_rejects_different_content() {
        assert!(!constant_time_eq(b"abc", b"abd"));
    }

    #[test]
    fn constant_time_eq_rejects_different_lengths() {
        assert!(!constant_time_eq(b"abc", b"abcd"));
    }

    #[test]
    fn constant_time_eq_accepts_empty_slices() {
        assert!(constant_time_eq(b"", b""));
    }

    #[test]
    fn hash_token_is_deterministic_and_fixed_size() {
        assert_eq!(hash_token("a"), hash_token("a"));
        assert_ne!(hash_token("a"), hash_token("b"));
    }

    #[test]
    fn credentials_within_bounds_are_valid() {
        assert!(is_valid_credential("abcd", 2, 8));
    }

    #[test]
    fn credentials_below_minimum_are_invalid() {
        assert!(!is_valid_credential("a", 2, 8));
    }

    #[test]
    fn credentials_above_maximum_are_invalid() {
        assert!(!is_valid_credential("abcdefghi", 2, 8));
    }

    #[test]
    fn credentials_with_special_characters_are_invalid() {
        assert!(!is_valid_credential("abc';--", 2, 32));
    }

    #[test]
    fn credentials_allow_url_safe_punctuation() {
        assert!(is_valid_credential("a-b_c.d~e/f+g=h", 2, 32));
    }

    #[test]
    fn authenticate_accepts_valid_pair() {
        let store = store_with_one();
        assert_eq!(
            store.authenticate(Some("acme"), Some("token-0123456789abcdef")),
            Ok("acme")
        );
    }

    #[test]
    fn authenticate_rejects_missing_bearer() {
        assert_eq!(
            store_with_one().authenticate(Some("acme"), None),
            Err(AuthError::MissingCredentials)
        );
    }

    #[test]
    fn authenticate_rejects_missing_tenant() {
        assert_eq!(
            store_with_one().authenticate(None, Some("token-0123456789abcdef")),
            Err(AuthError::MissingCredentials)
        );
    }

    #[test]
    fn authenticate_rejects_oversized_token() {
        let long = "t".repeat(TOKEN_MAX_LEN + 1);
        assert_eq!(
            store_with_one().authenticate(Some("acme"), Some(&long)),
            Err(AuthError::MalformedCredentials)
        );
    }

    #[test]
    fn authenticate_rejects_oversized_tenant() {
        let long = "t".repeat(TENANT_MAX_LEN + 1);
        assert_eq!(
            store_with_one().authenticate(Some(&long), Some("token-0123456789abcdef")),
            Err(AuthError::MalformedCredentials)
        );
    }

    #[test]
    fn authenticate_rejects_wrong_secret_without_timing_shortcut() {
        assert_eq!(
            store_with_one().authenticate(Some("acme"), Some("token-ffffffffffffffff")),
            Err(AuthError::InvalidCredentials)
        );
    }

    #[test]
    fn authenticate_scans_all_entries_even_after_match() {
        let mut store = store_with_one();
        store.insert("other", "token-fedcba9876543210");
        assert_eq!(
            store.authenticate(Some("other"), Some("token-fedcba9876543210")),
            Ok("other")
        );
    }

    #[test]
    fn limiter_starts_empty() {
        let limiter = RateLimiter::new(RateLimitConfig::new(10, 10));
        assert!(limiter.is_empty());
        assert_eq!(limiter.len(), 0);
    }

    #[test]
    fn limiter_allows_up_to_capacity() {
        let mut limiter = RateLimiter::new(RateLimitConfig::new(3, 1));
        assert!(limiter.check(1, 0).allowed);
        assert!(limiter.check(1, 0).allowed);
        let third = limiter.check(1, 0);
        assert!(third.allowed);
        assert_eq!(third.remaining, 0);
    }

    #[test]
    fn limiter_blocks_past_capacity_with_retry_hint() {
        let mut limiter = RateLimiter::new(RateLimitConfig::new(2, 1));
        let _ = limiter.check(7, 0);
        let _ = limiter.check(7, 0);
        let denied = limiter.check(7, 0);
        assert!(!denied.allowed);
        assert_eq!(denied.remaining, 0);
        assert!(denied.retry_after_ms > 0);
    }

    #[test]
    fn limiter_refills_over_elapsed_time() {
        let mut limiter = RateLimiter::new(RateLimitConfig::new(1, 1));
        assert!(limiter.check(1, 0).allowed);
        assert!(!limiter.check(1, 0).allowed);
        assert!(limiter.check(1, 2000).allowed);
    }

    #[test]
    fn limiter_never_exceeds_capacity_on_refill() {
        let mut limiter = RateLimiter::new(RateLimitConfig::new(2, 100));
        let _ = limiter.check(1, 0);
        let decision = limiter.check(1, 60_000);
        assert!(decision.allowed);
        assert_eq!(decision.remaining, 1);
    }

    #[test]
    fn limiter_isolates_keys_independently() {
        let mut limiter = RateLimiter::new(RateLimitConfig::new(1, 1));
        assert!(limiter.check(1, 0).allowed);
        assert!(!limiter.check(1, 0).allowed);
        assert!(limiter.check(2, 0).allowed);
    }

    #[test]
    fn limiter_handles_clock_going_backwards() {
        let mut limiter = RateLimiter::new(RateLimitConfig::new(1, 1));
        assert!(limiter.check(1, 100).allowed);
        assert!(!limiter.check(1, 50).allowed);
    }

    #[test]
    fn limiter_purges_idle_buckets_at_capacity() {
        let mut limiter = RateLimiter::new(RateLimitConfig::new(1, 1));
        for key in 0..MAX_TRACKED_CLIENTS as u64 {
            assert!(limiter.check(key, 0).allowed);
        }
        assert!(limiter.check(MAX_TRACKED_CLIENTS as u64, 1_000).allowed);
        assert_eq!(limiter.len(), MAX_TRACKED_CLIENTS);
    }

    #[test]
    fn limiter_denies_when_all_buckets_are_active() {
        let mut limiter = RateLimiter::new(RateLimitConfig::new(1, 1));
        for key in 0..MAX_TRACKED_CLIENTS as u64 {
            assert!(limiter.check(key, 0).allowed);
        }
        let overflow = limiter.check(MAX_TRACKED_CLIENTS as u64, 0);
        assert!(!overflow.allowed);
        assert_eq!(overflow.retry_after_ms, 1000);
    }

    #[test]
    fn config_clamps_zero_values() {
        let config = RateLimitConfig::new(0, 0);
        assert!(config.capacity >= 1.0);
        assert!(config.refill_per_sec >= 1.0);
    }

    #[test]
    fn client_key_depends_on_both_inputs() {
        assert_ne!(client_key(Some("a"), Some("b")), client_key(Some("a"), None));
        assert_eq!(client_key(Some("a"), Some("b")), client_key(Some("a"), Some("b")));
    }

    #[test]
    fn security_state_tracks_buckets() {
        let state = SecurityState::new(Vec::new(), RateLimitConfig::new(1, 1));
        assert_eq!(state.tracked_clients(), 0);
    }

    #[tokio::test]
    async fn middleware_passes_when_auth_disabled() {
        use tower::{Service, ServiceExt};
        let state = SecurityState::new(Vec::new(), RateLimitConfig::new(10, 10));
        let mut service =
            axum::middleware::from_fn_with_state(state, middleware).service(axum::routing::get(|| async { "ok" }));
        let request = axum::http::Request::builder()
            .uri("/anything")
            .body(axum::body::Body::empty())
            .unwrap();
        let response = service.ready().await.unwrap().call(request).await.unwrap();
        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn middleware_rejects_unauthenticated_requests() {
        use tower::{Service, ServiceExt};
        let state = SecurityState::new(
            vec![("acme".to_owned(), "token-0123456789abcdef".to_owned())],
            RateLimitConfig::new(10, 10),
        );
        let mut service =
            axum::middleware::from_fn_with_state(state, middleware).service(axum::routing::get(|| async { "ok" }));
        let request = axum::http::Request::builder()
            .body(axum::body::Body::empty())
            .unwrap();
        let response = service.ready().await.unwrap().call(request).await.unwrap();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn middleware_returns_429_with_retry_after_header() {
        use tower::{Service, ServiceExt};
        let state = SecurityState::new(Vec::new(), RateLimitConfig::new(1, 1));
        let mut service =
            axum::middleware::from_fn_with_state(state, middleware).service(axum::routing::get(|| async { "ok" }));
        for _ in 0..2 {
            let request = axum::http::Request::builder()
                .body(axum::body::Body::empty())
                .unwrap();
            service.ready().await.unwrap().call(request).await.unwrap();
        }
        let request = axum::http::Request::builder()
            .header(AUTHORIZATION, format!("{BEARER_PREFIX}token-0123456789abcdef"))
            .body(axum::body::Body::empty())
            .unwrap();
        let response = service.ready().await.unwrap().call(request).await.unwrap();
        assert_eq!(response.status(), StatusCode::TOO_MANY_REQUESTS);
        assert!(response.headers().contains_key("retry-after"));
    }

    #[tokio::test]
    async fn middleware_attaches_tenant_extension_on_success() {
        use tower::{Service, ServiceExt};
        let state = SecurityState::new(
            vec![("acme".to_owned(), "token-0123456789abcdef".to_owned())],
            RateLimitConfig::new(10, 10),
        );
        let mut service = axum::middleware::from_fn_with_state(state.clone(), middleware)
            .service(axum::routing::get(
                |axum::Extension(tenant): axum::Extension<AuthenticatedTenant>| async move { tenant.0 },
            ));
        let request = axum::http::Request::builder()
            .header(AUTHORIZATION, format!("{BEARER_PREFIX}token-0123456789abcdef"))
            .header(TENANT_HEADER, "acme")
            .body(axum::body::Body::empty())
            .unwrap();
        let response = service.ready().await.unwrap().call(request).await.unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        drop(state);
    }
}

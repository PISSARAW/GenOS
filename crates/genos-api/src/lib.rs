pub mod security;
pub mod server;
pub mod types;

pub use security::{RateLimiter, TenantAuth};
pub use server::{handle_http_request, start_server};
pub use types::{
    ChatChoice, ChatCompletionRequest, ChatCompletionResponse, ChatMessage, ChatOutputMessage,
    ChatUsage, HealthResponse,
};

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    #[test]
    fn test_chat_message_serialization() {
        let msg = ChatMessage {
            role: "user".into(),
            content: "Hello GenOS".into(),
            tool_call_id: None,
        };
        let ser = serde_json::to_string(&msg).unwrap();
        assert!(ser.contains("Hello GenOS"));
    }

    #[test]
    fn test_rate_limiter() {
        let mut limiter = RateLimiter::new(10, 2);
        assert!(limiter.try_acquire(5));
        assert!(limiter.try_acquire(5));
        assert!(!limiter.try_acquire(1));
        limiter.refill(3);
        assert!(limiter.try_acquire(5));
    }

    #[test]
    fn test_tenant_auth() {
        let mut auth = TenantAuth::new();
        auth.register_tenant("tenant_alpha", "sk_live_123");
        assert_eq!(auth.verify_key("sk_live_123"), Some("tenant_alpha"));
        assert_eq!(auth.verify_key("sk_invalid"), None);
    }

    #[test]
    fn test_server_health_probe() {
        let auth = TenantAuth::new();
        let limiter = Mutex::new(RateLimiter::new(10, 1));
        let req = "GET /healthz HTTP/1.1\r\nHost: localhost\r\n\r\n";
        let (status, _, body) = handle_http_request(req, &auth, &limiter);
        assert_eq!(status, 200);
        assert!(body.contains("healthy"));
    }

    #[test]
    fn test_server_models_probe() {
        let auth = TenantAuth::new();
        let limiter = Mutex::new(RateLimiter::new(10, 1));
        let req = "GET /v1/models HTTP/1.1\r\nHost: localhost\r\n\r\n";
        let (status, _, body) = handle_http_request(req, &auth, &limiter);
        assert_eq!(status, 200);
        assert!(body.contains("genos-core-v3"));
    }

    #[test]
    fn test_server_chat_completions() {
        let mut auth = TenantAuth::new();
        auth.register_tenant("test_client", "sk-secret-token");
        let limiter = Mutex::new(RateLimiter::new(10, 1));
        let payload = r#"{"model":"genos-core-v3","messages":[{"role":"user","content":"Ping"}]}"#;
        let req = format!(
            "POST /v1/chat/completions HTTP/1.1\r\nHost: localhost\r\nAuthorization: Bearer sk-secret-token\r\nContent-Length: {}\r\n\r\n{}",
            payload.len(),
            payload
        );
        let (status, _, body) = handle_http_request(&req, &auth, &limiter);
        assert_eq!(status, 200);
        assert!(body.contains("chat.completion"));
        assert!(body.contains("Ping"));
    }
}

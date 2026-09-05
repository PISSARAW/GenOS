pub mod security;
pub mod types;

pub use security::{RateLimiter, TenantAuth};
pub use types::{
    ChatChoice, ChatCompletionRequest, ChatCompletionResponse, ChatMessage, ChatOutputMessage,
    ChatUsage, HealthResponse,
};

#[cfg(test)]
mod tests {
    use super::*;

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
}

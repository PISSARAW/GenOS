#![cfg(feature = "api")]

use genos_orchestrator::api::{ChatMessage, RateLimiter, TenantAuth};

#[test]
fn api_feature_exposes_security_and_types() {
    // Sécurité : limitation de débit.
    let mut limiter = RateLimiter::new(10, 2);
    assert!(limiter.try_acquire(5));
    assert!(limiter.try_acquire(5));
    assert!(!limiter.try_acquire(1));
    limiter.refill(3);
    assert!(limiter.try_acquire(5));

    // Authentification multi-tenant.
    let mut auth = TenantAuth::new();
    auth.register_tenant("tenant-a", "key-123");
    assert_eq!(auth.verify_key("key-123"), Some("tenant-a"));
    assert!(auth.has_keys());

    // Types de complétion (accessibles depuis l'orchestrateur).
    let msg = ChatMessage {
        role: "user".into(),
        content: "bonjour".into(),
        tool_call_id: None,
    };
    assert_eq!(msg.role, "user");
}

#[test]
fn thalamus_complexity_scoring_works_offline() {
    let score = genos_orchestrator::thalamus::evaluate_prompt_complexity(
        "architecture systeme distribue avec agents orchestrateur",
    );
    assert!(score > 0);
}

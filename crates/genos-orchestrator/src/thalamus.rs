//! Exploitation du thalamus : routage cognitif et cache sémantique.
//!
//! Disponible uniquement avec la feature Cargo `api`.

pub use genos_api::thalamus::{
    ThalamusCacheKey, ThalamusMessage, ThalamusRequest, call_llm_api, evaluate_prompt_complexity,
    thalamus_cache_key, thalamus_cache_lookup, thalamus_cache_store,
};

/// Consultation du thalamus (Système 1 par défaut).
pub fn consult(prompt: &str, system_level: u8) -> String {
    let request = ThalamusRequest {
        messages: vec![ThalamusMessage {
            role: "user".into(),
            content: prompt.into(),
        }],
        rethink: false,
        system_level,
        cache_scope: "orchestrator".into(),
        temperature: None,
        max_tokens: None,
    };
    call_llm_api(&request)
}

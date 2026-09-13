//! Exploitation du thalamus : routage cognitif et cache sémantique.
//!
//! Disponible uniquement avec la feature Cargo `api`.

pub use genos_api::thalamus::{
    ThalamusCacheKey, call_llm_api, evaluate_prompt_complexity, thalamus_cache_key,
    thalamus_cache_lookup, thalamus_cache_store,
};

/// Consultation du thalamus (Système 1 par défaut).
pub fn consult(prompt: &str, system_level: u8) -> String {
    call_llm_api(prompt, false, system_level, "orchestrator")
}

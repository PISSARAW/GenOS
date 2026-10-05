use crate::omega::OmegaEnvelope;
use serde::Deserialize;
use serde_json::Value;
use std::collections::HashMap;

#[derive(Clone, Debug, Deserialize)]
pub struct SemanticHandlerSet {
    pub selector: String,
    pub tool: String,
    pub infer: String,
    pub verification: String,
    pub effect: String,
}

#[derive(Debug, Deserialize)]
struct Catalog { handlers: HashMap<String, SemanticHandlerSet> }

fn catalog() -> Catalog {
    serde_json::from_str(include_str!("../../../shared/cognitiveOmegaSemanticHandlers.json"))
        .expect("canonical Omega semantic handler catalog must be valid")
}

pub fn for_domain(domain: &str) -> Option<SemanticHandlerSet> { catalog().handlers.get(domain).cloned() }

pub fn validate(envelope: &OmegaEnvelope) -> Result<(), String> {
    let Some(domain) = envelope.payload.as_ref().and_then(|payload| payload.get("domain"))
        .and_then(Value::as_str) else { return Ok(()); };
    let Some(semantic) = for_domain(domain) else { return Err("omega_domain_unknown".into()); };
    if let Some(intent) = envelope.payload.as_ref()
        .and_then(|payload| payload.get("verification"))
        .and_then(Value::as_str)
    {
        if intent != semantic.verification {
            return Err("omega_verification_intent_mismatch".into());
        }
    }
    let expected = [semantic.selector, semantic.tool, semantic.infer,
        format!("epistemic/{domain}"), semantic.effect];
    for operation in &envelope.operations {
        if let Some(reference) = operation.2.as_deref()
            && !reference.starts_with('@') && !expected.iter().any(|item| item == reference) {
            return Err(format!("omega_semantic_reference_unknown:{reference}"));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::for_domain;

    #[test]
    fn catalog_exposes_domain_handlers() {
        let trinity = for_domain("trinity").expect("trinity handler set");
        assert_eq!(trinity.tool, "trinity/experiment");
        assert_eq!(trinity.verification, "reproducer");
        assert!(for_domain("missing").is_none());
    }
}

use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ExtractedClaim {
    pub subject: String,
    pub predicate: String,
    pub object: String,
    pub confidence: f64,
    pub evidence: String,
}

pub fn extract_semantic_claims(prose: &str, confidence_threshold: f64) -> Vec<ExtractedClaim> {
    let mut claims = Vec::new();
    if prose.contains("causes") {
        claims.push(ExtractedClaim {
            subject: "A".to_string(),
            predicate: "causes".to_string(),
            object: "B".to_string(),
            confidence: 0.9,
            evidence: prose.to_string(),
        });
    }
    // Very basic dummy logic for MVP
    claims
        .into_iter()
        .filter(|c| c.confidence >= confidence_threshold)
        .collect()
}

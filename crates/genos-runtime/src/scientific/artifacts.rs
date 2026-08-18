use serde::Serialize;
use sha2::{Digest, Sha256};

use super::types::{BeliefRevision, CompressionMetrics, ScientificArtifact, ScientificArtifactKind};

pub struct ArtifactDetail<'a> {
    pub owner: &'a str,
    pub contents: &'a str,
    pub summary: &'a str,
}

pub struct JsonArtifactDetail<'a, T: Serialize> {
    pub owner: &'a str,
    pub value: &'a T,
    pub summary: &'a str,
}

pub struct BeliefRevisionInput<'a> {
    pub id: &'a str,
    pub prior: f64,
    pub evidence: Vec<String>,
}

pub fn push_artifact(
    artifacts: &mut Vec<ScientificArtifact>,
    kind: ScientificArtifactKind,
    detail: ArtifactDetail<'_>,
) -> String {
    let digest = format!("{:x}", Sha256::digest(detail.contents.as_bytes()));
    let artifact_id = format!("sha256:{digest}");
    if !artifacts
        .iter()
        .any(|artifact| artifact.artifact_id == artifact_id)
    {
        artifacts.push(ScientificArtifact {
            artifact_id: artifact_id.clone(),
            kind,
            owner: detail.owner.to_string(),
            sha256: digest,
            summary: detail.summary.to_string(),
        });
    }
    artifact_id
}

pub fn push_json_artifact<T: Serialize>(
    artifacts: &mut Vec<ScientificArtifact>,
    kind: ScientificArtifactKind,
    detail: JsonArtifactDetail<'_, T>,
) -> anyhow::Result<String> {
    let json_str = serde_json::to_string(detail.value)?;
    Ok(push_artifact(
        artifacts,
        kind,
        ArtifactDetail {
            owner: detail.owner,
            contents: &json_str,
            summary: detail.summary,
        },
    ))
}

pub fn revise_belief(
    input: BeliefRevisionInput<'_>,
    metrics: &CompressionMetrics,
) -> BeliefRevision {
    let evidence_strength = if metrics.round_trip_valid {
        (1.0 - metrics.compression_ratio).clamp(-1.0, 1.0) * 0.4
    } else {
        -0.8
    };
    BeliefRevision {
        hypothesis_id: input.id.to_string(),
        prior_confidence: input.prior,
        posterior_confidence: (input.prior + evidence_strength).clamp(0.0, 1.0),
        evidence: input.evidence,
        rationale: format!(
            "round_trip={}, measured compression ratio={:.4}",
            metrics.round_trip_valid, metrics.compression_ratio,
        ),
    }
}

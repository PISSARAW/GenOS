use genos_core::{LineageDag, SnapshotId};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum CompressionStrategy {
    Raw,
    RunLength,
    DeltaRunLength,
    ChunkDedup { chunk_size: usize },
    Adaptive,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ScientificProtocol {
    pub repetitions: u32,
    pub metric: String,
    #[serde(default)]
    pub holdout_records: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ScientificCritiqueSpec {
    pub target: String,
    pub concern: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ScientificHypothesisSpec {
    pub id: String,
    pub parent: Option<String>,
    pub claim: String,
    pub strategy: CompressionStrategy,
    pub implementation_source: String,
    pub protocol: ScientificProtocol,
    pub prior_confidence: f64,
    #[serde(default)]
    pub critiques: Vec<ScientificCritiqueSpec>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ScientificReproductionSpec {
    pub researcher_id: String,
    pub target_hypothesis: String,
    #[serde(default)]
    pub records: Vec<String>,
    pub tolerance: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ScientificRewindSpec {
    pub id: String,
    pub suspicious_hypothesis: String,
    pub restore_snapshot: String,
    pub reason: String,
    pub strategy: CompressionStrategy,
    pub implementation_source: String,
    pub protocol: ScientificProtocol,
    pub prior_confidence: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ScientificExperimentManifest {
    pub name: String,
    pub question: String,
    pub snapshot_ref: String,
    pub records: Vec<String>,
    pub hypotheses: Vec<ScientificHypothesisSpec>,
    #[serde(default)]
    pub reproductions: Vec<ScientificReproductionSpec>,
    #[serde(default)]
    pub rewinds: Vec<ScientificRewindSpec>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ScientificArtifactKind {
    Implementation,
    Protocol,
    Results,
    Critique,
    Reproduction,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ScientificArtifact {
    pub artifact_id: String,
    pub kind: ScientificArtifactKind,
    pub owner: String,
    pub sha256: String,
    pub summary: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct CompressionMetrics {
    pub input_bytes: usize,
    pub compressed_bytes: usize,
    pub compression_ratio: f64,
    pub round_trip_valid: bool,
    pub repetitions: u32,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct BeliefRevision {
    pub hypothesis_id: String,
    pub prior_confidence: f64,
    pub posterior_confidence: f64,
    pub evidence: Vec<String>,
    pub rationale: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ScientificHypothesisOutcome {
    pub hypothesis_id: String,
    pub parent_hypothesis_id: Option<String>,
    pub snapshot_id: SnapshotId,
    pub claim: String,
    pub strategy: CompressionStrategy,
    pub metrics: CompressionMetrics,
    pub belief: BeliefRevision,
    pub artifact_ids: Vec<String>,
    pub critiques: Vec<ScientificCritiqueSpec>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ScientificReproductionOutcome {
    pub researcher_id: String,
    pub target_hypothesis: String,
    pub original_ratio: f64,
    pub reproduced_ratio: f64,
    pub consistent: bool,
    pub artifact_id: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ScientificRewindOutcome {
    pub investigation_id: String,
    pub suspicious_hypothesis: String,
    pub restored_from_snapshot: SnapshotId,
    pub new_snapshot_id: SnapshotId,
    pub reason: String,
    pub metrics: CompressionMetrics,
    pub belief: BeliefRevision,
    pub artifact_ids: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ScientificExperimentReport {
    pub name: String,
    pub question: String,
    pub snapshot_ref: String,
    pub hypotheses: Vec<ScientificHypothesisOutcome>,
    pub reproductions: Vec<ScientificReproductionOutcome>,
    pub rewinds: Vec<ScientificRewindOutcome>,
    pub final_beliefs: Vec<BeliefRevision>,
    pub artifacts: Vec<ScientificArtifact>,
    pub lineage: LineageDag,
    pub primitive_trace: crate::AgentPrimitiveTrace,
}

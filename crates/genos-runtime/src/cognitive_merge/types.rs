use genos_core::{AgentEvent, AgentSnapshot, BranchId};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Default, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EpistemicKind {
    Fact,
    #[default]
    Hypothesis,
    Observation,
    Contradiction,
    Preference,
    Result,
    Discovery,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct CognitiveClaim {
    pub claim_id: String,
    pub branch_id: BranchId,
    pub subject: String,
    pub predicate: String,
    pub object_value: String,
    pub confidence: f64,
    pub evidence: Vec<String>,
    #[serde(default)]
    pub kind: EpistemicKind,
    #[serde(default)]
    pub statement: String,
    #[serde(default)]
    pub conditions: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ExperienceItem {
    pub item_id: String,
    pub description: String,
    #[serde(default)]
    pub evidence: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct BranchExperience {
    pub branch_id: BranchId,
    #[serde(default)]
    pub conditions: Vec<String>,
    #[serde(default)]
    pub observations: Vec<ExperienceItem>,
    #[serde(default)]
    pub actions: Vec<ExperienceItem>,
    #[serde(default)]
    pub results: Vec<ExperienceItem>,
    #[serde(default)]
    pub beliefs_created: Vec<CognitiveClaim>,
    #[serde(default)]
    pub beliefs_modified: Vec<CognitiveClaim>,
    #[serde(default)]
    pub failures: Vec<ExperienceItem>,
    #[serde(default)]
    pub discoveries: Vec<ExperienceItem>,
    #[serde(default)]
    pub uncertainty: Vec<ExperienceItem>,
    #[serde(default)]
    pub evidence: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ClaimRelationKind {
    Supports,
    Contradicts,
    Explains,
    Supersedes,
    Qualifies,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ClaimRelation {
    pub from_claim: String,
    pub to_claim: String,
    pub kind: ClaimRelationKind,
    pub confidence: f64,
    pub evidence: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MergeClaimStatus {
    Accepted,
    Disputed,
    Superseded,
    Unresolved,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct MergedClaim {
    pub subject: String,
    pub predicate: String,
    pub object_value: String,
    pub confidence: f64,
    pub supporting_branches: Vec<BranchId>,
    pub source_claims: Vec<String>,
    pub evidence: Vec<String>,
    pub epistemic_kinds: Vec<EpistemicKind>,
    pub statements: Vec<String>,
    pub conditions: Vec<String>,
    pub status: MergeClaimStatus,
    pub conflicts_with: Vec<String>,
    pub explained_by: Vec<String>,
    pub qualified_by: Vec<String>,
    pub superseded_by: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CognitiveGraphNodeKind {
    Concept,
    Claim,
    Branch,
    Observation,
    Action,
    Result,
    Failure,
    Discovery,
    Uncertainty,
    Evidence,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct CognitiveGraphNode {
    pub node_id: String,
    pub kind: CognitiveGraphNodeKind,
    pub label: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CognitiveGraphEdgeKind {
    Asserts,
    CreatesBelief,
    ModifiesBelief,
    Observes,
    Performs,
    Produces,
    FailsWith,
    Discovers,
    IsUncertainAbout,
    EvidenceFor,
    About,
    Supports,
    Contradicts,
    Explains,
    Supersedes,
    Qualifies,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct CognitiveGraphEdge {
    pub from: String,
    pub to: String,
    pub kind: CognitiveGraphEdgeKind,
    pub confidence: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct CognitiveGraph {
    pub nodes: Vec<CognitiveGraphNode>,
    pub edges: Vec<CognitiveGraphEdge>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ContextualConclusion {
    pub claim: String,
    pub statement: String,
    pub status: MergeClaimStatus,
    pub conditions: Vec<String>,
    pub source_branches: Vec<BranchId>,
    pub confidence: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct KnowledgeSynthesis {
    pub topics: Vec<String>,
    pub summary: String,
    pub conclusions: Vec<ContextualConclusion>,
    pub residual_conflicts: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct CognitiveMergeConfig {
    pub acceptance_threshold: f64,
    pub minimum_independent_branches: usize,
}

impl Default for CognitiveMergeConfig {
    fn default() -> Self {
        Self {
            acceptance_threshold: 0.75,
            minimum_independent_branches: 1,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct CognitiveMergeReport {
    pub candidates: Vec<MergedClaim>,
    pub relations: Vec<ClaimRelation>,
    pub accepted: Vec<String>,
    pub disputed: Vec<String>,
    pub superseded: Vec<String>,
    pub unresolved: Vec<String>,
    pub graph: CognitiveGraph,
    pub syntheses: Vec<KnowledgeSynthesis>,
    pub audit: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CognitiveMergeApplication {
    pub snapshot: AgentSnapshot,
    pub events: Vec<AgentEvent>,
}

pub type ClaimKey = (String, String, String);

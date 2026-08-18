use genos_core::{AgentGenome, AgentSnapshot, GenomeId, PhenotypeObservation};
use genos_eval::{ParetoAssessment, RecombinedTraitTarget};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct CohortControls {
    pub model: String,
    pub environment: String,
    pub evaluation_suite: String,
    pub seed_policy: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct HeredityCohortMember {
    pub treatment: String,
    pub baseline: AgentSnapshot,
    pub phenotype: PhenotypeObservation,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ExperienceEffect {
    pub trait_name: String,
    pub minimum: f64,
    pub maximum: f64,
    pub range: f64,
    pub member_values: Vec<(String, f64)>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct HeredityCohortReport {
    pub genome_id: GenomeId,
    pub controls: CohortControls,
    pub effects: Vec<ExperienceEffect>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct FactorialTraitObservation {
    pub genome_id: GenomeId,
    pub treatment: String,
    pub value: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct GenomeExperienceEffects {
    pub genome_effect_range: f64,
    pub experience_effect_range: f64,
    pub maximum_interaction: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct CanonicalAgentMetrics {
    pub accuracy: f64,
    pub cost: f64,
    pub tokens: f64,
    pub latency: f64,
    pub tool_calls: f64,
    pub risk: f64,
    pub hallucinations: f64,
    pub novelty: f64,
    pub success: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct SelectionCandidate {
    pub genome_id: GenomeId,
    pub metrics: CanonicalAgentMetrics,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct SelectionConstraints {
    pub max_cost: f64,
    pub max_risk: f64,
    pub max_hallucinations: f64,
    pub min_success: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ArtificialSelectionReport {
    pub eligible: Vec<GenomeId>,
    pub rejected: Vec<GenomeId>,
    pub pareto: Vec<ParetoAssessment>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ControlledBenchmarkRun {
    pub genome_id: GenomeId,
    pub protocol_id: String,
    pub repetition: u32,
    pub metrics: CanonicalAgentMetrics,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct BreedingTraitMapping {
    pub genome_field: String,
    pub target: RecombinedTraitTarget,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct BreedingValidation {
    pub genome: AgentGenome,
    pub deviations: Vec<(String, f64)>,
    pub tolerance: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct BranchFinding {
    pub branch_id: genos_core::BranchId,
    pub claim: String,
    pub evidence: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SynthesisStatus {
    Proposed,
    Validated,
    Rejected,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct KnowledgeSynthesisProposal {
    pub findings: Vec<BranchFinding>,
    pub validation_branch: Option<genos_core::BranchId>,
    pub status: SynthesisStatus,
}

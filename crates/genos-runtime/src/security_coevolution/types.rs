use genos_core::{GenomeId, LineageDag, SnapshotId};
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub struct SecurityGenes {
    /// Offensive pressure for Red; detection coverage for Blue.
    pub effectiveness: f64,
    /// Ability to respond to the opposing population.
    pub adaptability: f64,
    /// Stealth for Red; alert precision for Blue.
    pub precision: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct SecurityScenarioSpec {
    pub id: String,
    pub attack_tactic: String,
    pub defense_tactic: String,
    pub baseline_risk: f64,
    pub red_genes: SecurityGenes,
    pub blue_genes: SecurityGenes,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct SecurityCoevolutionConfig {
    pub seed: u64,
    pub generations: u32,
    pub mutations_per_parent: u32,
    pub mutation_scale: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct SecurityCoevolutionManifest {
    pub name: String,
    pub snapshot_ref: String,
    pub scenarios: Vec<SecurityScenarioSpec>,
    pub config: SecurityCoevolutionConfig,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SecurityPopulation {
    Red,
    Blue,
    Observer,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct SecurityGenome {
    pub genome_id: GenomeId,
    pub parent_genome: Option<GenomeId>,
    pub population: SecurityPopulation,
    pub tactic: String,
    pub genes: SecurityGenes,
    pub generation: u32,
    pub mutation: Option<SecurityGenomeMutation>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct SecurityGenomeMutation {
    pub field: String,
    pub previous_value: f64,
    pub new_value: f64,
    pub delta: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct SecurityWorld {
    pub world_id: String,
    pub parent_snapshot: SnapshotId,
    pub scenario_id: String,
    pub red: SecurityGenome,
    pub blue: SecurityGenome,
    pub observer: SecurityGenome,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct MutationCandidate {
    pub scenario_id: String,
    pub genome: SecurityGenome,
    pub fitness: f64,
    pub selected: bool,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ObserverFinding {
    pub scenario_id: String,
    pub world_id: String,
    pub generation: u32,
    pub red_genome_id: GenomeId,
    pub blue_genome_id: GenomeId,
    pub breach_probability: f64,
    pub defense_utility: f64,
    pub false_positive_cost: f64,
    pub arms_race_delta: f64,
    pub observation: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct CoevolutionGeneration {
    pub scenario_id: String,
    pub generation: u32,
    pub red_candidates: Vec<MutationCandidate>,
    pub blue_candidates: Vec<MutationCandidate>,
    pub selected_red: GenomeId,
    pub selected_blue: GenomeId,
    pub observer_finding: ObserverFinding,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct SecurityCoevolutionReport {
    pub name: String,
    pub snapshot_ref: String,
    pub generations_requested: u32,
    pub initial_worlds: Vec<SecurityWorld>,
    pub evolution: Vec<CoevolutionGeneration>,
    pub final_worlds: Vec<SecurityWorld>,
    pub world_lineage: LineageDag,
    pub total_genomes_evaluated: usize,
    pub primitive_trace: crate::AgentPrimitiveTrace,
}

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

/// Stratégies de sélection des parents lors de la reproduction (Algorithme Génétique).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ParentSelectionStrategy {
    /// Choix aléatoire uniforme parmi le front de Pareto (non-dominés).
    RandomPareto,
    /// Tirage de `size` candidats aléatoires. Le gagnant est le candidat qui domine
    /// les autres selon Pareto, ou le premier non-dominé trouvé dans le groupe.
    Tournament { size: usize },
    /// Sélection proportionnelle au succès scalaire (Fitness proportionnelle).
    Roulette,
}

/// Regroupement des hyper-paramètres d'évolution (Cycle de vie).
/// Permet de contrôler le comportement de `run_breeding_program` de bout en bout.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct BreedingConfig {
    /// Taille de la population à maintenir pour chaque génération.
    pub population_size: usize,
    /// Nombre de générations à simuler.
    pub generations: usize,
    /// Index de départ de la première génération (Génération 0 par défaut).
    pub start_generation: usize,
    /// Seuil optionnel de spéciation pour bloquer les accouplements trop éloignés génétiquement.
    pub speciation_threshold: Option<f64>,
    /// Méthode de tirage des parents (ex: Tournoi, Roulette).
    pub selection_strategy: ParentSelectionStrategy,
    /// Opérateur de recombinaison à appliquer lors de la fusion génétique (ex: Croisement Uniforme).
    pub recombination_strategy: genos_core::RecombinationStrategy,
    /// Contraintes hard pour écarter d'office les individus trop coûteux ou risqués.
    pub selection_constraints: SelectionConstraints,
    /// Mappages entre les gènes et les traits phénotypiques (cibles de l'élevage).
    pub trait_mappings: Vec<BreedingTraitMapping>,
    /// Nombre de meilleurs agents (élites) à cloner intacts dans la génération suivante.
    pub elitism_count: usize,
    /// Probabilité (0.0 à 1.0) qu'un gène de l'enfant subisse une mutation aléatoire post-recombinaison.
    pub mutation_rate: f32,
    /// Variance maximale du bruit Gaussien appliqué lors d'une mutation.
    pub mutation_variance: f32,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct KnowledgeSynthesisProposal {
    pub findings: Vec<BranchFinding>,
    pub validation_branch: Option<genos_core::BranchId>,
    pub status: SynthesisStatus,
}

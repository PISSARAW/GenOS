mod breeding;
mod heredity;
pub mod selection;
pub mod synthesis;
pub mod types;
pub mod validation;

#[cfg(test)]
mod breeding_tests;
#[cfg(test)]
mod recombination_tests;
#[cfg(test)]
mod tests;

pub use breeding::{
    breed_genomes, cantor_pairing, compute_genetic_distance, extract_numeric_id,
    run_breeding_program,
};
pub use heredity::{analyze_fixed_genome_cohort, analyze_genome_experience_interaction};
pub use selection::{artificial_select, select_controlled_generation};
pub use synthesis::{synthesize_branch_knowledge, validate_synthesis};
pub use types::{
    ArtificialSelectionReport, BranchFinding, BreedingConfig, BreedingTraitMapping,
    BreedingValidation, CanonicalAgentMetrics, CohortControls, ControlledBenchmarkRun,
    ExperienceEffect, FactorialTraitObservation, GenomeExperienceEffects, HeredityCohortMember,
    HeredityCohortReport, KnowledgeSynthesisProposal, ParentSelectionStrategy, SelectionCandidate,
    SelectionConstraints, SynthesisStatus,
};
pub use validation::validate_bred_child;

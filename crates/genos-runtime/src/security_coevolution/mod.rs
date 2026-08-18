mod runner;
mod simulation;
mod types;

pub use runner::run_security_coevolution;
pub use simulation::{base_genome, matchup, spawn_candidates, unit_random, SpawnContext};
pub use types::{
    CoevolutionGeneration, MutationCandidate, ObserverFinding, SecurityCoevolutionConfig,
    SecurityCoevolutionManifest, SecurityCoevolutionReport, SecurityGenes, SecurityGenome,
    SecurityGenomeMutation, SecurityPopulation, SecurityScenarioSpec, SecurityWorld,
};

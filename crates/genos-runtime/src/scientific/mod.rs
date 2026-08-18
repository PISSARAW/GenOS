mod artifacts;
mod compression;
mod experiment;
mod reproduction;
mod rewind;
mod types;

pub use artifacts::{push_artifact, push_json_artifact, revise_belief};
pub use compression::{benchmark, compress, rle};
pub use experiment::run_scientific_experiment;
pub use types::{
    BeliefRevision, CompressionMetrics, CompressionStrategy, ScientificArtifact,
    ScientificArtifactKind, ScientificCritiqueSpec, ScientificExperimentManifest,
    ScientificExperimentReport, ScientificHypothesisOutcome, ScientificHypothesisSpec,
    ScientificProtocol, ScientificReproductionOutcome, ScientificReproductionSpec,
    ScientificRewindOutcome, ScientificRewindSpec,
};

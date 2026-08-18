mod application;
mod graph;
mod merge;
mod synthesis;
mod types;
mod validation;

#[cfg(test)]
mod tests;

pub use application::apply_cognitive_merge;
pub use merge::{cognitive_merge, merge_experiences};
pub use types::{
    BranchExperience, ClaimKey, ClaimRelation, ClaimRelationKind, CognitiveClaim, CognitiveGraph,
    CognitiveGraphEdge, CognitiveGraphEdgeKind, CognitiveGraphNode, CognitiveGraphNodeKind,
    CognitiveMergeApplication, CognitiveMergeConfig, CognitiveMergeReport, ContextualConclusion,
    EpistemicKind, ExperienceItem, KnowledgeSynthesis, MergeClaimStatus, MergedClaim,
};

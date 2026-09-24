//! genos-worker : un seul runtime, des phenotypes specialises.
//!
//! Chaque worker execute le meme cycle universel (`cycle`) sous un
//! `WorkerRuntimeContract` commun (`contract`). Ce qui change par type :
//! persistence, scope, autorite, liberte d'adaptation, memoire,
//! communication, strategie, spawn, topologie, obligations d'evidence.
//!
//! Les 20 invariants (`invariants`) sont non negociables ; le parent
//! consomme un `WorkerDossier` type (`dossier`), jamais un texte libre.

pub mod contract;
pub mod cycle;
pub mod dossier;
pub mod invariants;
pub mod phenotype;
pub mod presets;

#[cfg(test)]
mod tests;

pub use contract::{
    AuthorityProfile, CommsProfile, ContractError, EvidenceSpec, LifecycleSpec, MemoryProfile,
    ResourceBudget, ResilienceSpec, WorkerIdentity, WorkerMission, WorkerNiche,
    WorkerRuntimeContract, validate_contract,
};
pub use cycle::{
    CycleOutcome, CycleStep, ReviewDecision, WorkerState, advance, record_cognitive_change,
    record_strategy_change, review,
};
pub use dossier::{
    AdaptiveEnvelope, ClinicalReport, CreativeCandidate, Escalation, ScoutObservation,
    VerificationReport, VerificationVerdict, WorkerDossier, WorkerStatus, status_name,
};
pub use invariants::{ActionRequest, InvariantViolation, check_action, is_verified_success};
pub use phenotype::{
    AdaptationLevel, AgentPhenotype, CognitionMode, EpistemicRole, OrgRole, Persistence,
    WorkerFamily, WorkerKind, dedifferentiate, default_phenotype, family_of, niche_fit,
};
pub use presets::{PresetInput, preset_for};

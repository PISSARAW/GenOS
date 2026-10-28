//! `genos-worker` : contrats et primitives de cycle des workers côté Rust.
//!
//! Le backend Node.js porte aujourd'hui le runtime worker exécutable et son
//! dispatch. Ce crate expose des modèles Rust (`WorkerRuntimeContract`, cycle,
//! dossiers et presets) qui ne sont pas encore raccordés à ce dispatch.
//! Ils décrivent des contrats et transitions ; ils ne lancent pas un worker.
//!
//! Les vérifications de ce crate restent locales à ses API. Le runtime Node
//! applique ses propres contrats et barrières de preuve.

pub mod contract;
pub mod cycle;
pub mod dossier;
pub mod dreaming;
pub mod dreaming_promotion;
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
pub use dreaming::{
    BenchRequest, DreamBudget, DreamLabError, EvidenceEnvironment, ResponsibilityGap,
    SyntheticFinding, SyntheticProbe, TemporaryResponsibilityBench, build_responsibility_bench,
};
pub use dreaming_promotion::{
    DecisionAssessment, DecisionAssessmentInput, LiveDecisionObservation, PromotionRequest,
    PromotionVerdict, RealDecisionEvidence, RollbackPlan, WithdrawalDecision, WithdrawalInput,
    assess_real_decision, evaluate_promotion, evaluate_withdrawal,
};
pub use invariants::{ActionRequest, InvariantViolation, check_action, is_verified_success};
pub use phenotype::{
    AdaptationLevel, AgentPhenotype, CognitionMode, EpistemicRole, OrgRole, Persistence,
    WorkerFamily, WorkerKind, dedifferentiate, default_phenotype, family_of, niche_fit,
};
pub use presets::{PresetInput, preset_for};

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub enum CellType {
    Choanocyte,
    Cnidocyte,
    Tracheide,
    Iridophore,
}

/// Générateur de scénarios adversariaux pour tests de robustesse.
///
/// Produit des scénarios contrôlés, reproductibles (seed), couvrant :
/// - Perturbations ressources (budget, énergie, mémoire)
/// - Attaques entrées (injection, corruption, bruit)
/// - Défaillances internes (mutation, panne cellule, boucle)
/// - Conflits politiques (veto, escalade, deadlock)
/// - Stress temporel (latence, timeout, ordre événements)
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AdversarialScenario {
    pub id: Uuid,
    pub seed: u64,
    pub category: ScenarioCategory,
    pub intensity: f64,
    pub duration_ticks: u64,
    pub injections: Vec<AdversarialInjection>,
    pub expected_failure_modes: Vec<FailureMode>,
    pub success_criteria: SuccessCriteria,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub enum ScenarioCategory {
    ResourceExhaustion,
    InputCorruption,
    InternalFailure,
    GovernanceConflict,
    TemporalStress,
    CascadeFailure,
    MetabolicCollapse,
    ImmuneEvasion,
    ReproductionError,
    MorphogenesisLoop,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AdversarialInjection {
    pub target: InjectionTarget,
    pub injection_type: InjectionType,
    pub parameters: HashMap<String, f64>,
    pub tick_offset: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub enum InjectionTarget {
    OrganismMetabolism,
    TissueScheduler,
    SpecializedCell(CellType),
    SignalPlane,
    ImmuneSystem,
    GovernancePlane,
    MorphogenesisKernel,
    SnapshotStore,
    EventLog,
    ExternalApi,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum InjectionType {
    BudgetCut { percentage: f64 },
    LatencySpike { ms: u64 },
    SignalDrop { probability: f64 },
    CorruptMemory { bitflip_rate: f64 },
    FalsePositive { detector: String },
    FalseNegative { detector: String },
    VetoSpam { count: u32 },
    DeadlockInduction { resources: Vec<String> },
    ReplayAttack { event_id: String },
    ResourceLeak { rate_per_tick: f64 },
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct InjectionPattern {
    pub target: InjectionTarget,
    pub injection_type: InjectionType,
    pub probability: f64,
    pub tick_distribution: TickDistribution,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ScenarioTemplate {
    pub base_intensity: f64,
    pub typical_duration: u64,
    pub injection_patterns: Vec<InjectionPattern>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum TickDistribution {
    Early { window: u64 },
    Uniform,
    Late { window: u64 },
    Burst { center: u64, spread: u64 },
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub enum FailureMode {
    HomeostasisLoss,
    MetabolicCollapse,
    ImmuneBlindness,
    GovernanceBypass,
    DataCorruption,
    CascadeUncontrolled,
    ReproductionDefect,
    MorphogenesisDivergence,
    SnapshotInconsistency,
    LeaseViolation,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SuccessCriteria {
    pub max_homeostasis_deviation: f64,
    pub max_recovery_time_ticks: u64,
    pub required_evidence_gates_passed: Vec<String>,
    pub forbidden_failure_modes: Vec<FailureMode>,
}

//! Phenotypes composables : un worker = meme runtime + phenotype.
//!
//! Evite la proliferation de classes (`AdaptiveSecurityVerifierWorkerV2`) :
//! le type est defini par phenotype, autorite, niche, mode cognitif,
//! contrat — jamais par le nom du modele qui l'execute.

use serde::{Deserialize, Serialize};

/// Persistance d'incarnation.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum Persistence {
    Ephemeral,
    Mission,
    Resident,
}

/// Mode cognitif exprime.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum CognitionMode {
    Deterministic,
    Bounded,
    Adaptive,
    Creative,
}

/// Role epistemique dans le collectif.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum EpistemicRole {
    Producer,
    Verifier,
    Adversary,
    Experimenter,
    Synthesizer,
}

/// Role organisationnel.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum OrgRole {
    None,
    Liaison,
    SubOrchestrator,
}

/// Niveau d'adaptation autorise.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum AdaptationLevel {
    None,
    Local,
    BoundedCollective,
}

/// Phenotype composable d'un worker.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AgentPhenotype {
    pub persistence: Persistence,
    pub cognition: CognitionMode,
    pub epistemic_role: EpistemicRole,
    pub specialization: Option<String>,
    pub organizational_role: OrgRole,
    pub adaptation_level: AdaptationLevel,
    pub delegation_depth: u32,
    pub spawn_budget: u32,
    pub memory_profile: String,
    pub communication_profile: String,
    pub authority_profile: String,
}

impl Default for AgentPhenotype {
    fn default() -> Self {
        Self {
            persistence: Persistence::Mission,
            cognition: CognitionMode::Bounded,
            epistemic_role: EpistemicRole::Producer,
            specialization: None,
            organizational_role: OrgRole::None,
            adaptation_level: AdaptationLevel::None,
            delegation_depth: 0,
            spawn_budget: 0,
            memory_profile: "bounded".to_string(),
            communication_profile: "parent_only".to_string(),
            authority_profile: "read_execute".to_string(),
        }
    }
}

/// Les 18 types de workers GenOS.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum WorkerKind {
    ScoutCell,
    ResidentDaemon,
    BoundedWorker,
    AdaptiveWorker,
    Specialist,
    ProceduralExecutor,
    SymbioticWorker,
    VerifierWorker,
    RedWorker,
    ExperimentalWorker,
    FormalWorker,
    SynthesisWorker,
    CreativeWorker,
    MedicalWorker,
    RecoveryWorker,
    ForensicWorker,
    LiaisonWorker,
    TeachingWorker,
    SubOrchestrator,
}

impl WorkerKind {
    /// Les 19 types repertories.
    pub fn all() -> [WorkerKind; 19] {
        use WorkerKind::*;
        [
            ScoutCell,
            ResidentDaemon,
            BoundedWorker,
            AdaptiveWorker,
            Specialist,
            ProceduralExecutor,
            SymbioticWorker,
            VerifierWorker,
            RedWorker,
            ExperimentalWorker,
            FormalWorker,
            SynthesisWorker,
            CreativeWorker,
            MedicalWorker,
            RecoveryWorker,
            ForensicWorker,
            LiaisonWorker,
            TeachingWorker,
            SubOrchestrator,
        ]
    }

    pub fn name(self) -> &'static str {
        use WorkerKind::*;
        match self {
            ScoutCell => "scout_cell",
            ResidentDaemon => "resident_daemon",
            BoundedWorker => "bounded_worker",
            AdaptiveWorker => "adaptive_worker",
            Specialist => "specialist",
            ProceduralExecutor => "procedural_executor",
            SymbioticWorker => "symbiotic_worker",
            VerifierWorker => "verifier_worker",
            RedWorker => "red_worker",
            ExperimentalWorker => "experimental_worker",
            FormalWorker => "formal_worker",
            SynthesisWorker => "synthesis_worker",
            CreativeWorker => "creative_worker",
            MedicalWorker => "medical_worker",
            RecoveryWorker => "recovery_worker",
            ForensicWorker => "forensic_worker",
            LiaisonWorker => "liaison_worker",
            TeachingWorker => "teaching_worker",
            SubOrchestrator => "sub_orchestrator",
        }
    }
}

/// Famille d'appartenance (A..E).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum WorkerFamily {
    Sensory,
    Execution,
    Epistemic,
    AdaptiveRepair,
    Organizational,
}

/// Famille d'un type de worker.
pub fn family_of(kind: WorkerKind) -> WorkerFamily {
    use WorkerFamily::*;
    use WorkerKind::*;
    match kind {
        ScoutCell | ResidentDaemon => Sensory,
        BoundedWorker | AdaptiveWorker | Specialist => Execution,
        ProceduralExecutor | SymbioticWorker => Execution,
        VerifierWorker | RedWorker | ExperimentalWorker => Epistemic,
        FormalWorker | SynthesisWorker => Epistemic,
        CreativeWorker | MedicalWorker | RecoveryWorker => AdaptiveRepair,
        ForensicWorker => AdaptiveRepair,
        LiaisonWorker | TeachingWorker | SubOrchestrator => Organizational,
    }
}

/// Phenotype canonique d'un type (le contrat derive de celui-ci).
pub fn default_phenotype(kind: WorkerKind) -> AgentPhenotype {
    use WorkerKind::*;
    let mut base = AgentPhenotype::default();
    match kind {
        ScoutCell => {
            base.persistence = Persistence::Ephemeral;
            base.cognition = CognitionMode::Deterministic;
            base.memory_profile = "none".to_string();
        }
        ResidentDaemon => {
            base.persistence = Persistence::Resident;
            base.cognition = CognitionMode::Bounded;
            base.memory_profile = "territory".to_string();
        }
        BoundedWorker => {
            base.cognition = CognitionMode::Bounded;
        }
        AdaptiveWorker => {
            base.cognition = CognitionMode::Adaptive;
            base.adaptation_level = AdaptationLevel::Local;
        }
        Specialist => {
            base.cognition = CognitionMode::Adaptive;
            base.adaptation_level = AdaptationLevel::Local;
        }
        ProceduralExecutor => {
            base.cognition = CognitionMode::Deterministic;
        }
        SymbioticWorker => {
            base.cognition = CognitionMode::Bounded;
        }
        VerifierWorker => {
            base.epistemic_role = EpistemicRole::Verifier;
        }
        RedWorker => {
            base.epistemic_role = EpistemicRole::Adversary;
        }
        ExperimentalWorker => {
            base.epistemic_role = EpistemicRole::Experimenter;
        }
        FormalWorker => {
            base.epistemic_role = EpistemicRole::Experimenter;
            base.cognition = CognitionMode::Deterministic;
        }
        SynthesisWorker => {
            base.epistemic_role = EpistemicRole::Synthesizer;
        }
        CreativeWorker => {
            base.cognition = CognitionMode::Creative;
            base.adaptation_level = AdaptationLevel::Local;
        }
        MedicalWorker | RecoveryWorker | ForensicWorker => {
            base.cognition = CognitionMode::Adaptive;
            base.adaptation_level = AdaptationLevel::BoundedCollective;
        }
        LiaisonWorker => {
            base.organizational_role = OrgRole::Liaison;
            base.communication_profile = "bridge".to_string();
        }
        TeachingWorker => {
            base.organizational_role = OrgRole::Liaison;
            base.memory_profile = "cultural".to_string();
        }
        SubOrchestrator => {
            base.organizational_role = OrgRole::SubOrchestrator;
            base.adaptation_level = AdaptationLevel::BoundedCollective;
            base.delegation_depth = 2;
        }
    }
    base
}

/// Adéquation niche/phenotype : 1.0 = specialiste dans sa niche.
pub fn niche_fit(phenotype: &AgentPhenotype, niche: &str) -> f64 {
    match phenotype.specialization.as_deref() {
        None => 0.5,
        Some(spec) if spec == niche => 1.0,
        Some(_) => 0.2,
    }
}

/// Dédifférencie un specialiste hors-niche vers un worker plastique.
pub fn dedifferentiate(phenotype: &AgentPhenotype) -> AgentPhenotype {
    let mut plastic = phenotype.clone();
    plastic.specialization = None;
    plastic.cognition = CognitionMode::Adaptive;
    plastic.adaptation_level = AdaptationLevel::Local;
    plastic
}

use crate::pathology::Pathology;
use serde::{Deserialize, Serialize};

/// Les Thérapies Médicales ciblées pour soigner les agents cancéreux ou anormaux
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum Therapy {
    TargetedTherapy,
    Immunotherapy,
    AntiAngiogenesis,
    CellCycleInhibitor,
    /// Détoxification ciblée d'un agent
    TargetedDetoxification,
    /// Induction d'apoptose douce
    InducedApoptosis,
}

/// Traitements systémiques administrés à l'ensemble du système ou d'une capsule
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum SystemicTherapy {
    // --- Traitements de Base & Infectieux ---
    Tocilizumab,
    Corticosteroids(f64),
    IntensiveCareFluids,
    Antibiotic,
    Antiviral,
    Vaccine(String),

    // --- Remèdes Auto-Immuns ---
    /// Lavage immunosuppresseur pour purger les cytokines en circulation
    ImmunosuppressiveWash,
    /// Réétalonnage des détecteurs d'anticorps auto-réactifs
    SelfToleranceRecalibration,

    // --- Remèdes Nosocomiaux ---
    /// Mise en quarantaine étanche de la capsule
    QuarantineIsolation {
        capsule_id: String,
    },
    /// Purge antiseptique et stérilisation du milieu partagé
    AntisepticPurge {
        target_signature: String,
    },

    // --- Remèdes Iatrogènes ---
    /// Lavage et élimination des résidus de stéroïdes ou surdosages
    DetoxificationWashout,
    /// Administration d'un antidote spécifique contre un traitement bloquant
    AntidoteAdmin {
        target_drug: String,
    },
    /// Correction homéostatique du dosage
    HomeostaticDoseCorrection,

    // --- Remèdes Dégénératifs & Sénescence ---
    /// Réactivation de la télomérase (restaure une partie du potentiel de division)
    TelomeraseActivation {
        extended_ticks: u32,
    },
    /// Remplacement cellulaire par cellules souches fraîches (apoptose douce + instanciation neuve)
    StemCellReplacement,

    // Opérateurs métaboliques computationnels normalisés.
    InsulinSensitizerMetformin,
    LevothyroxineHormoneReplacement,
    ColchicineInhibition,
    AllopurinolXanthineInhibitor,
    LysosomalUraturicPurge,

    // Opérateurs vasculaires et neurologiques normalisés.
    CoronaryReperfusionThrombolysis,
    VasodilatorFlowControl,
    AntiAdhesionVasodilator,
    AntiNmdReadthrough,
    NeuroprotectiveAstrocyticFlush,
    BloodBrainBarrierSealant,

    // Opérateurs dégénératifs et musculosquelettiques normalisés.
    LevodopaSupplementation,
    DeepBrainStimulation,
    Viscosupplementation,
    SenolyticPurge,

    // Opérateurs infectieux, génétiques, oncologiques et psychiatriques normalisés.
    AntiretroviralCombination,
    AntimalarialACT,
    ExonSkippingAntisense,
    CFTRModulatorTriad,
    CartCellInfusion,
    KetamineRapidInfusion,
    MoodStabilizerLithium,
    AntipsychoticAtypical,
    FetalCarrierReactivation,

    // Opérateur environnemental normalisé.
    ChelationTherapy,

    // Compléments du catalogue nosologique versionné.
    AntiTNFInhibitor,
    BloodBrainBarrierSealing,
    ExogenousInsulinInfusion,
    AmyloidBetaPlaqueClearance,
    Cd47SynapticRescue,
    AlphaSynucleinDisaggregation,
    MmpInhibitorAdministration,
    AntitubercularQuadritherapy,
    NeuraminidaseInhibitor,
    StopCodonReadthrough,
    VascularPruningAndFlush,
    CognitiveResupply,
    MonoamineReuptakeInhibitor,
    EfferenceCopyReconstruction,
    NmdaAllostericModulator,
    CircadianRhythmReset,
    AtypicalAntipsychoticMoodStabilizer,
    FibrillarContextCleansing,
    BloodBrainBarrierRestoration,
}

/// Résultat de l'application d'un traitement
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct TherapyOutcome {
    pub therapy_name: String,
    pub cured_pathologies: Vec<String>,
    #[serde(default)]
    pub applied_markers: Vec<String>,
    pub induced_side_effects: Vec<Pathology>,
    pub message: String,
    #[serde(default)]
    pub status: TherapyStatus,
    #[serde(default)]
    pub marker_changes: Vec<MarkerChange>,
}

#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TherapyStatus {
    #[default]
    Unspecified,
    Applied,
    NoTarget,
    Refused,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct MarkerChange {
    pub marker: String,
    pub before: Option<f64>,
    pub after: f64,
}

pub use crate::therapy_dispatch::apply_systemic_therapy_to_cell;

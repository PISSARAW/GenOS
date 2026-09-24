//! Dossiers et artefacts produits par les workers.
//!
//! Le parent ne consomme jamais une dissertation libre : il consomme
//! un `WorkerDossier` type + des artefacts specialises.

use serde::{Deserialize, Serialize};

/// Etat final d'une mission worker.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum WorkerStatus {
    Completed,
    Blocked,
    Unknown,
    Escalated,
    Terminated,
}

/// Dossier standard retourne au parent.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct WorkerDossier {
    pub worker_id: String,
    pub objective: String,
    pub scope: String,
    pub status: String,
    pub progress: f64,
    pub claims: Vec<String>,
    pub artifacts: Vec<String>,
    pub tests: Vec<String>,
    pub receipts: Vec<String>,
    pub provenance: Vec<String>,
    pub unresolved: Vec<String>,
    pub confidence: f64,
    pub rejected_hypotheses: Vec<String>,
    pub actions_taken: Vec<String>,
    pub strategy_trajectory: Vec<String>,
    pub cognitive_trajectory: Vec<String>,
    pub tokens_spent: u64,
    pub requested_capabilities: Vec<String>,
    pub escalation: Option<Escalation>,
    pub recommendations: Vec<String>,
    pub health: String,
}

impl WorkerDossier {
    /// Succes verifie = termine + preuves + provenance.
    pub fn is_verified_success(&self) -> bool {
        self.status == "completed"
            && !self.artifacts.is_empty()
            && !self.provenance.is_empty()
    }
}

/// Observation structuree d'une ScoutCell.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct ScoutObservation {
    pub question: String,
    pub territory: String,
    pub observations: Vec<String>,
    pub confidence: f64,
    pub evidence_refs: Vec<String>,
    pub uncertainties: Vec<String>,
}

/// Enveloppe d'un AdaptiveWorker.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct AdaptiveEnvelope {
    pub objective: String,
    pub scope: String,
    pub allowed_strategies: Vec<String>,
    pub allowed_recipes: Vec<String>,
    pub capability_ceiling: Vec<String>,
    pub max_strategy_changes: u32,
    pub max_cognitive_changes: u32,
    pub escalation_rules: Vec<String>,
}

/// Escalade vers le parent.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct Escalation {
    pub kind: String,
    pub reason: String,
}

/// Candidat produit par un CreativeWorker (jamais promu directement).
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct CreativeCandidate {
    pub hypothesis: String,
    pub novelty: f64,
    pub expected_value: f64,
    pub assumptions: Vec<String>,
    pub falsification_test: String,
    pub provenance: Vec<String>,
}

/// Rapport clinique d'un MedicalWorker.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct ClinicalReport {
    pub symptoms: Vec<String>,
    pub candidate_diagnoses: Vec<String>,
    pub evidence: Vec<String>,
    pub selected_diagnosis: Option<String>,
    pub uncertainty: f64,
    pub therapy_options: Vec<String>,
}

/// Verdict d'un VerifierWorker : PASS / REJECT / UNRESOLVED.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum VerificationVerdict {
    Accept,
    Reject,
    Unresolved,
}

/// Rapport de verification epistemiquement independant.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct VerificationReport {
    pub claim: String,
    pub verdict: VerificationVerdict,
    pub counterexamples: Vec<String>,
    pub provenance_ok: bool,
    pub uncertainty: f64,
}

impl VerificationReport {
    pub fn unresolved(claim: &str) -> Self {
        Self {
            claim: claim.to_string(),
            verdict: VerificationVerdict::Unresolved,
            counterexamples: Vec::new(),
            provenance_ok: false,
            uncertainty: 1.0,
        }
    }
}

/// Statut simple pour les cas non structures.
pub fn status_name(status: WorkerStatus) -> &'static str {
    match status {
        WorkerStatus::Completed => "completed",
        WorkerStatus::Blocked => "blocked",
        WorkerStatus::Unknown => "unknown",
        WorkerStatus::Escalated => "escalated",
        WorkerStatus::Terminated => "terminated",
    }
}

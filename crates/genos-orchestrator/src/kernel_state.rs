//! Etat global de l'organisme vu par l'orchestrateur-kernel.
//!
//! L'orchestrateur ne porte pas un prompt geant : il maintient un modele
//! structure du monde, de la connaissance, des ressources et du collectif.
//! Ce module definit `OrchestratorState` et les sous-etats associes.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Objectif, contraintes, criteres de succes et conditions d'arret.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct MissionView {
    pub objective: Option<String>,
    pub constraints: Vec<String>,
    pub success_criteria: Vec<String>,
    pub stop_conditions: Vec<String>,
}

/// Vue environnementale : etat courant, derive, niches.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct EnvironmentView {
    pub current_state: HashMap<String, String>,
    pub drift: HashMap<String, f64>,
    pub niches: Vec<String>,
}

/// Vue collective : membres, sous-graphes, topologie, physiologie, sante.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct CollectiveView {
    pub members: Vec<String>,
    pub subgraphs: Vec<SubgraphView>,
    pub topology: HashMap<String, String>,
    pub physiology: HashMap<String, String>,
    pub health_summary: HashMap<String, f64>,
}

/// Un sous-graphe collectif (topologie composite par domaine).
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct SubgraphView {
    pub scope: String,
    pub topology: String,
    pub members: Vec<String>,
    pub physiology: HashMap<String, String>,
}

/// Etat epistemique : ce que le collectif sait vraiment.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct EpistemicView {
    pub claims: Vec<String>,
    pub hypotheses: Vec<String>,
    pub contradictions: Vec<String>,
    pub uncertainties: Vec<String>,
    pub evidence_gaps: Vec<String>,
    pub independence_gaps: Vec<String>,
}

/// Budgets et pressions ressources.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct ResourceView {
    pub tokens_used: u64,
    pub tokens_budget: u64,
    pub latency_ms: u64,
    pub cpu_pressure: f64,
    pub gpu_available: bool,
    pub worker_slots_used: usize,
    pub worker_slots_total: usize,
}

/// Diversite cognitive et trajectoires strategiques.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct CognitionView {
    pub active_recipes: Vec<String>,
    pub diversity_score: f64,
    pub strategy_trajectories: Vec<String>,
}

/// Capacites disponibles, exprimees, manquantes.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct CapabilityView {
    pub available: Vec<String>,
    pub expressed: Vec<String>,
    pub missing: Vec<String>,
}

/// Organismes proceduraux actifs.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct ProcedureView {
    pub active: Vec<String>,
}

/// Assignations de modeles (substrats cognitifs par agent).
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct ModelView {
    pub host_runtime: String,
    pub assignments: HashMap<String, String>,
}

/// Autorite, baux, approbations en attente, risque.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct GovernanceView {
    pub current_authority: String,
    pub leases: Vec<String>,
    pub pending_approvals: Vec<String>,
    pub risk_level: f64,
}

/// Resilience : composants degrades, checkpoints, agents dormants.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct ResilienceView {
    pub degraded_components: Vec<String>,
    pub checkpoints: Vec<String>,
    pub dormant_agents: Vec<String>,
    pub degraded_mode: bool,
}

/// Historique organisationnel (morphologie, echecs, succes).
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct HistoryView {
    pub agent_git_head: Option<String>,
    pub morphology_history: Vec<String>,
    pub recent_failures: Vec<String>,
    pub recent_successes: Vec<String>,
}

/// Observations structurees entrant dans la phase OBSERVE.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct Observations {
    pub environment_changes: Vec<String>,
    pub daemon_briefs: Vec<String>,
    pub worker_reports: Vec<String>,
    pub tool_receipts: Vec<String>,
    pub telemetry: HashMap<String, f64>,
    pub resource_usage: HashMap<String, f64>,
    pub model_failures: Vec<String>,
    pub communication_state: String,
    pub clinical_signals: Vec<String>,
    pub resilience_signals: Vec<String>,
}

/// Etat global maintenu par l'orchestrateur.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct OrchestratorState {
    pub mission: MissionView,
    pub environment: EnvironmentView,
    pub collective: CollectiveView,
    pub epistemics: EpistemicView,
    pub resources: ResourceView,
    pub cognition: CognitionView,
    pub capabilities: CapabilityView,
    pub procedures: ProcedureView,
    pub models: ModelView,
    pub governance: GovernanceView,
    pub resilience: ResilienceView,
    pub history: HistoryView,
}

/// Parametres de mise a jour epistemique.
pub struct EpistemicUpdate {
    pub verified_claims: Vec<String>,
    pub new_contradictions: Vec<String>,
    pub resolved_gaps: Vec<String>,
}

impl OrchestratorState {
    pub fn new(objective: &str) -> Self {
        let mut state = Self::default();
        state.mission.objective = Some(objective.to_string());
        state.models.host_runtime = String::from("codex_native");
        state.governance.current_authority = String::from("orchestrator_principal");
        state
    }

    /// Phase UNDERSTAND : integre les observations structurees.
    pub fn integrate_observations(&mut self, obs: &Observations) {
        self.apply_environment_changes(obs);
        self.apply_worker_reports(obs);
        self.apply_telemetry(obs);
        self.apply_resilience_signals(obs);
    }

    fn apply_environment_changes(&mut self, obs: &Observations) {
        for change in obs.environment_changes.iter() {
            self.environment.drift.insert(change.clone(), 1.0);
        }
        for brief in obs.daemon_briefs.iter() {
            self.environment.current_state.insert(String::from("daemon"), brief.clone());
        }
    }

    fn apply_worker_reports(&mut self, obs: &Observations) {
        for report in obs.worker_reports.iter() {
            self.history.recent_successes.push(report.clone());
        }
        for receipt in obs.tool_receipts.iter() {
            self.collective.health_summary.insert(receipt.clone(), 1.0);
        }
    }

    fn apply_telemetry(&mut self, obs: &Observations) {
        for entry in obs.telemetry.iter() {
            self.collective.health_summary.insert(entry.0.clone(), *entry.1);
        }
        for entry in obs.resource_usage.iter() {
            self.apply_resource_sample(entry.0, *entry.1);
        }
    }

    fn apply_resource_sample(&mut self, key: &str, value: f64) {
        match key {
            open if open == "tokens" => self.resources.tokens_used = value as u64,
            open if open == "latency_ms" => self.resources.latency_ms = value as u64,
            open if open == "cpu" => self.resources.cpu_pressure = value,
            _ => self.record_drift(key, value),
        };
    }

    fn record_drift(&mut self, key: &str, value: f64) {
        self.environment.drift.insert(key.to_string(), value);
    }

    fn apply_resilience_signals(&mut self, obs: &Observations) {
        for signal in obs.clinical_signals.iter() {
            self.resilience.degraded_components.push(signal.clone());
        }
        for signal in obs.resilience_signals.iter() {
            self.resilience.degraded_components.push(signal.clone());
        }
        for failure in obs.model_failures.iter() {
            self.history.recent_failures.push(failure.clone());
        }
        self.resilience.degraded_mode = self.resilience.degraded_components.is_empty().eq(&false);
    }

    /// Phase COLLECT EVIDENCE : revise l'etat epistemique.
    pub fn revise_epistemics(&mut self, update: &EpistemicUpdate) {
        for claim in update.verified_claims.iter() {
            self.epistemics.claims.push(claim.clone());
        }
        for contradiction in update.new_contradictions.iter() {
            self.epistemics.contradictions.push(contradiction.clone());
        }
        self.epistemics.evidence_gaps.retain(|gap| update.resolved_gaps.contains(gap).eq(&false));
    }

    /// Pression budgetaire normalisee entre 0 et 1.
    pub fn budget_pressure(&self) -> f64 {
        self.ratio_used(self.resources.tokens_used, self.resources.tokens_budget)
    }

    /// Taux d'occupation des slots workers.
    pub fn slot_pressure(&self) -> f64 {
        self.ratio_used(self.resources.worker_slots_used as u64, self.resources.worker_slots_total as u64)
    }

    fn ratio_used(&self, used: u64, total: u64) -> f64 {
        match total {
            0 => 0.0,
            budget => ((used as f64) / (budget as f64)).clamp(0.0, 1.0),
        }
    }

    /// La mission est terminale si un critere d'arret est present.
    pub fn has_stop_signal(&self) -> bool {
        self.mission.stop_conditions.is_empty().eq(&false)
    }
}

//! Kernel de controle : boucle OBSERVE -> REEVALUATE.
//!
//! L'orchestrateur est le systeme nerveux central + kernel de controle :
//! il observe, comprend, diagnostique, planifie la morphogenese sous
//! gouvernance, delegue via l'incarnation unique, collecte les preuves,
//! met a jour l'etat, re evalue, versionne (AgentGit) et rapporte.

use crate::kernel_diagnosis::{DiagnosisInput, diagnose};
use crate::kernel_governance::{GovernanceDecision, GovernanceInput, GovernancePlane};
use crate::kernel_incarnation::{AgentIncarnationRequest, AgentIncarnationService, AutonomyLevel};
use crate::kernel_morphogenesis::{MorphogenesisPlan, MorphogenesisPlanner, PlanInput};
use crate::kernel_resolvers::{ResolverInput, resolve_all};
use crate::kernel_state::{EpistemicUpdate, Observations, OrchestratorState};
use serde::{Deserialize, Serialize};

/// Sante collective surveillee en continu.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct CollectiveHealth {
    pub flailing: bool,
    pub starvation: bool,
    pub storm: bool,
    pub monoculture: bool,
    pub error_correlation: f64,
    pub exhaustion: bool,
}

/// Rapport final de mission : comportement de l'organisme.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct KernelMissionReport {
    pub objective: String,
    pub verified: bool,
    pub initial_morphology: String,
    pub final_morphology: String,
    pub transitions: Vec<String>,
    pub agents_used: Vec<String>,
    pub cognitive_changes: Vec<String>,
    pub strategies: Vec<String>,
    pub procedures: Vec<String>,
    pub tokens: u64,
    pub latency_ms: u64,
    pub evidence: Vec<String>,
    pub failed_paths: Vec<String>,
    pub learned: Vec<String>,
}

/// Entrees d'un pas de boucle.
pub struct StepInput {
    pub no_progress: bool,
    pub worker_error_rate: f64,
    pub success: bool,
}

/// Resultat d'un pas de boucle.
#[derive(Clone, Debug)]
pub struct StepOutcome {
    pub plan_applied: bool,
    pub governance: GovernanceDecision,
    pub agents_spawned: Vec<String>,
}

/// Le kernel : etat + planners + gouvernance + incarnation.
pub struct ControlKernel {
    pub state: OrchestratorState,
    pub planner: MorphogenesisPlanner,
    pub governance: GovernancePlane,
    pub incarnation: AgentIncarnationService,
    pub current_topology: String,
    pub initial_topology: String,
    pub commits: Vec<String>,
}

impl ControlKernel {
    pub fn new(objective: &str) -> Self {
        Self {
            state: OrchestratorState::new(objective),
            planner: MorphogenesisPlanner::default(),
            governance: GovernancePlane::new(),
            incarnation: AgentIncarnationService::new(),
            current_topology: String::from("specialist_committee"),
            initial_topology: String::from("specialist_committee"),
            commits: Vec::new(),
        }
    }

    /// Un pas complet de la boucle de controle.
    pub fn step(&mut self, obs: &Observations, input: &StepInput) -> StepOutcome {
        self.state.integrate_observations(obs);
        let plan = self.decide(input);
        let governance = self.authorize(&plan);
        let spawned = self.apply_if_allowed(&plan, &governance);
        self.close_step(input, &plan);
        StepOutcome {
            plan_applied: spawned.is_empty().eq(&false),
            governance,
            agents_spawned: spawned,
        }
    }

    fn decide(&mut self, input: &StepInput) -> MorphogenesisPlan {
        let diagnosis_in = DiagnosisInput {
            state: &self.state,
            no_progress: input.no_progress,
            worker_error_rate: input.worker_error_rate,
        };
        let diagnosis = diagnose(&diagnosis_in);
        let resolver_in = ResolverInput {
            state: &self.state,
            diagnosis: &diagnosis,
        };
        let proposals = resolve_all(&resolver_in);
        let plan_in = PlanInput {
            proposals: &proposals,
            current_topology: &self.current_topology,
            reason: &diagnosis.detail,
        };
        self.planner.plan(&plan_in)
    }

    fn authorize(&self, plan: &MorphogenesisPlan) -> GovernanceDecision {
        let authority = self.state.governance.current_authority.clone();
        let input = GovernanceInput {
            plan,
            authority: &authority,
            risk_level: self.state.governance.risk_level,
            degraded_mode: self.state.resilience.degraded_mode,
        };
        self.governance.validate(&input)
    }

    fn apply_if_allowed(
        &mut self,
        plan: &MorphogenesisPlan,
        decision: &GovernanceDecision,
    ) -> Vec<String> {
        match decision.allowed {
            true => self.execute_plan(plan),
            false => Vec::new(),
        }
    }

    fn execute_plan(&mut self, plan: &MorphogenesisPlan) -> Vec<String> {
        if plan.decision_no_change {
            return Vec::new();
        }
        self.snapshot(plan);
        let spawned = self.spawn_all(plan);
        self.record_topology(plan);
        spawned
    }

    fn spawn_all(&mut self, plan: &MorphogenesisPlan) -> Vec<String> {
        let mut ids = Vec::new();
        for phenotype in plan.spawns.iter() {
            let request = AgentIncarnationRequest {
                phenotype: phenotype.clone(),
                mission_scope: String::from("scope_courant"),
                capabilities: vec![String::from("analyse")],
                authority_profile: String::from("worker_verifie"),
                strategy_envelope: vec![String::from("falsification")],
                cognitive_recipe: vec![String::from("adversarial")],
                prefer_independent_model: true,
                budget_tokens: 5000,
                ttl_minutes: 20,
                autonomy: AutonomyLevel::AdaptiveWorker,
            };
            if let Ok(agent) = self.incarnation.incarnate(&request) {
                ids.push(agent.agent_id.clone());
                self.state.collective.members.push(agent.agent_id);
            }
        }
        ids
    }

    fn record_topology(&mut self, plan: &MorphogenesisPlan) {
        if let Some(change) = plan.topology_changes.first() {
            self.current_topology.clone_from(&change.to);
            self.state
                .history
                .morphology_history
                .push(change.to.clone());
        }
    }

    fn snapshot(&mut self, plan: &MorphogenesisPlan) {
        let id = format!(
            "commit_{}_{}",
            self.commits.len() + 1,
            plan.reason.replace(' ', "_")
        );
        self.commits.push(id.clone());
        self.state.history.agent_git_head = Some(id);
        self.state.resilience.checkpoints.push(plan.reason.clone());
    }

    fn close_step(&mut self, input: &StepInput, plan: &MorphogenesisPlan) {
        let update = EpistemicUpdate {
            verified_claims: Vec::new(),
            new_contradictions: Vec::new(),
            resolved_gaps: Vec::new(),
        };
        self.state.revise_epistemics(&update);
        if input.success {
            self.state
                .history
                .recent_successes
                .push(plan.reason.clone());
        }
        self.update_health();
    }

    fn update_health(&mut self) {
        let health = self.collective_health();
        if health.monoculture {
            self.state.cognition.diversity_score += 0.05;
        }
    }

    /// Sante collective : derivee de l'etat courant.
    pub fn collective_health(&self) -> CollectiveHealth {
        CollectiveHealth {
            flailing: self.state.history.morphology_history.len() > 5,
            starvation: self.state.slot_pressure() > 0.95,
            storm: self.state.collective.health_summary.len() > 50,
            monoculture: self.state.cognition.diversity_score < 0.25,
            error_correlation: self.state.history.recent_failures.len() as f64 * 0.1,
            exhaustion: self.state.budget_pressure() > 0.95,
        }
    }

    /// Diversite : cognitive, modeles, independance des preuves.
    pub fn diversity(&self) -> f64 {
        self.state.cognition.diversity_score.clamp(0.0, 1.0)
    }

    /// Rapport final expliquant le comportement de l'organisme.
    pub fn mission_report(&self, verified: bool) -> KernelMissionReport {
        KernelMissionReport {
            objective: self.state.mission.objective.clone().unwrap_or_default(),
            verified,
            initial_morphology: self.initial_topology.clone(),
            final_morphology: self.current_topology.clone(),
            transitions: self.state.history.morphology_history.clone(),
            agents_used: self.state.collective.members.clone(),
            cognitive_changes: self.state.cognition.active_recipes.clone(),
            strategies: self.state.cognition.strategy_trajectories.clone(),
            procedures: self.state.procedures.active.clone(),
            tokens: self.state.resources.tokens_used,
            latency_ms: self.state.resources.latency_ms,
            evidence: self.state.epistemics.claims.clone(),
            failed_paths: self.state.history.recent_failures.clone(),
            learned: self.state.history.recent_successes.clone(),
        }
    }
}

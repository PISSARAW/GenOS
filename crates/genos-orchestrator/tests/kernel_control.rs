use genos_orchestrator::kernel_cycle::{ControlKernel, StepInput};
use genos_orchestrator::kernel_diagnosis::{diagnose, DiagnosisInput, FailureType};
use genos_orchestrator::kernel_incarnation::{AgentIncarnationRequest, AgentIncarnationService, AutonomyLevel};
use genos_orchestrator::kernel_morphogenesis::{HysteresisPolicy, MorphogenesisPlanner, PlanInput};
use genos_orchestrator::kernel_resolvers::{resolve_all, ResolverInput};
use genos_orchestrator::kernel_state::{Observations, OrchestratorState};
use std::time::Duration;

fn state_with_contradiction() -> OrchestratorState {
    let mut state = OrchestratorState::new("corriger auth");
    state.epistemics.contradictions.push(String::from("A et non-A"));
    state.cognition.diversity_score = 0.8;
    state
}

#[test]
fn diagnose_classifie_epistemique_avant_topologie() {
    let state = state_with_contradiction();
    let input = DiagnosisInput { state: &state, no_progress: true, worker_error_rate: 0.1 };
    let diagnosis = diagnose(&input);
    assert_eq!(diagnosis.failure, FailureType::Epistemic);
}

#[test]
fn resolvers_proposent_verifier_sur_contradiction() {
    let state = state_with_contradiction();
    let input = DiagnosisInput { state: &state, no_progress: true, worker_error_rate: 0.1 };
    let diagnosis = diagnose(&input);
    let resolver_in = ResolverInput { state: &state, diagnosis: &diagnosis };
    let proposals = resolve_all(&resolver_in);
    assert!(proposals.items.iter().any(|p| p.action == "spawn_verifier"));
}

#[test]
fn planner_hysteresis_retourne_no_change_sur_gain_faible() {
    let mut planner = MorphogenesisPlanner::new(HysteresisPolicy {
        minimum_gain: 0.9,
        cooldown: Duration::from_secs(30),
        transition_budget: 1.0,
    });
    let state = OrchestratorState::new("mission");
    let diagnosis_in = DiagnosisInput { state: &state, no_progress: false, worker_error_rate: 0.0 };
    let diagnosis = diagnose(&diagnosis_in);
    let resolver_in = ResolverInput { state: &state, diagnosis: &diagnosis };
    let proposals = resolve_all(&resolver_in);
    let plan_in = PlanInput { proposals: &proposals, current_topology: "specialist_committee", reason: "test" };
    let plan = planner.plan(&plan_in);
    assert!(plan.decision_no_change);
}

#[test]
fn incarnation_refuse_sans_phenotype() {
    let mut service = AgentIncarnationService::new();
    let request = AgentIncarnationRequest {
        phenotype: String::new(),
        mission_scope: String::from("backend_auth"),
        capabilities: vec![String::from("analyse")],
        authority_profile: String::from("worker"),
        strategy_envelope: vec![String::from("falsification")],
        cognitive_recipe: vec![String::from("adversarial")],
        prefer_independent_model: true,
        budget_tokens: 5000,
        ttl_minutes: 20,
        autonomy: AutonomyLevel::AdaptiveWorker,
    };
    assert!(service.incarnate(&request).is_err());
}

#[test]
fn kernel_step_passe_par_gouvernance_et_versionne() {
    let mut kernel = ControlKernel::new("corriger auth");
    kernel.state.epistemics.contradictions.push(String::from("A et non-A"));
    kernel.state.cognition.diversity_score = 0.8;
    let outcome = kernel.step(&Observations::default(), &StepInput { no_progress: true, worker_error_rate: 0.1, success: false });
    assert!(outcome.governance.allowed);
    assert!(kernel.state.history.agent_git_head.is_some());
    let report = kernel.mission_report(false);
    assert_eq!(report.objective, "corriger auth");
}

#[test]
fn scout_ne_peut_pas_changer_topologie() {
    assert!(!AutonomyLevel::ScoutCell.can_change_topology());
    assert!(!AutonomyLevel::ScoutCell.can_spawn());
    assert!(AutonomyLevel::PrincipalOrchestrator.can_change_topology());
}

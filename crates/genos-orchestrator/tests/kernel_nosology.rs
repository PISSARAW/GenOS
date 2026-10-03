use genos_orchestrator::kernel_cycle::{ControlKernel, StepInput};
use genos_orchestrator::kernel_diagnosis::{diagnose, DiagnosisInput, FailureType};
use genos_orchestrator::kernel_state::{ClinicalSignal, Observations};

fn input(no_progress: bool) -> StepInput {
    StepInput { no_progress, worker_error_rate: 0.0 }
}

#[test]
fn signal_non_confirme_ne_devient_pas_une_pathologie() {
    let mut kernel = ControlKernel::new("surveiller agent");
    let mut observations = Observations::default();
    observations.clinical_signals.push(ClinicalSignal {
        signal_id: String::from("signal-1"), agent_id: String::from("agent-1"),
        pathology_type: String::from("iatrogenic_toxicity"), confirmed: false,
        confidence: 0.95, evidence_ref: String::from("evidence-1"),
    });
    kernel.state.integrate_observations(&observations);
    let diagnosis = diagnose(&DiagnosisInput { state: &kernel.state, no_progress: false, worker_error_rate: 0.0 });
    assert_ne!(diagnosis.failure, FailureType::Pathological);
    assert!(kernel.state.resilience.isolated_agents.is_empty());
}

#[test]
fn pathologie_confirmee_isole_l_agent_concerne() {
    let mut kernel = ControlKernel::new("isoler agent malade");
    let mut observations = Observations::default();
    observations.clinical_signals.push(ClinicalSignal {
        signal_id: String::from("signal-2"), agent_id: String::from("agent-2"),
        pathology_type: String::from("quarantine_breach"), confirmed: true,
        confidence: 0.9, evidence_ref: String::from("evidence-2"),
    });
    let outcome = kernel.step(&observations, &input(false));
    assert_eq!(kernel.state.resilience.isolated_agents, vec![String::from("agent-2")]);
    assert!(outcome.plan_applied);
}

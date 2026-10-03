use genos_orchestrator::kernel_cycle::{ControlKernel, StepInput};
use genos_orchestrator::kernel_state::Observations;

#[test]
fn destination_topologique_non_resolue_ne_change_pas_la_topologie() {
    let mut kernel = ControlKernel::new("corriger auth");
    let before = kernel.current_topology.clone();
    kernel.step(&Observations::default(), &StepInput {
        no_progress: true,
        worker_error_rate: 0.0,
    });
    assert_eq!(kernel.current_topology, before);
    assert!(kernel.state.history.morphology_history.is_empty());
    assert!(kernel.state.history.agent_git_head.is_none());
}

use genos_orchestrator::kernel_cycle::{ControlKernel, StepInput};
use genos_orchestrator::kernel_state::Observations;

#[test]
fn topology_suspecte_sans_destination_ne_change_pas_le_collectif() {
    let mut kernel = ControlKernel::new("corriger auth");
    let before = kernel.current_topology.clone();
    let outcome = kernel.step(&Observations::default(), &StepInput {
        no_progress: true,
        worker_error_rate: 0.0,
        success: false,
    });
    assert!(!outcome.plan_applied);
    assert_eq!(kernel.current_topology, before);
    assert!(kernel.commits.is_empty());
}

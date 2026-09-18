use genos_orchestrator::{GenosEcosystem, Goal};

#[test]
fn tick_runs_creativity_before_decision_and_exposes_trace() {
    let mut ecosystem = GenosEcosystem::new("creative-integration");

    let report = ecosystem.tick(&Goal::Explore);

    assert!(!report.creative_tasks.is_empty());
    assert!(
        report
            .creative_tasks
            .iter()
            .all(|task| !task.expected_evidence.is_empty())
    );
    assert!(ecosystem.orchestrator.creativity_metrics().dreams_generated >= 1);
}

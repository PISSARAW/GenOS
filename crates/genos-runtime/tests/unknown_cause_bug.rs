use genos_runtime::{
    run_bug_investigation, AgentPrimitive, BugInvestigationManifest, HypothesisVerdict,
    PrimitiveStatus,
};
use std::collections::HashSet;
use std::path::PathBuf;

#[tokio::test]
async fn investigation_preserves_the_fix_and_every_eliminated_explanation() {
    let example_root =
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../examples/unknown-cause-bug");
    let manifest_path = example_root.join("experiment.yaml");
    let mut manifest: BugInvestigationManifest =
        serde_yaml::from_slice(&std::fs::read(&manifest_path).expect("manifest missing"))
            .expect("manifest invalid");
    manifest.seed_dir = example_root.join(&manifest.seed_dir);
    let state = tempfile::tempdir().unwrap();

    let report = run_bug_investigation(manifest, state.path())
        .await
        .expect("bug investigation failed");

    assert_eq!(report.baseline_evidence.len(), 3);
    assert!(report
        .baseline_evidence
        .iter()
        .all(|evidence| !evidence.passed));
    assert_eq!(report.investigations.len(), 7);
    assert_eq!(report.explanation_space.len(), 7);
    assert_eq!(report.rejected_hypothesis_ids.len(), 6);
    assert_eq!(report.lineage.edges.len(), 7);
    assert_eq!(
        report
            .selected_fix
            .as_ref()
            .map(|fix| fix.hypothesis_id.as_str()),
        Some("stale-configuration")
    );
    assert!(report
        .investigations
        .iter()
        .filter(|investigation| { investigation.verdict == HypothesisVerdict::Supported })
        .all(|investigation| investigation
            .evidence
            .iter()
            .all(|evidence| evidence.passed)));
    assert!(report
        .investigations
        .iter()
        .filter(|investigation| { investigation.verdict == HypothesisVerdict::Rejected })
        .all(|investigation| {
            investigation.evidence.len() == 3
                && investigation
                    .evidence
                    .iter()
                    .any(|evidence| !evidence.passed)
        }));
    assert!(report.explanation_space.iter().all(|explanation| {
        explanation
            .evidence
            .iter()
            .any(|evidence| evidence.contains("test 18") || evidence.contains("trace 212"))
    }));
    assert_eq!(
        report
            .investigations
            .iter()
            .map(|investigation| &investigation.world_id)
            .collect::<HashSet<_>>()
            .len(),
        7
    );
    assert!(report.primitive_trace.contains(AgentPrimitive::Init));
    assert_eq!(report.primitive_trace.count(AgentPrimitive::Fork), 7);
    assert_eq!(report.primitive_trace.count(AgentPrimitive::Diff), 7);
    assert!(report.primitive_trace.invocations.iter().any(|invocation| {
        invocation.primitive == AgentPrimitive::Merge
            && invocation.status == PrimitiveStatus::Deferred
    }));
}

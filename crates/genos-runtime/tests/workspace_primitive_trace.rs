use genos_runtime::{run_workspace_experiment, AgentPrimitive, WorkspaceExperimentManifest};
use std::path::PathBuf;

#[tokio::test]
async fn workspace_projects_emit_the_canonical_agent_lifecycle() {
    let example_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../examples/calculator-counterfactual-demo");
    let mut manifest: WorkspaceExperimentManifest = serde_yaml::from_slice(
        &std::fs::read(example_root.join("experiment.yaml")).expect("manifest missing"),
    )
    .expect("manifest invalid");
    manifest.seed_dir = example_root.join(&manifest.seed_dir);
    let state = tempfile::tempdir().unwrap();

    let report = run_workspace_experiment(manifest, state.path())
        .await
        .expect("workspace experiment failed");

    assert!(report.primitive_trace.contains(AgentPrimitive::Init));
    assert!(report.primitive_trace.contains(AgentPrimitive::Snapshot));
    assert_eq!(report.primitive_trace.count(AgentPrimitive::Fork), 3);
    assert_eq!(report.primitive_trace.count(AgentPrimitive::Run), 3);
    assert_eq!(report.primitive_trace.count(AgentPrimitive::Diff), 3);
    assert!(report.primitive_trace.contains(AgentPrimitive::Merge));
    assert!(report.primitive_trace.contains(AgentPrimitive::Lineage));
}

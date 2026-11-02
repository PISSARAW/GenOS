use genos_orchestrator::mission_protocols::{Binding, RunSpec, Store, WorkerJob, WorkerRole, digest};
use genos_orchestrator::mission_protocols::process::{self, Launch, ProcessEvidence};
use tempfile::TempDir;

fn fixture() -> (TempDir, Store, Binding) {
    let directory = TempDir::new().unwrap();
    let executable = std::env::current_exe().unwrap();
    let mut store = Store::open(&directory.path().join("protocols.sqlite")).unwrap();
    let spec = RunSpec {
        mission_id: uuid::Uuid::new_v4().to_string(), workspace: directory.path().into(),
        objective: "un processus échoué ne vaut pas preuve métier".into(),
        input_path: "input.json".into(), expected_sum: None, timeout_ms: 180000,
        env_hash: process::executable_hash(&executable).unwrap(),
    };
    let binding = store.admit(&spec).unwrap();
    (directory, store, binding)
}

fn job(binding: &Binding) -> WorkerJob {
    WorkerJob {
        schema: "genos.rust-worker-job/v1".into(), binding_digest: digest(binding).unwrap(),
        operation_id: uuid::Uuid::new_v4().to_string(), worker_id: "producer".into(),
        role: WorkerRole::Producer, nonce: uuid::Uuid::new_v4().to_string(),
        source_hash: "a".repeat(64), context_hash: "not-an-applied-context".into(),
        env_hash: binding.env_hash.clone(), policy_hash: binding.policy_hash.clone(), input: vec![3],
    }
}

#[test]
fn observed_failed_child_cannot_become_accepted_evidence() {
    let (_directory, _store, binding) = fixture();
    let executable = std::env::current_exe().unwrap();
    let job = job(&binding);
    // The Rust test harness has no rust-protocol-worker command and exits unsuccessfully.
    let receipt = process::execute(&binding, Launch {
        executable: &executable, job: &job, maximum_ms: 1000,
    }).unwrap();
    receipt.assert_observation(&binding).unwrap();
    assert!(receipt.assert_binding(&binding).is_err());
    assert!(ProcessEvidence::collect(&binding,
        ([receipt.clone(), receipt.clone(), receipt], None)).is_err());
}

#[test]
fn changed_job_policy_is_rejected_before_process_launch() {
    let (_directory, _store, binding) = fixture();
    let executable = std::env::current_exe().unwrap();
    let mut job = job(&binding);
    job.policy_hash = "expanded permissions".into();
    let error = process::execute(&binding, Launch {
        executable: &executable, job: &job, maximum_ms: 1000,
    }).unwrap_err();
    assert!(error.contains("EXECUTABLE_OR_JOB_CHANGED"));
}

#[test]
fn oversized_native_job_is_rejected_before_process_launch() {
    let (_directory, _store, binding) = fixture();
    let executable = std::env::current_exe().unwrap();
    let mut job = job(&binding);
    job.operation_id = "a".repeat(256 * 1024);
    let error = process::execute(&binding, Launch {
        executable: &executable, job: &job, maximum_ms: 1000,
    }).unwrap_err();
    assert!(error.contains("JOB_TOO_LARGE"));
}

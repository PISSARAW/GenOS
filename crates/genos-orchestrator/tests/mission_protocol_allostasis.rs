use genos_orchestrator::mission_protocols::{Binding, RunSpec, Store, WorkerJob, WorkerRole, digest};
use genos_orchestrator::mission_protocols::allostasis::{self, Exposure, Limits};
use genos_orchestrator::mission_protocols::process::{self, Launch};
use tempfile::TempDir;

fn fixture() -> (TempDir, Store, Binding) {
    fixture_timeout(180000)
}

fn fixture_timeout(timeout_ms: u64) -> (TempDir, Store, Binding) {
    let directory = TempDir::new().unwrap();
    let executable = std::env::current_exe().unwrap();
    let mut store = Store::open(&directory.path().join("protocols.sqlite")).unwrap();
    let binding = store.admit(&RunSpec {
        mission_id: uuid::Uuid::new_v4().to_string(), workspace: directory.path().into(),
        objective: "usage réel irréversible et réserve protégée".into(), input_path: "input.json".into(),
        expected_sum: None, timeout_ms, env_hash: process::executable_hash(&executable).unwrap(),
    }).unwrap();
    (directory, store, binding)
}

fn job(binding: &Binding) -> WorkerJob {
    WorkerJob { schema: "genos.rust-worker-job/v1".into(), binding_digest: digest(binding).unwrap(),
        operation_id: "producer".into(), worker_id: "producer".into(), role: WorkerRole::Producer,
        nonce: uuid::Uuid::new_v4().to_string(), source_hash: "a".repeat(64), context_hash: "actual-failure".into(),
        env_hash: binding.env_hash.clone(), policy_hash: binding.policy_hash.clone(), input: vec![2, 3] }
}

#[test]
fn five_percent_reserve_and_unknown_exposure_survive_reopen() {
    let (directory, mut store, binding) = fixture();
    let pool = allostasis::reserve(&mut store, &binding, Limits { process_slots: 3, wall_ms: 1000 }).unwrap();
    assert_eq!((pool.protected_slots, pool.protected_ms), (1, 50));
    let input = Exposure { allocation_id: &pool.allocation_id, operation_id: "producer", maximum_ms: 950 };
    assert!(allostasis::expose(&mut store, &binding, input).unwrap().new_dispatch_authorized);
    allostasis::unknown(&mut store, &binding, "producer").unwrap();
    drop(store);
    let mut restored = Store::open(&directory.path().join("protocols.sqlite")).unwrap();
    assert_eq!(allostasis::state(&mut restored, &binding).unwrap().held_ms, 950);
    assert!(!allostasis::expose(&mut restored, &binding, Exposure { allocation_id: &pool.allocation_id,
        operation_id: "producer", maximum_ms: 950 }).unwrap().new_dispatch_authorized);
    assert!(allostasis::release(&mut restored, &binding, &pool.allocation_id).unwrap_err().contains("RECONCILIATION"));
    assert!(allostasis::unknown(&mut restored, &binding, "unexposed").is_err());
}

#[test]
fn competing_connections_cannot_reserve_the_same_available_amount_twice() {
    let (directory, mut store, binding) = fixture();
    let pool = allostasis::reserve(&mut store, &binding, Limits { process_slots: 3, wall_ms: 8000 }).unwrap();
    let barrier = std::sync::Arc::new(std::sync::Barrier::new(2));
    let handles = (0..2).map(|index| {
        let path = directory.path().join("protocols.sqlite");
        let binding = binding.clone(); let id = pool.allocation_id.clone(); let barrier = barrier.clone();
        std::thread::spawn(move || {
            let mut connection = Store::open(&path).unwrap(); barrier.wait();
            allostasis::expose(&mut connection, &binding, Exposure { allocation_id: &id,
                operation_id: &format!("worker-{index}"), maximum_ms: 7000 }).is_ok()
        })
    }).collect::<Vec<_>>();
    assert_eq!(handles.into_iter().filter_map(|thread| thread.join().ok()).filter(|ok| *ok).count(), 1);
    assert_eq!(allostasis::state(&mut store, &binding).unwrap().held_ms, 7000);
}

#[test]
fn actual_failed_process_is_charged_once_and_release_cannot_refund_it() {
    let (_directory, mut store, binding) = fixture();
    let pool = allostasis::reserve(&mut store, &binding, Limits { process_slots: 3, wall_ms: 8000 }).unwrap();
    allostasis::expose(&mut store, &binding, Exposure { allocation_id: &pool.allocation_id,
        operation_id: "producer", maximum_ms: 1 }).unwrap();
    let executable = std::env::current_exe().unwrap();
    let request = job(&binding);
    // The test harness is a real child process, but has no installed worker command.
    let receipt = process::execute(&binding, Launch { executable: &executable, job: &request, maximum_ms: 1000 }).unwrap();
    assert!(receipt.assert_binding(&binding).is_err());
    let usage = allostasis::settle(&mut store, &binding, &receipt).unwrap();
    assert_eq!(allostasis::settle(&mut store, &binding, &receipt).unwrap(), usage);
    let state = allostasis::release(&mut store, &binding, &pool.allocation_id).unwrap();
    assert_eq!(state.spent_ms, receipt.elapsed_ms());
    assert_eq!((state.held_ms, state.active_slots, state.observed_processes), (0, 0, 1));
    assert!(state.released);
    assert!(allostasis::expose(&mut store, &binding, Exposure { allocation_id: &pool.allocation_id,
        operation_id: "verifier_a", maximum_ms: 1 }).is_err());
    inherited_accounting(&mut store, &binding, &state);
}

fn inherited_accounting(store: &mut Store, old: &Binding, state: &allostasis::State) {
    let checkpoint = store.checkpoint(old, &serde_json::json!({"phase":"usage-observed"})).unwrap();
    let next = store.prepare_successor(old).unwrap();
    store.handoff(old, &genos_orchestrator::mission_protocols::continuity::HandoffRequest {
        successor: next.clone(), checkpoint }).unwrap();
    assert!(allostasis::reserve(store, &next, Limits { process_slots: 3, wall_ms: 8001 })
        .unwrap_err().contains("AMPLIFICATION"));
    let pool = allostasis::reserve(store, &next, Limits { process_slots: 3, wall_ms: 8000 }).unwrap();
    let inherited = allostasis::state(store, &next).unwrap();
    assert_eq!((inherited.spent_ms, inherited.observed_processes), (state.spent_ms, 1));
    for operation in ["verifier_a", "verifier_b"] {
        allostasis::expose(store, &next, Exposure { allocation_id: &pool.allocation_id,
            operation_id: operation, maximum_ms: 1 }).unwrap();
    }
    assert!(allostasis::expose(store, &next, Exposure { allocation_id: &pool.allocation_id,
        operation_id: "fourth-process", maximum_ms: 1 }).is_err());
}

#[test]
fn allocations_cannot_amplify_admitted_deadline_or_process_profile() {
    let (_directory, mut store, binding) = fixture();
    assert!(allostasis::reserve(&mut store, &binding, Limits { process_slots: 4, wall_ms: 8000 }).is_err());
    assert!(allostasis::reserve(&mut store, &binding, Limits { process_slots: 3, wall_ms: 180001 }).is_err());
    let mut foreign = binding.clone(); foreign.actor_id = "other-actor".into();
    assert!(allostasis::reserve(&mut store, &foreign, Limits { process_slots: 3, wall_ms: 8000 }).is_err());
}

#[test]
fn known_observation_can_settle_after_expiry_without_authorizing_new_work() {
    let (_directory, mut store, binding) = fixture_timeout(1000);
    let pool = allostasis::reserve(&mut store, &binding, Limits { process_slots: 3, wall_ms: 1000 }).unwrap();
    allostasis::expose(&mut store, &binding, Exposure { allocation_id: &pool.allocation_id,
        operation_id: "producer", maximum_ms: 500 }).unwrap();
    let executable = std::env::current_exe().unwrap();
    let request = job(&binding);
    let receipt = process::execute(&binding, Launch { executable: &executable, job: &request, maximum_ms: 500 }).unwrap();
    let remaining = binding.expires_ms.saturating_sub(genos_orchestrator::mission_protocols::now_ms());
    std::thread::sleep(std::time::Duration::from_millis(remaining + 5));
    assert!(store.current(&binding).is_err());
    let observation = allostasis::settle(&mut store, &binding, &receipt).unwrap();
    assert_eq!(observation.elapsed_ms, receipt.elapsed_ms());
    assert!(allostasis::release(&mut store, &binding, &pool.allocation_id).unwrap().released);
    assert!(allostasis::reserve(&mut store, &binding, pool.limits).is_err());
}

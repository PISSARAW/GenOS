use genos_orchestrator::mission_protocols::{Binding, RunSpec, Store, raw_hash};
use genos_orchestrator::mission_protocols::continuity::HandoffRequest;
use genos_orchestrator::mission_protocols::morph_types::{Roster, RosterPlan};
use serde_json::json;
use std::sync::{Arc, Barrier};
use tempfile::TempDir;

fn fixture() -> (TempDir, Store, Binding) {
    let directory = TempDir::new().unwrap();
    let mut store = Store::open(&directory.path().join("protocols.sqlite")).unwrap();
    let binding = store.admit(&RunSpec {
        mission_id: uuid::Uuid::new_v4().to_string(), workspace: directory.path().into(),
        objective: "roster natif producteur et deux vérificateurs".into(), input_path: "input.json".into(),
        expected_sum: None, timeout_ms: 180000, env_hash: raw_hash(b"native-executable"),
    }).unwrap();
    (directory, store, binding)
}

fn initial_plan(binding: &Binding, transition: &str) -> RosterPlan {
    RosterPlan { transition_id: transition.into(), expected_version: 0,
        roster: Roster::for_binding(binding, 1) }
}

#[test]
fn prepare_does_not_install_and_commit_has_durable_exact_receipt() {
    let (directory, mut store, binding) = fixture();
    let plan = initial_plan(&binding, "first-topology");
    assert_eq!(store.prepare_roster(&binding, &plan).unwrap().status, "prepared");
    assert!(store.roster(&binding).is_err());
    let receipt = store.commit_roster(&binding, &plan).unwrap();
    assert_eq!(receipt.status, "committed");
    assert_eq!(receipt.roster.members.len(), 3);
    assert_eq!(receipt.roster.member("verifier_a").unwrap().actor_id,
        format!("{}:verifier_a", binding.run_id));
    drop(store);
    let mut resumed = Store::open(&directory.path().join("protocols.sqlite")).unwrap();
    assert_eq!(resumed.commit_roster(&binding, &plan).unwrap(), receipt);
    assert_eq!(resumed.roster(&binding).unwrap(), receipt.roster);
    let connection = rusqlite::Connection::open(directory.path().join("protocols.sqlite")).unwrap();
    let commits: u32 = connection.query_row("SELECT count(*) FROM rust_protocol_events
        WHERE protocol='MORPH' AND phase='COMMIT'", [], |row| row.get(0)).unwrap();
    assert_eq!(commits, 1);
}

#[test]
fn concurrent_transitions_share_one_irreversible_version_cas() {
    let (directory, mut store, binding) = fixture();
    let first = initial_plan(&binding, "first");
    let second = initial_plan(&binding, "second");
    store.prepare_roster(&binding, &first).unwrap();
    store.prepare_roster(&binding, &second).unwrap();
    drop(store);
    let barrier = Arc::new(Barrier::new(2));
    let mut joins = Vec::new();
    for plan in [first, second] {
        let path = directory.path().join("protocols.sqlite");
        let actor = binding.clone();
        let start = barrier.clone();
        joins.push(std::thread::spawn(move || {
            let mut store = Store::open(&path).unwrap();
            start.wait();
            store.commit_roster(&actor, &plan)
        }));
    }
    let results: Vec<_> = joins.into_iter().map(|j| j.join().unwrap()).collect();
    assert_eq!(results.iter().filter(|r| r.is_ok()).count(), 1);
    assert!(results.iter().filter_map(|r| r.as_ref().err()).all(|e| e.contains("CAS conflict")));
    let mut store = Store::open(&directory.path().join("protocols.sqlite")).unwrap();
    assert_eq!(store.roster(&binding).unwrap().version, 1);
}

#[test]
fn malformed_duplicate_or_foreign_worker_never_becomes_topology() {
    let (_directory, mut store, binding) = fixture();
    let mut plan = initial_plan(&binding, "bad-members");
    plan.roster.members[2] = plan.roster.members[1].clone();
    assert!(store.prepare_roster(&binding, &plan).is_err());
    let mut plan = initial_plan(&binding, "foreign-worker");
    plan.roster.members[1].actor_id = "different-run:verifier_a".into();
    assert!(store.prepare_roster(&binding, &plan).is_err());
    assert!(store.roster(&binding).is_err());
}

#[test]
fn succession_requires_real_rebind_and_old_run_cannot_change_membership() {
    let (_directory, mut store, old) = fixture();
    let source = store.ensure_roster(&old).unwrap();
    assert_eq!(store.ensure_roster(&old).unwrap(), source);
    let checkpoint = store.checkpoint(&old, &json!({"roster":source})).unwrap();
    let next = store.prepare_successor(&old).unwrap();
    store.handoff(&old, &HandoffRequest { successor: next.clone(), checkpoint }).unwrap();
    assert!(store.roster(&next).is_err());
    let installed = store.ensure_roster(&next).unwrap();
    assert_eq!(installed.version, 2);
    assert!(installed.members.iter().all(|m| m.actor_id.starts_with(&next.run_id)));
    assert!(store.ensure_roster(&old).is_err());
}

#[test]
fn transition_id_conflict_and_snapshot_corruption_fail_closed() {
    let (directory, mut store, binding) = fixture();
    let plan = initial_plan(&binding, "immutable-plan");
    store.prepare_roster(&binding, &plan).unwrap();
    let mut changed = plan.clone();
    changed.expected_version = 1;
    changed.roster.version = 2;
    assert!(store.prepare_roster(&binding, &changed).unwrap_err().contains("idempotency conflict"));
    let connection = rusqlite::Connection::open(directory.path().join("protocols.sqlite")).unwrap();
    connection.execute("UPDATE rust_protocol_morph SET source_json='{}'", []).unwrap();
    assert!(store.commit_roster(&binding, &plan).is_err());
    assert!(store.roster(&binding).is_err());
}

#[test]
fn two_missions_do_not_share_roster_or_version() {
    let (_directory, mut store, first) = fixture();
    let workspace = std::path::PathBuf::from(&first.workspace);
    let second = store.admit(&RunSpec {
        mission_id: uuid::Uuid::new_v4().to_string(), workspace,
        objective: "independent native mission".into(), input_path: "input.json".into(),
        expected_sum: None, timeout_ms: 180000, env_hash: first.env_hash.clone(),
    }).unwrap();
    let one = store.ensure_roster(&first).unwrap();
    let two = store.ensure_roster(&second).unwrap();
    assert_eq!(one.version, 1);
    assert_eq!(two.version, 1);
    assert_ne!(one.members, two.members);
}

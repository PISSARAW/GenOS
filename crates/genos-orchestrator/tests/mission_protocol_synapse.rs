use genos_orchestrator::mission_protocols::{RunSpec, Store, WorkerRole, digest, raw_hash};
use genos_orchestrator::mission_protocols::synapse::{self, ContextInput};
use rusqlite::params;
use tempfile::TempDir;

fn fixture() -> (TempDir, Store, genos_orchestrator::mission_protocols::Binding) {
    let directory = TempDir::new().unwrap();
    let mut store = Store::open(&directory.path().join("protocols.sqlite")).unwrap();
    let spec = RunSpec {
        mission_id: uuid::Uuid::new_v4().to_string(), workspace: directory.path().into(),
        objective: "calcul entier avec contexte réellement consommé".into(),
        input_path: "input.json".into(), expected_sum: None, timeout_ms: 180000,
        env_hash: raw_hash(b"installed-native-test-executable"),
    };
    let binding = store.admit(&spec).unwrap();
    (directory, store, binding)
}

fn input(role: WorkerRole) -> ContextInput {
    ContextInput { source_hash: raw_hash(b"[7,-2,3]"), input: vec![7, -2, 3],
        role, base_generation: 0, world_hash: raw_hash(b"native-base"), world_generation: 0 }
}

#[test]
fn all_three_workers_consume_same_content_with_distinct_audiences() {
    let (_directory, mut store, binding) = fixture();
    let mut contexts = Vec::new();
    for role in [WorkerRole::Producer, WorkerRole::VerifierA, WorkerRole::VerifierB] {
        synapse::apply(&mut store, &binding, &input(role)).unwrap();
        contexts.push(synapse::read(&store, &binding, role).unwrap());
    }
    assert_eq!(contexts[0].input, vec![7, -2, 3]);
    assert_eq!(contexts[0].input_hash, digest(&vec![7_i64, -2, 3]).unwrap());
    assert!(contexts.iter().all(|value| value.context_hash == contexts[0].context_hash));
    assert_ne!(contexts[0].audience, contexts[1].audience);
    assert_ne!(contexts[1].audience, contexts[2].audience);
}

#[test]
fn stale_base_persists_canonical_request_without_overwriting_context() {
    let (directory, mut store, binding) = fixture();
    let original = input(WorkerRole::Producer);
    synapse::apply(&mut store, &binding, &original).unwrap();
    let mut changed = original.clone();
    changed.input = vec![100];
    changed.source_hash = raw_hash(b"[100]");
    assert!(synapse::apply(&mut store, &binding, &changed).unwrap_err().contains("BASE_STALE"));
    assert_eq!(synapse::read(&store, &binding, WorkerRole::Producer).unwrap().input, original.input);
    let connection = rusqlite::Connection::open(directory.path().join("protocols.sqlite")).unwrap();
    let requests: u32 = connection.query_row("SELECT count(*) FROM rust_protocol_events
        WHERE run_id=?1 AND protocol='SYNAPSE' AND phase='REQUEST_MISSING'",
        [&binding.run_id], |row| row.get(0)).unwrap();
    assert_eq!(requests, 1);
    changed.base_generation = 1;
    assert_eq!(synapse::apply(&mut store, &binding, &changed).unwrap().generation, 2);
}

#[test]
fn audience_or_schema_tampering_is_never_guessed() {
    let (directory, mut store, binding) = fixture();
    let applied = synapse::apply(&mut store, &binding, &input(WorkerRole::Producer)).unwrap();
    let connection = rusqlite::Connection::open(directory.path().join("protocols.sqlite")).unwrap();
    for field in ["audience", "schema"] {
        let mut value = serde_json::to_value(&applied).unwrap();
        value[field] = "other".into();
        connection.execute("UPDATE rust_mission_synapse SET context_json=?1 WHERE run_id=?2",
            params![serde_json::to_string(&value).unwrap(), binding.run_id]).unwrap();
        assert!(synapse::read(&store, &binding, WorkerRole::Producer)
            .unwrap_err().contains("SCHEMA_OR_AUDIENCE"));
    }
}

#[test]
fn context_cannot_extend_or_replace_native_authority() {
    let (_directory, mut store, binding) = fixture();
    let context = input(WorkerRole::Producer);
    synapse::apply(&mut store, &binding, &context).unwrap();
    let mut forged = binding.clone();
    forged.policy_hash = raw_hash(b"expanded authority");
    assert!(synapse::read(&store, &forged, WorkerRole::Producer).is_err());
    assert!(synapse::apply(&mut store, &forged, &context).is_err());
    let replay = synapse::apply(&mut store, &binding, &context).unwrap();
    assert_eq!(replay.generation, 1);
}

#[test]
fn missing_context_requires_canonical_input_before_worker_dispatch() {
    let (_directory, store, binding) = fixture();
    assert!(synapse::read(&store, &binding, WorkerRole::Producer)
        .unwrap_err().contains("CONTEXT_MISSING"));
}

#[test]
fn same_input_against_another_cas_base_requires_a_new_proof() {
    let (_directory, mut store, binding) = fixture();
    let mut context = input(WorkerRole::Producer);
    let previous = synapse::apply(&mut store, &binding, &context).unwrap();
    context.base_generation = 1;
    context.world_hash = raw_hash(b"a different native base");
    context.world_generation = 1;
    let rebased = synapse::apply(&mut store, &binding, &context).unwrap();
    assert_eq!(previous.input_hash, rebased.input_hash);
    assert_ne!(previous.context_hash, rebased.context_hash);
    assert_eq!(rebased.generation, 2);
}

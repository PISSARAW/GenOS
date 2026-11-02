use genos_orchestrator::mission_protocols::{Binding, RunSpec, Store, raw_hash};
use genos_orchestrator::mission_protocols::gqwf;
use tempfile::TempDir;

fn fixture() -> (TempDir, Store, Binding) {
    let directory = TempDir::new().unwrap();
    let mut store = Store::open(&directory.path().join("protocols.sqlite")).unwrap();
    let binding = store.admit(&RunSpec {
        mission_id: uuid::Uuid::new_v4().to_string(), workspace: directory.path().into(),
        objective: "publication CAS atomique et qualification explicite".into(), input_path: "input.json".into(),
        expected_sum: None, timeout_ms: 180000, env_hash: raw_hash(b"native-runtime"),
    }).unwrap();
    (directory, store, binding)
}

#[test]
fn actual_bootstrap_cas_is_unexecuted_and_initialization_never_resets_head() {
    let (directory, mut store, binding) = fixture();
    let initial = gqwf::initialize(&mut store, &binding).unwrap();
    assert_eq!((initial.root_hash.as_str(), initial.generation), (raw_hash(b"null").as_str(), 0));
    assert_eq!(gqwf::initialize(&mut store, &binding).unwrap(), initial);
    let connection = rusqlite::Connection::open(directory.path().join("protocols.sqlite")).unwrap();
    let bytes: Vec<u8> = connection.query_row("SELECT bytes FROM protocol_gqwf_objects WHERE hash=$1",
        [&initial.root_hash], |row| row.get(0)).unwrap();
    assert_eq!(bytes, b"null");
    let phase: String = connection.query_row("SELECT phase FROM rust_protocol_events WHERE protocol='GQWF'",
        [], |row| row.get(0)).unwrap();
    assert_eq!(phase, "INITIALIZE_UNEXECUTED_BASE");
    assert!(gqwf::publication(&mut store, &binding, "unknown-candidate").unwrap().is_none());
    assert!(gqwf::result_bytes(&mut store, &binding, "unknown-candidate").is_err());
}

#[test]
fn changed_physical_object_is_not_a_valid_head_even_with_original_hash_key() {
    let (directory, mut store, binding) = fixture();
    gqwf::initialize(&mut store, &binding).unwrap();
    let connection = rusqlite::Connection::open(directory.path().join("protocols.sqlite")).unwrap();
    connection.execute("UPDATE protocol_gqwf_objects SET bytes=$1", [b"corrupt".as_slice()]).unwrap();
    assert!(gqwf::head(&mut store, &binding).is_err());
    assert!(gqwf::initialize(&mut store, &binding).is_err());
}

#[test]
fn namespace_and_authority_cannot_be_swapped_by_passing_another_binding() {
    let (_directory, mut store, binding) = fixture();
    gqwf::initialize(&mut store, &binding).unwrap();
    let mut forged = binding.clone(); forged.workspace.push_str("-other");
    assert!(gqwf::head(&mut store, &forged).is_err());
    forged = binding.clone(); forged.mission_id = uuid::Uuid::new_v4().to_string();
    assert!(gqwf::initialize(&mut store, &forged).is_err());
    assert!(gqwf::prepare(&mut store, &binding, "hash-is-not-proof").is_err());
}

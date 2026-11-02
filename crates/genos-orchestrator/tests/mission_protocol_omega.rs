use genos_orchestrator::mission_protocols::{Binding, RunSpec, Store, raw_hash};
use genos_orchestrator::mission_protocols::omega::{self, Data, Kind, Request};
use tempfile::TempDir;

fn fixture() -> (TempDir, Store, Binding) {
    let directory = TempDir::new().unwrap();
    let mut store = Store::open(&directory.path().join("protocols.sqlite")).unwrap();
    let binding = store.admit(&RunSpec {
        mission_id: uuid::Uuid::new_v4().to_string(), workspace: directory.path().into(),
        objective: "graphe natif fermé avec reprise sans relance".into(), input_path: "input.json".into(),
        expected_sum: None, timeout_ms: 180000, env_hash: raw_hash(b"native-runtime"),
    }).unwrap();
    (directory, store, binding)
}

fn request(kind: Kind, operation_id: &str) -> Request {
    Request { operation_id: operation_id.into(), kind, source_hash: raw_hash(b"[2,3]"),
        base_hash: raw_hash(b"null"), context_hash: "source-base-input-context".into() }
}

fn read_and_select(store: &mut Store, binding: &Binding) {
    for (kind, id) in [(Kind::Read, "read"), (Kind::Select, "select")] {
        assert!(omega::request(store, binding, request(kind, id)).unwrap().new_dispatch_authorized);
        omega::record_data(store, binding, Data { operation_id: id, source: b"[2,3]" }).unwrap();
    }
}

#[test]
fn only_installed_capabilities_and_order_can_be_admitted() {
    let (_directory, mut store, binding) = fixture();
    assert!(omega::request(&mut store, &binding, request(Kind::Read, "arbitrary-call")).is_err());
    assert!(omega::request(&mut store, &binding, request(Kind::CheckIndependent, "verifier_a")).is_err());
    assert!(omega::request(&mut store, &binding, request(Kind::EmitCas, "emit")).is_err());
    read_and_select(&mut store, &binding);
    let admitted = omega::request(&mut store, &binding, request(Kind::CallIntegerSum, "producer")).unwrap();
    assert!(admitted.new_dispatch_authorized);
    assert!(admitted.receipt.is_none());
}

#[test]
fn crash_gap_is_unknown_and_never_authorizes_second_dispatch() {
    let (directory, mut store, binding) = fixture();
    read_and_select(&mut store, &binding);
    let operation = request(Kind::CallIntegerSum, "producer");
    omega::request(&mut store, &binding, operation.clone()).unwrap();
    drop(store);
    let mut restored = Store::open(&directory.path().join("protocols.sqlite")).unwrap();
    let replay = omega::request(&mut restored, &binding, operation.clone()).unwrap();
    assert_eq!(replay.status, "outcome_unknown");
    assert!(!replay.new_dispatch_authorized);
    let mut conflicting = operation;
    conflicting.context_hash = "different-context".into();
    assert!(omega::request(&mut restored, &binding, conflicting).unwrap_err().contains("CONFLICT"));
}

#[test]
fn completed_data_receipts_replay_but_changed_bytes_cannot_be_recorded() {
    let (directory, mut store, binding) = fixture();
    read_and_select(&mut store, &binding);
    let first = omega::request(&mut store, &binding, request(Kind::Read, "read")).unwrap();
    assert_eq!(first.status, "completed");
    assert!(!first.new_dispatch_authorized);
    assert!(omega::record_data(&mut store, &binding, Data { operation_id: "read", source: b"[2,4]" }).is_err());
    let connection = rusqlite::Connection::open(directory.path().join("protocols.sqlite")).unwrap();
    connection.execute("UPDATE protocol_omega_operations SET request_json='{}' WHERE operation_id='select'", []).unwrap();
    assert!(omega::request(&mut store, &binding, request(Kind::Select, "select")).is_err());
}

#[test]
fn fixed_capability_authorization_is_journaled_before_any_process_result() {
    let (directory, mut store, binding) = fixture();
    omega::request(&mut store, &binding, request(Kind::Read, "read")).unwrap();
    let connection = rusqlite::Connection::open(directory.path().join("protocols.sqlite")).unwrap();
    let phases = connection.prepare("SELECT phase FROM rust_protocol_events WHERE protocol='OMEGA' ORDER BY sequence")
        .unwrap().query_map([], |row| row.get::<_, String>(0)).unwrap().collect::<Result<Vec<_>, _>>().unwrap();
    assert_eq!(phases, ["REQUEST_EFFECT", "AUTHORIZE_EFFECT"]);
}

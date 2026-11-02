use genos_orchestrator::mission_protocols::{Binding, RunSpec, Store, digest};

fn setup(root: &std::path::Path) -> RunSpec {
    RunSpec { mission_id: uuid::Uuid::new_v4().to_string(), workspace: root.into(),
        objective:"Compute the declared integer sum".into(), input_path:"numbers.json".into(),
        expected_sum:Some(6),timeout_ms:180000,env_hash:"a".repeat(64) }
}

#[test]
fn durable_binding_reopens_without_reallocating_identity() {
    let root = tempfile::tempdir().unwrap();
    let database = root.path().join("runtime.sqlite");
    let spec = setup(root.path());
    let binding = Store::open(&database).unwrap().admit(&spec).unwrap();
    let mut reopened = Store::open(&database).unwrap();
    assert_eq!(reopened.binding(&spec.mission_id).unwrap(), binding);
    reopened.current(&binding).unwrap();
    assert!(reopened.admit(&spec).is_err());
}

#[test]
fn forged_scope_or_expiry_never_reaches_business_transaction() {
    let root = tempfile::tempdir().unwrap();
    let mut store = Store::open(&root.path().join("runtime.sqlite")).unwrap();
    let binding = store.admit(&setup(root.path())).unwrap();
    let mut forged: Binding = binding.clone();
    forged.workspace = root.path().join("foreign").to_string_lossy().into();
    let mut reached = false;
    assert!(store.transaction(&forged, |_| { reached=true; Ok(()) }).is_err());
    forged = binding.clone();
    forged.expires_ms += 100000;
    assert!(store.current(&forged).is_err());
    assert!(!reached);
    assert_eq!(digest(&binding).unwrap(), digest(&serde_json::to_value(&binding).unwrap()).unwrap());
}

#[test]
fn successor_is_prepared_without_receiving_current_authority() {
    let root = tempfile::tempdir().unwrap();
    let mut store = Store::open(&root.path().join("runtime.sqlite")).unwrap();
    let binding = store.admit(&setup(root.path())).unwrap();
    let successor = store.prepare_successor(&binding).unwrap();
    assert_eq!(successor.generation,binding.generation+1);
    assert_ne!(successor.run_id,binding.run_id);
    store.current(&binding).unwrap();
    assert!(store.current(&successor).is_err());
}

use genos_orchestrator::mission_protocols::{Binding, RunSpec, Store, digest, raw_hash};
use genos_orchestrator::mission_protocols::continuity::{self, HandoffRequest};
use genos_orchestrator::mission_protocols::continuity_effect::EffectAdmission;
use serde_json::json;
use tempfile::TempDir;

fn fixture() -> (TempDir, Store, Binding) {
    let directory = TempDir::new().unwrap();
    let mut store = Store::open(&directory.path().join("protocols.sqlite")).unwrap();
    let binding = store.admit(&RunSpec {
        mission_id: uuid::Uuid::new_v4().to_string(), workspace: directory.path().into(),
        objective: "succession native avec fencing".into(), input_path: "input.json".into(),
        expected_sum: None, timeout_ms: 180000, env_hash: raw_hash(b"native-executable"),
    }).unwrap();
    (directory, store, binding)
}

#[test]
fn handoff_fences_old_incarnation_at_real_sql_effect_and_survives_restart() {
    let (directory, mut store, old) = fixture();
    let checkpoint = store.checkpoint(&old, &json!({"cursor":7,"open":["verify"]})).unwrap();
    let next = store.prepare_successor(&old).unwrap();
    let request = HandoffRequest { successor: next.clone(), checkpoint: checkpoint.clone() };
    let receipt = store.handoff(&old, &request).unwrap();
    assert_eq!(receipt.generation, 2);
    assert_eq!(store.handoff(&old, &request).unwrap(), receipt);
    drop(store);
    let mut restored = Store::open(&directory.path().join("protocols.sqlite")).unwrap();
    let mut stale_effect_called = false;
    let stale = restored.transaction(&old, |_tx| { stale_effect_called = true; Ok(()) });
    assert!(stale.is_err());
    assert!(!stale_effect_called);
    restored.transaction(&next, |tx| {
        continuity::fence(tx, &next)?;
        tx.execute_batch("CREATE TABLE actual_effect(value INTEGER); INSERT INTO actual_effect VALUES(1);")
            .map_err(|e| e.to_string())
    }).unwrap();
    assert_eq!(restored.restore_checkpoint(&next, &checkpoint).unwrap()["cursor"], 7);
    assert!(restored.restore_checkpoint(&old, &checkpoint).is_err());
    assert_eq!(restored.binding(&old.mission_id).unwrap(), next);
}

#[test]
fn unknown_effect_is_not_redispatched_after_restart_or_succession() {
    let (directory, mut store, old) = fixture();
    let request = json!({"destination":"local-result","value":42});
    assert_eq!(store.begin_effect(&old, ("publish", &request)).unwrap(), EffectAdmission::Start);
    drop(store);
    let mut resumed = Store::open(&directory.path().join("protocols.sqlite")).unwrap();
    assert!(resumed.begin_effect(&old, ("publish", &request)).unwrap_err().contains("OUTCOME_UNKNOWN"));
    let checkpoint = resumed.checkpoint(&old, &json!({"pending":"publish"})).unwrap();
    let next = resumed.prepare_successor(&old).unwrap();
    resumed.handoff(&old, &HandoffRequest { successor: next.clone(), checkpoint }).unwrap();
    assert!(resumed.begin_effect(&next, ("publish", &request)).unwrap_err().contains("OUTCOME_UNKNOWN"));
    assert!(resumed.complete_effect(&next, ("publish", &json!({"pretend":true}))).is_err());
}

#[test]
fn completed_effect_returns_exact_result_without_running_again() {
    let (_directory, mut store, binding) = fixture();
    let request = json!({"value":42});
    let result = json!({"receipt":"actual-result"});
    store.begin_effect(&binding, ("publish", &request)).unwrap();
    store.complete_effect(&binding, ("publish", &result)).unwrap();
    assert_eq!(store.begin_effect(&binding, ("publish", &request)).unwrap(), EffectAdmission::Completed(result));
    assert!(store.begin_effect(&binding, ("publish", &json!({"value":43}))).is_err());
}

#[test]
fn corrupt_or_foreign_checkpoint_cannot_activate_successor() {
    let (directory, mut store, old) = fixture();
    let checkpoint = store.checkpoint(&old, &json!({"cursor":1})).unwrap();
    let next = store.prepare_successor(&old).unwrap();
    let connection = rusqlite::Connection::open(directory.path().join("protocols.sqlite")).unwrap();
    connection.execute("UPDATE rust_protocol_checkpoints SET snapshot_json='{}'", []).unwrap();
    assert!(store.handoff(&old, &HandoffRequest { successor: next.clone(), checkpoint }).is_err());
    assert!(store.current(&old).is_ok());
    assert!(store.current(&next).is_err());
}

#[test]
fn successor_cannot_change_actor_environment_or_policy() {
    let (_directory, mut store, old) = fixture();
    let checkpoint = store.checkpoint(&old, &json!({})).unwrap();
    let next = store.prepare_successor(&old).unwrap();
    let mut foreign = next.clone();
    foreign.actor_id = "different-agent".into();
    assert!(store.handoff(&old, &HandoffRequest { successor: foreign, checkpoint: checkpoint.clone() }).is_err());
    let mut foreign = next;
    foreign.env_hash = raw_hash(b"other-runtime");
    assert!(store.handoff(&old, &HandoffRequest { successor: foreign, checkpoint }).is_err());
    assert!(store.current(&old).is_ok());
}

#[test]
fn omega_unknown_or_allostasis_exposure_prevents_new_run_activation() {
    for (table, schema, values) in [
        ("protocol_omega_operations", "binding_hash TEXT,status TEXT", "?1,'outcome_unknown'"),
        ("protocol_allostasis_pools", "binding_hash TEXT,held_ms INTEGER,active_slots INTEGER", "?1,20,1"),
    ] {
        let (directory, mut store, old) = fixture();
        let checkpoint = store.checkpoint(&old, &json!({"pending":"native-worker"})).unwrap();
        let next = store.prepare_successor(&old).unwrap();
        let connection = rusqlite::Connection::open(directory.path().join("protocols.sqlite")).unwrap();
        connection.execute_batch(&format!("CREATE TABLE {table}({schema})")).unwrap();
        connection.execute(&format!("INSERT INTO {table} VALUES({values})"), [digest(&old).unwrap()]).unwrap();
        let transfer = HandoffRequest { successor: next.clone(), checkpoint };
        assert!(store.handoff(&old, &transfer).unwrap_err().contains("unresolved"));
        assert!(store.current(&old).is_ok());
        assert!(store.current(&next).is_err());
    }
}

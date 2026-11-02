use genos_orchestrator::mission_protocols::{Binding, RunSpec, Store, raw_hash};
use genos_orchestrator::mission_protocols::continuity::{self, HandoffRequest};
use serde_json::json;
use std::path::Path;
use std::process::Command;
use tempfile::TempDir;

fn admitted(directory: &Path) -> (Store, Binding) {
    let mut store = Store::open(&directory.join("protocols.sqlite")).unwrap();
    let binding = store.admit(&RunSpec {
        mission_id: uuid::Uuid::new_v4().to_string(), workspace: directory.into(),
        objective: "fencing interprocessus réel".into(), input_path: "input.json".into(),
        expected_sum: None, timeout_ms: 180000, env_hash: raw_hash(b"native-executable"),
    }).unwrap();
    store.transaction(&binding, |tx| tx.execute_batch(
        "CREATE TABLE protected_effect(value INTEGER); INSERT INTO protected_effect VALUES(0);"
    ).map_err(|e| e.to_string())).unwrap();
    (store, binding)
}

#[test]
fn native_effect_child() {
    let Ok(path) = std::env::var("GENOS_CONTINUITY_PROCESS_DB") else { return; };
    let raw = std::env::var("GENOS_CONTINUITY_PROCESS_BINDING").unwrap();
    let binding: Binding = serde_json::from_str(&raw).unwrap();
    let stale = std::env::var("GENOS_CONTINUITY_EXPECT_STALE").unwrap() == "1";
    let mut store = Store::open(Path::new(&path)).unwrap();
    let mut effect_entered = false;
    let result = store.transaction(&binding, |tx| {
        continuity::fence(tx, &binding)?;
        effect_entered = true;
        tx.execute("UPDATE protected_effect SET value=value+1", [])
            .map_err(|e| e.to_string())?;
        Ok(())
    });
    assert_eq!(result.is_err(), stale, "unexpected generation decision: {result:?}");
    assert_eq!(effect_entered, !stale);
    println!("NATIVE_CONTINUITY_CHILD pid={} stale={stale}", std::process::id());
}

fn invoke_child(path: &Path, binding: &Binding, stale: bool) -> String {
    let output = Command::new(std::env::current_exe().unwrap())
        .args(["--exact", "native_effect_child", "--nocapture"])
        .env("GENOS_CONTINUITY_PROCESS_DB", path)
        .env("GENOS_CONTINUITY_PROCESS_BINDING", serde_json::to_string(binding).unwrap())
        .env("GENOS_CONTINUITY_EXPECT_STALE", if stale { "1" } else { "0" })
        .output().unwrap();
    let stdout = String::from_utf8(output.stdout).unwrap();
    assert!(output.status.success(), "child failed: {stdout} {}", String::from_utf8_lossy(&output.stderr));
    assert!(stdout.contains("NATIVE_CONTINUITY_CHILD pid="));
    assert!(!stdout.contains(&format!("pid={} ", std::process::id())));
    stdout
}

#[test]
fn restart_and_succession_fence_a_separate_native_effect_process() {
    let directory = TempDir::new().unwrap();
    let (mut store, old) = admitted(directory.path());
    let checkpoint = store.checkpoint(&old, &json!({"state":"ready"})).unwrap();
    let next = store.prepare_successor(&old).unwrap();
    store.handoff(&old, &HandoffRequest { successor: next.clone(), checkpoint }).unwrap();
    drop(store);
    let path = directory.path().join("protocols.sqlite");
    assert!(invoke_child(&path, &old, true).contains("stale=true"));
    assert!(invoke_child(&path, &next, false).contains("stale=false"));
    let connection = rusqlite::Connection::open(path).unwrap();
    let value: u32 = connection.query_row("SELECT value FROM protected_effect", [], |row| row.get(0)).unwrap();
    assert_eq!(value, 1);
}

#[test]
fn a_checkpoint_copied_without_authority_registry_cannot_activate_a_run() {
    let source = TempDir::new().unwrap();
    let (mut store, binding) = admitted(source.path());
    let checkpoint = store.checkpoint(&binding, &json!({"state":"ready"})).unwrap();
    let destination = TempDir::new().unwrap();
    let mut empty = Store::open(&destination.path().join("protocols.sqlite")).unwrap();
    assert!(empty.restore_checkpoint(&binding, &checkpoint).is_err());
    assert!(empty.current(&binding).is_err());
    assert!(store.current(&binding).is_ok());
}

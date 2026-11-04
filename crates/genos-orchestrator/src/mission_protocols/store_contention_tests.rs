use super::{Binding,Event,RunSpec,Store,now_ms};
use rusqlite::Transaction;
use serde_json::json;
use std::sync::{Arc,mpsc,atomic::{AtomicUsize,Ordering}};
use std::time::Duration;

fn fixture(timeout_ms:u64) -> (tempfile::TempDir,Store,Store,Binding) {
    let root=tempfile::TempDir::new().unwrap();
    std::fs::write(root.path().join("numbers.json"),"[1,2]").unwrap();
    let database=root.path().join("protocols.sqlite");
    let mut first=Store::open(&database).unwrap();
    let binding=first.admit(&RunSpec {
        mission_id:uuid::Uuid::new_v4().to_string(),workspace:root.path().to_owned(),
        objective:"Verify durable Store writer coordination".into(),input_path:"numbers.json".into(),
        expected_sum:Some(3),timeout_ms,env_hash:"a".repeat(64),
    }).unwrap();
    let second=Store::open(&database).unwrap();
    (root,first,second,binding)
}

fn event(tx:&Transaction<'_>,binding:&Binding,phase:&'static str) -> Result<(),String> {
    Store::event(tx,binding,Event { protocol:"CONTINUITY",phase,payload:json!({"local_test":true}) })
}

fn count(store:&Store,phase:&str) -> u64 {
    store.connection.query_row("SELECT COUNT(*) FROM rust_protocol_events WHERE phase=?1",
        [phase],|row|row.get(0)).unwrap()
}

#[test]
fn same_database_writer_waits_before_sqlite_begin_and_invokes_callback_exactly_once() {
    contended_writer(Some(Duration::ZERO),Duration::from_millis(200));
}

#[test]
fn default_sqlite_busy_timeout_does_not_fail_a_sibling_writer_held_for_six_seconds() {
    contended_writer(None,Duration::from_secs(6));
}

#[test]
fn begin_effect_creates_missing_schema_after_waiting_for_a_sibling_writer() {
    let (_root,mut first,mut second,binding)=fixture(30000);
    let exists:bool=first.connection.query_row("SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE name='rust_protocol_effects')",
        [],|row|row.get(0)).unwrap();
    assert!(!exists);
    let peer=binding.clone();
    let (start_tx,start_rx)=mpsc::channel();
    let (ready_tx,ready_rx)=mpsc::channel();
    let (done_tx,done_rx)=mpsc::channel();
    let worker=std::thread::spawn(move || {
        start_rx.recv().unwrap();ready_tx.send(()).unwrap();
        let result=second.begin_effect(&peer,("ddl-contention",&json!({"input":"fixed"})));
        done_tx.send(result.clone()).unwrap();result
    });
    let early=first.transaction(&binding,|tx| {
        event(tx,&binding,"STORE_DDL_HOLDER")?;
        start_tx.send(()).unwrap();ready_rx.recv_timeout(Duration::from_secs(2)).unwrap();
        Ok(done_rx.recv_timeout(Duration::from_secs(6)))
    }).unwrap();
    let result=worker.join().unwrap();
    assert!(matches!(early,Err(mpsc::RecvTimeoutError::Timeout)),
        "schema initialization returned while first writer was held: {early:?}");
    assert_eq!(result.unwrap(),super::continuity_effect::EffectAdmission::Start);
    let intents:u64=first.connection.query_row("SELECT COUNT(*) FROM rust_protocol_effects",[],|row|row.get(0)).unwrap();
    assert_eq!(intents,1);assert_eq!(count(&first,"EFFECT_INTENT"),1);
    let intent:(String,String,String)=first.connection.query_row(
        "SELECT request_digest,binding_digest,status FROM rust_protocol_effects",[],
        |row|Ok((row.get(0)?,row.get(1)?,row.get(2)?))).unwrap();
    assert_eq!(intent,(super::digest(&json!({"input":"fixed"})).unwrap(),super::digest(&binding).unwrap(),"running".into()));
}

fn contended_writer(busy:Option<Duration>,hold:Duration) {
    let (_root,mut first,mut second,binding)=fixture(30000);
    if let Some(timeout)=busy { second.connection.busy_timeout(timeout).unwrap(); }
    let calls=Arc::new(AtomicUsize::new(0));
    let observed=calls.clone();let peer=binding.clone();
    let (start_tx,start_rx)=mpsc::channel();
    let (ready_tx,ready_rx)=mpsc::channel();
    let (done_tx,done_rx)=mpsc::channel();
    let worker=std::thread::spawn(move || {
        start_rx.recv().unwrap();ready_tx.send(()).unwrap();
        let result=second.transaction(&peer,|tx| {
            observed.fetch_add(1,Ordering::SeqCst);
            event(tx,&peer,"STORE_CONTENDED_CALLBACK")
        });
        done_tx.send(result.clone()).unwrap();result
    });
    let early=first.transaction(&binding,|tx| {
        event(tx,&binding,"STORE_HOLDER")?;
        start_tx.send(()).unwrap();ready_rx.recv_timeout(Duration::from_secs(2)).unwrap();
        Ok(done_rx.recv_timeout(hold))
    }).unwrap();
    let result=worker.join().unwrap();
    assert!(matches!(early,Err(mpsc::RecvTimeoutError::Timeout)),
        "second writer returned while first transaction was held: {early:?}");
    result.unwrap();
    assert_eq!(calls.load(Ordering::SeqCst),1);
    assert_eq!(count(&first,"STORE_CONTENDED_CALLBACK"),1);
}

#[test]
fn lease_expiring_while_waiting_rejects_the_mutating_callback() {
    let (_root,mut first,mut second,binding)=fixture(1000);
    let calls=Arc::new(AtomicUsize::new(0));
    let observed=calls.clone();let peer=binding.clone();
    let (start_tx,start_rx)=mpsc::channel();
    let (ready_tx,ready_rx)=mpsc::channel();
    let worker=std::thread::spawn(move || {
        start_rx.recv().unwrap();ready_tx.send(()).unwrap();
        second.transaction(&peer,|tx| {
            observed.fetch_add(1,Ordering::SeqCst);
            event(tx,&peer,"STORE_EXPIRED_CALLBACK")
        })
    });
    first.observation_transaction(&binding,|tx| {
        start_tx.send(()).unwrap();ready_rx.recv_timeout(Duration::from_secs(2)).unwrap();
        let remaining=binding.expires_ms.saturating_sub(now_ms());
        std::thread::sleep(Duration::from_millis(remaining+20));
        event(tx,&binding,"STORE_HISTORICAL_HOLDER")
    }).unwrap();
    assert_eq!(worker.join().unwrap().unwrap_err(),"MISSION_LEASE_EXPIRED");
    assert_eq!(calls.load(Ordering::SeqCst),0);
    assert_eq!(count(&first,"STORE_EXPIRED_CALLBACK"),0);
}

#[test]
fn historical_observation_after_expiry_commits_once_without_authorizing_new_work() {
    let (_root,mut first,_second,binding)=fixture(1000);
    let remaining=binding.expires_ms.saturating_sub(now_ms());
    std::thread::sleep(Duration::from_millis(remaining+20));
    let observations=AtomicUsize::new(0);
    first.observation_transaction(&binding,|tx| {
        observations.fetch_add(1,Ordering::SeqCst);
        event(tx,&binding,"STORE_LATE_OBSERVATION")
    }).unwrap();
    let dispatches=AtomicUsize::new(0);
    let reason=first.transaction(&binding,|tx| {
        dispatches.fetch_add(1,Ordering::SeqCst);
        event(tx,&binding,"STORE_FORBIDDEN_NEW_WORK")
    }).unwrap_err();
    assert_eq!(reason,"MISSION_LEASE_EXPIRED");
    assert_eq!(observations.load(Ordering::SeqCst),1);
    assert_eq!(dispatches.load(Ordering::SeqCst),0);
    assert_eq!(count(&first,"STORE_LATE_OBSERVATION"),1);
    assert_eq!(count(&first,"STORE_FORBIDDEN_NEW_WORK"),0);
}

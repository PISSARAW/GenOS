use super::{fixture::{self,Fixture,key},*};
use super::super::{agentic_ledger as ledger,agentic_context,agentic_tools,agentic_evidence,agentic_exchange};
use std::sync::atomic::Ordering;

#[test]
fn duplicate_members_roll_back_all_preparations_and_shared_holds() {
    let mut f=Fixture::new();let alpha=key("alpha");
    let rejected=f.store.transaction(&f.binding,|tx| {
        fixture::prepare_in(tx,&f.binding,std::slice::from_ref(&alpha))?;
        begin_in(tx,&f.binding,&[alpha.clone(),alpha.clone()])
    }).unwrap_err();
    assert!(rejected.contains("DUPLICATE"));
    let count:u64=f.store.connection.query_row("SELECT count(*) FROM agentic_models",[],|row|row.get(0)).unwrap();assert_eq!(count,0);
    assert_eq!(ledger::state(&mut f.store,&f.binding).unwrap().held,ledger::Amounts::default());
    assert_eq!(f.requests.load(Ordering::SeqCst),0);
}

#[test]
fn width_rejection_rolls_back_every_context_intent_and_exposure() {
    let mut f=Fixture::new();let keys=[key("alpha"),key("beta"),key("gamma")];
    let reason=f.prepare(&keys).unwrap_err();assert!(reason.contains("WIDTH_NOT_ADMITTED"));
    let count:u64=f.store.connection.query_row("SELECT count(*) FROM agentic_models",[],|row|row.get(0)).unwrap();assert_eq!(count,0);
    let contexts:u64=f.store.connection.query_row("SELECT count(*) FROM sqlite_master WHERE name='protocol_agentic_contexts'",[],|row|row.get(0)).unwrap();
    assert_eq!(contexts,0);assert_eq!(ledger::state(&mut f.store,&f.binding).unwrap().held,ledger::Amounts::default());
}

#[test]
fn another_connection_cannot_prepare_a_wave_while_a_native_result_is_pending() {
    let mut f=Fixture::new();let (wave,_)=f.prepare(&[key("alpha")]).unwrap();
    let mut other=Store::open(&f.directory.path().join("ledger.sqlite")).unwrap();
    assert!(other.transaction(&f.binding,|tx|require_idle_or_recover_in(tx,&f.binding)).is_err());
    let stopped=finish(&mut f.store,&f.binding,&wave).unwrap();assert_eq!(stopped.status,"stopped");
    assert!(other.transaction(&f.binding,|tx|require_idle_or_recover_in(tx,&f.binding)).is_err());
    assert_eq!(ledger::state(&mut f.store,&f.binding).unwrap().held.model_calls,1);
    assert_eq!(f.requests.load(Ordering::SeqCst),0);
}

#[test]
fn two_coordinators_recover_known_closed_results_without_a_second_dispatch() {
    let mut f=Fixture::new();let (wave,mut jobs)=f.prepare(&[key("alpha")]).unwrap();
    let model=f.dispatch(jobs.remove(0),(fixture::response(),false)).unwrap();f.complete(&model);
    let handles=(0..2).map(|_| {
        let path=f.directory.path().join("ledger.sqlite");let binding=f.binding.clone();
        std::thread::spawn(move|| {
            let mut store=Store::open(&path).unwrap();
            store.transaction(&binding,|tx|require_idle_or_recover_in(tx,&binding))
        })
    }).collect::<Vec<_>>();
    for handle in handles { handle.join().unwrap().unwrap(); }
    let receipt=finish(&mut f.store,&f.binding,&wave).unwrap();assert!(receipt.is_joined());assert_eq!(receipt.revision,1);
    assert_eq!(finish(&mut f.store,&f.binding,&wave).unwrap(),receipt);
    assert_eq!(f.requests.load(Ordering::SeqCst),1);
}

#[test]
fn stopped_tool_wave_recovers_only_after_real_tool_commit_and_preserves_its_error() {
    let mut f=Fixture::new();let (wave,mut jobs)=f.prepare(&[key("alpha")]).unwrap();
    let model=f.dispatch(jobs.remove(0),(fixture::tool(),false)).unwrap();
    f.store.connection.execute_batch("CREATE TRIGGER test_wave_tool_abort BEFORE INSERT ON protocol_agentic_tool_receipts
        BEGIN SELECT RAISE(ABORT,'TEST_WAVE_TOOL_ABORT'); END").unwrap();
    assert!(agentic_tools::execute(&mut f.store,&f.binding,&model.key).is_err());
    let stopped=finish(&mut f.store,&f.binding,&wave).unwrap();assert_eq!(stopped.status,"stopped");assert!(stopped.error.is_some());
    assert!(f.store.transaction(&f.binding,|tx|require_idle_or_recover_in(tx,&f.binding)).is_err());
    f.store.connection.execute_batch("DROP TRIGGER test_wave_tool_abort").unwrap();
    agentic_tools::execute(&mut f.store,&f.binding,&model.key).unwrap();
    f.store.transaction(&f.binding,|tx|require_idle_or_recover_in(tx,&f.binding)).unwrap();
    let joined=finish(&mut f.store,&f.binding,&wave).unwrap();assert!(joined.is_joined());assert_eq!(joined.revision,2);
    assert_eq!(joined.previous_receipt_hash,Some(stopped.receipt_hash.clone()));
    let history=data::history(&f.store.connection,&f.binding,wave.wave_id()).unwrap();assert_eq!(history[0],stopped);
    let events:u64=f.store.connection.query_row("SELECT count(*) FROM rust_protocol_events WHERE phase='AGENTIC_WAVE_RECOVERED'",[],|row|row.get(0)).unwrap();
    assert_eq!(events,1);assert_eq!(f.requests.load(Ordering::SeqCst),1);
    assert_eq!(ledger::state(&mut f.store,&f.binding).unwrap().spent.tool_calls,1);
}

#[test]
fn unknown_http_cannot_become_a_fresh_permit_after_reopen() {
    let mut f=Fixture::new();let alpha=key("alpha");let (wave,mut jobs)=f.prepare(std::slice::from_ref(&alpha)).unwrap();
    assert!(f.dispatch(jobs.remove(0),(fixture::response(),true)).is_err());
    assert!(!finish(&mut f.store,&f.binding,&wave).unwrap().is_joined());
    let request=agentic_context::request_in(&f.store.connection,&f.binding,&alpha).unwrap();
    let admission=ledger::prepare_model(&mut f.store,&f.binding,&ledger::ModelIntent { key:alpha,request:&request,max_wall_ms:10000 }).unwrap();
    assert!(matches!(admission,ledger::ModelAdmission::Unknown));
    let mut reopened=Store::open(&f.directory.path().join("ledger.sqlite")).unwrap();
    assert!(reopened.transaction(&f.binding,|tx|require_idle_or_recover_in(tx,&f.binding)).is_err());
    let state=ledger::state(&mut reopened,&f.binding).unwrap();assert_eq!(state.unknown_operations,1);assert!(state.held.tokens>0);
    assert_eq!(f.requests.load(Ordering::SeqCst),1);
}

#[test]
fn forged_wave_membership_refuses_claim_before_the_transport_can_run() {
    let mut f=Fixture::new();let (_,mut jobs)=f.prepare(&[key("alpha"),key("beta")]).unwrap();let mut job=jobs.remove(0);
    f.store.connection.execute("UPDATE protocol_agentic_parallel_members SET member_hash='forged' WHERE agent_id='alpha'",[]).unwrap();
    job.request.base.cancelled=Some(std::sync::Arc::new(std::sync::atomic::AtomicBool::new(true)));
    let outcome=ledger::dispatch_model(&mut f.store,&f.binding,ledger::ModelDispatch { permit:job.permit,request:&job.request });
    assert!(matches!(outcome,Err(ledger::DispatchError::Guard(_))));
    let state=ledger::state(&mut f.store,&f.binding).unwrap();assert_eq!(state.spent.model_calls,0);assert_eq!(state.held.model_calls,2);
    assert_eq!(f.requests.load(Ordering::SeqCst),0);
}

#[test]
fn evidence_requires_every_observation_in_a_joined_wave_and_refuses_transplanted_receipts() {
    let mut f=Fixture::new();
    let (first,jobs)=f.prepare(&[key("alpha"),key("beta")]).unwrap();
    for job in jobs { let model=f.dispatch(job,(fixture::response(),false)).unwrap();f.complete(&model); }
    finish(&mut f.store,&f.binding,&first).unwrap();
    let (middle,mut jobs)=f.prepare(&[key("gamma")]).unwrap();
    let model=f.dispatch(jobs.remove(0),(fixture::response(),false)).unwrap();f.complete(&model);finish(&mut f.store,&f.binding,&middle).unwrap();
    let (last,mut jobs)=f.prepare(&[key("writer")]).unwrap();
    let writer=f.dispatch(jobs.remove(0),(fixture::response(),false)).unwrap();f.complete(&writer);
    assert!(agentic_evidence::qualify(&mut f.store,&f.binding).unwrap_err().contains("WAVE_NOT_JOINED"));
    finish(&mut f.store,&f.binding,&last).unwrap();
    let proof=agentic_evidence::qualify(&mut f.store,&f.binding).unwrap();assert!(proof.contract_satisfied());
    assert_eq!(closure_in(&f.store.connection,&f.binding).unwrap().len(),3);
    assert_eq!(agentic_exchange::publish(&mut f.store,&f.binding,&proof).unwrap().generation,1);
    transplant(&mut f,(&first,&last));
    assert!(closure_in(&f.store.connection,&f.binding).is_err());assert_eq!(f.requests.load(Ordering::SeqCst),4);
}

fn transplant(f:&mut Fixture,waves:(&WaveHandle,&WaveHandle)) {
    let (raw,hash):(String,String)=f.store.connection.query_row("SELECT receipt_json,receipt_hash FROM protocol_agentic_parallel_receipts
        WHERE wave_id=$1 AND revision=1",[waves.1.wave_id()],|row|Ok((row.get(0)?,row.get(1)?))).unwrap();
    f.store.connection.execute("UPDATE protocol_agentic_parallel_receipts SET receipt_json=$1,receipt_hash=$2 WHERE wave_id=$3 AND revision=1",
        rusqlite::params![raw,hash,waves.0.wave_id()]).unwrap();
}

#[test]
fn rehashing_a_descriptor_timestamp_does_not_fabricate_its_preparation_event() {
    let mut f=Fixture::new();let (wave,mut jobs)=f.prepare(&[key("alpha")]).unwrap();
    let model=f.dispatch(jobs.remove(0),(fixture::response(),false)).unwrap();f.complete(&model);
    finish(&mut f.store,&f.binding,&wave).unwrap();
    let (mut descriptor,_)=data::load(&f.store.connection,&f.binding,wave.wave_id()).unwrap();
    descriptor.opened_ms+=1;descriptor.descriptor_hash=checks::descriptor_hash(&descriptor).unwrap();
    f.store.connection.execute("UPDATE protocol_agentic_parallel_waves SET descriptor_json=$1,descriptor_hash=$2 WHERE wave_id=$3",
        rusqlite::params![data::encode(&descriptor).unwrap(),descriptor.descriptor_hash,wave.wave_id()]).unwrap();
    let reason=data::load(&f.store.connection,&f.binding,wave.wave_id()).unwrap_err();assert!(reason.contains("ORIGINAL_EVENT_REQUIRED"));
    assert_eq!(ledger::model_record_in(&f.store.connection,&f.binding,&model.key).unwrap().model_hash,model.model_hash);
    assert_eq!(ledger::state(&mut f.store,&f.binding).unwrap().spent.tokens,40);
}

#[test]
fn a_rehashed_settlement_without_its_original_join_event_is_not_evidence() {
    let mut f=Fixture::new();let (wave,mut jobs)=f.prepare(&[key("alpha")]).unwrap();
    let model=f.dispatch(jobs.remove(0),(fixture::response(),false)).unwrap();f.complete(&model);
    let mut receipt=finish(&mut f.store,&f.binding,&wave).unwrap();
    receipt.settled_ms+=1;receipt.receipt_hash=checks::receipt_hash(&receipt).unwrap();
    f.store.connection.execute("UPDATE protocol_agentic_parallel_receipts SET receipt_json=$1,receipt_hash=$2 WHERE wave_id=$3",
        rusqlite::params![data::encode(&receipt).unwrap(),receipt.receipt_hash,wave.wave_id()]).unwrap();
    let reason=closure_in(&f.store.connection,&f.binding).unwrap_err();assert!(reason.contains("ORIGINAL_EVENT_REQUIRED"));
    assert_eq!(ledger::model_record_in(&f.store.connection,&f.binding,&model.key).unwrap().model_hash,model.model_hash);
    assert_eq!(f.requests.load(Ordering::SeqCst),1);
}

#[test]
fn continuity_refuses_a_known_settled_but_unjoined_wave_then_allows_its_real_join() {
    let mut f=Fixture::new();let (wave,jobs)=f.prepare(&[key("alpha"),key("beta")]).unwrap();
    for job in jobs { let model=f.dispatch(job,(fixture::response(),false)).unwrap();f.complete(&model); }
    let state=ledger::state(&mut f.store,&f.binding).unwrap();assert_eq!(state.held,ledger::Amounts::default());
    let pending:u64=f.store.connection.query_row("SELECT count(*) FROM agentic_models WHERE status IN ('intent','dispatching','unknown')",
        [],|row|row.get(0)).unwrap();assert_eq!(pending,0);
    let checkpoint=f.store.checkpoint(&f.binding,&serde_json::json!({"phase":"observed_before_wave_join","wave_id":wave.wave_id()})).unwrap();
    let successor=f.store.prepare_successor(&f.binding).unwrap();
    let transfer=super::super::continuity::HandoffRequest { successor:successor.clone(),checkpoint };
    let reason=f.store.handoff(&f.binding,&transfer).unwrap_err();assert!(reason.contains("agentic operation pending"));
    f.store.current(&f.binding).unwrap();assert!(f.store.current(&successor).is_err());
    let joined=finish(&mut f.store,&f.binding,&wave).unwrap();assert!(joined.is_joined());
    let receipt=f.store.handoff(&f.binding,&transfer).unwrap();assert_eq!(receipt.generation,successor.generation);
    f.store.current(&successor).unwrap();assert!(f.store.current(&f.binding).is_err());
    assert_eq!(f.requests.load(Ordering::SeqCst),2);
}

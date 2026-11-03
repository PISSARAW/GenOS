#![cfg(feature="native-llm")]
#[path="helpers/agentic_ledger_fixture.rs"] mod fixture;
use genos_orchestrator::mission_protocols::{Store,agentic_ledger as ledger,digest};
use genos_orchestrator::mission_protocols::continuity::HandoffRequest;
use serde_json::json;
use std::sync::{Arc,Barrier,atomic::Ordering};

const TEXT:&str="Sources : selected document. Limites : semantic truth is not certified.";

#[test]
fn known_native_observation_reopens_without_a_second_http_request() {
    let mut f=fixture::prepare();
    let observed=f.complete(fixture::response(TEXT));
    assert_eq!(f.requests.load(Ordering::SeqCst),1);
    drop(f.store);
    let mut restored=Store::open(&f.directory.path().join("ledger.sqlite")).unwrap();
    let replay=ledger::prepare_model(&mut restored,&f.binding,&ledger::ModelIntent {
        key:f.key.clone(),request:&f.request,max_wall_ms:f.spec.config.turn_timeout_ms }).unwrap();
    match replay { ledger::ModelAdmission::Known(value)=>assert_eq!(value,observed),_=>panic!("known native model expected") }
    let state=ledger::state(&mut restored,&f.binding).unwrap();
    assert_eq!((state.spent.tokens,state.spent.model_calls),(40,1));
    assert_eq!(f.requests.load(Ordering::SeqCst),1);
}

#[test]
fn two_sqlite_connections_mint_only_one_dispatch_permit() {
    let mut f=fixture::unprepared();
    let barrier=Arc::new(Barrier::new(3));
    let mut threads=Vec::new();
    for _ in 0..2 {
        let barrier=barrier.clone();let path=f.directory.path().join("ledger.sqlite");
        let binding=f.binding.clone();let key=f.key.clone();let request=f.request.clone();
        threads.push(std::thread::spawn(move || {
            let mut store=Store::open(&path).unwrap();barrier.wait();
            ledger::prepare_model(&mut store,&binding,&ledger::ModelIntent { key,request:&request,max_wall_ms:20000 }).unwrap()
        }));
    }
    barrier.wait();let mut unknown=0;let mut fresh=0;
    for thread in threads {
        match thread.join().unwrap() {
            ledger::ModelAdmission::Fresh(permit)=> { f.permit=Some(permit);fresh+=1; },
            ledger::ModelAdmission::Unknown=>unknown+=1,
            _=>panic!("no provider has been called yet"),
        }
    }
    assert_eq!((fresh,unknown),(1,1));
    assert_eq!(ledger::state(&mut f.store,&f.binding).unwrap().held.model_calls,1);
    f.complete(fixture::response(TEXT));
    assert_eq!(f.requests.load(Ordering::SeqCst),1);
}

#[test]
fn sdk_request_cannot_replace_the_applied_native_context() {
    let mut f=fixture::prepare();
    let mut changed=f.request.clone();changed.base.actor_id="another-incarnation:reader".into();
    let outcome=ledger::dispatch_model(&mut f.store,&f.binding,ledger::ModelDispatch {
        permit:f.permit.take().unwrap(),request:&changed });
    assert!(matches!(outcome,Err(ledger::DispatchError::Guard(_))));
    assert_eq!(f.requests.load(Ordering::SeqCst),0);
    assert!(ledger::model_record(&mut f.store,&f.binding,&f.key).is_err());
}

#[test]
fn incomplete_http_body_with_full_usage_keeps_the_entire_unknown_exposure() {
    let mut f=fixture::prepare();
    let failure=f.incomplete(fixture::response(TEXT)).unwrap_err();
    assert!(failure.to_string().contains("OutcomeUnknown"));
    let mut restored=Store::open(&f.directory.path().join("ledger.sqlite")).unwrap();
    let state=ledger::state(&mut restored,&f.binding).unwrap();
    assert_eq!((state.spent.tokens,state.spent.model_calls),(40,1));
    assert_eq!(state.held.tokens,f.spec.config.max_input_tokens+f.spec.config.generation.max_output_tokens);
    assert_eq!((state.held.model_calls,state.held.wall_ms),(1,f.spec.config.turn_timeout_ms));
    assert_eq!(state.unknown_operations,1);
    assert!(matches!(ledger::prepare_model(&mut restored,&f.binding,&ledger::ModelIntent {
        key:f.key.clone(),request:&f.request,max_wall_ms:f.spec.config.turn_timeout_ms }).unwrap(),ledger::ModelAdmission::Unknown));
    assert!(ledger::release(&mut restored,&f.binding).is_err());
    let checkpoint=restored.checkpoint(&f.binding,&json!({"unknown":"model"})).unwrap();
    let successor=restored.prepare_successor(&f.binding).unwrap();
    assert!(restored.handoff(&f.binding,&HandoffRequest { successor,checkpoint }).is_err());
    assert_eq!(f.requests.load(Ordering::SeqCst),1);
}

#[test]
fn mission_budget_is_not_recharged_by_reinitialization_or_a_known_handoff() {
    let mut f=fixture::prepare();
    let record=f.complete(fixture::response(TEXT));f.finish_agent(&record);
    let spent=ledger::state(&mut f.store,&f.binding).unwrap().spent;
    let mut other=Store::open(&f.directory.path().join("ledger.sqlite")).unwrap();
    assert_eq!(ledger::initialize(&mut other,&f.binding).unwrap().spent,spent);
    let checkpoint=other.checkpoint(&f.binding,&json!({"completed":"reader"})).unwrap();
    let successor=other.prepare_successor(&f.binding).unwrap();
    other.handoff(&f.binding,&HandoffRequest { successor:successor.clone(),checkpoint }).unwrap();
    assert_eq!(ledger::initialize(&mut other,&successor).unwrap().spent,spent);
    assert_eq!(ledger::state(&mut f.store,&f.binding).unwrap().spent,spent);
    assert!(ledger::model_record(&mut f.store,&f.binding,&f.key).is_err());
}

#[test]
fn rehashed_json_and_changed_raw_response_are_not_native_issued_records() {
    let mut f=fixture::prepare();let record=f.complete(fixture::response(TEXT));
    let connection=rusqlite::Connection::open(f.directory.path().join("ledger.sqlite")).unwrap();
    let mut forged=record.clone();forged.text="forged text PASS".into();
    forged.result_hash=genos_orchestrator::mission_protocols::raw_hash(forged.text.as_bytes());
    forged.native_receipt["native"]["text"]=forged.text.clone().into();
    connection.execute("UPDATE agentic_models SET outcome_json=?1,outcome_hash=?2 WHERE run_id=?3",rusqlite::params![
        serde_json::to_string(&forged).unwrap(),digest(&forged).unwrap(),f.binding.run_id]).unwrap();
    assert!(ledger::model_record(&mut f.store,&f.binding,&f.key).is_err());
    let mut raw=record.clone();raw.native_receipt["native"]["response_body"][0]=0u64.into();
    connection.execute("UPDATE agentic_models SET outcome_json=?1,outcome_hash=?2 WHERE run_id=?3",rusqlite::params![
        serde_json::to_string(&raw).unwrap(),digest(&raw).unwrap(),f.binding.run_id]).unwrap();
    assert!(ledger::model_record(&mut f.store,&f.binding,&f.key).is_err());
}

#[test]
fn changed_persisted_context_invalidates_a_known_native_model_record() {
    let mut f=fixture::prepare();f.complete(fixture::response(TEXT));
    let connection=rusqlite::Connection::open(f.directory.path().join("ledger.sqlite")).unwrap();
    let raw:String=connection.query_row("SELECT context_json FROM protocol_agentic_contexts
        WHERE run_id=?1 AND agent_id='reader' AND turn=0",[&f.binding.run_id],|row|row.get(0)).unwrap();
    let mut value:serde_json::Value=serde_json::from_str(&raw).unwrap();
    value["actor_id"]="foreign-run:reader".into();
    connection.execute("UPDATE protocol_agentic_contexts SET context_json=?1 WHERE run_id=?2",rusqlite::params![
        serde_json::to_string(&value).unwrap(),f.binding.run_id]).unwrap();
    assert!(ledger::model_record(&mut f.store,&f.binding,&f.key).is_err());
}

#[test]
fn an_authentic_record_cannot_be_transplanted_to_another_agent_step() {
    let mut f=fixture::prepare();let first=f.complete(fixture::response(TEXT));f.finish_agent(&first);
    f.prepare_step("author",0);let second=f.complete(fixture::response(TEXT));
    assert_ne!(first.actor_id,second.actor_id);
    assert_eq!(f.requests.load(Ordering::SeqCst),2);
    let connection=rusqlite::Connection::open(f.directory.path().join("ledger.sqlite")).unwrap();
    connection.execute("UPDATE agentic_models SET outcome_json=?1,outcome_hash=?2
        WHERE run_id=?3 AND agent_id='reader' AND turn=0",rusqlite::params![
            serde_json::to_string(&second).unwrap(),digest(&second).unwrap(),f.binding.run_id]).unwrap();
    assert!(ledger::model_record(&mut f.store,&f.binding,&first.key).is_err());
}

#[test]
fn fresh_turn_uses_remaining_wall_and_replay_preserves_its_original_window() {
    use genos_orchestrator::mission_protocols::{agentic_context,agentic_tools,agentic_evidence,agentic_exchange};
    let mut f=fixture::with_timing((10000,5000));f.prepare_permit();
    let original_key=f.key.clone();let original_request=f.request.clone();
    let original_window=context_window(&f,&original_key);
    assert_eq!(original_window.0,5000);
    f.complete_after(fixture::tool("read_source",json!({"path":"notes.txt"}),"read"),3000);
    agentic_tools::execute(&mut f.store,&f.binding,&f.key).unwrap();
    f.prepare_step("reader",1);
    let record=f.complete_after(fixture::response(TEXT),3000);f.finish_agent(&record);
    let before=ledger::state(&mut f.store,&f.binding).unwrap();
    assert!(before.spent.wall_ms>=6000);
    let replay_request=agentic_context::prepare(&mut f.store,&f.binding,&original_key).unwrap();
    assert_eq!(replay_request.base.expires_ms,original_request.base.expires_ms);
    assert_eq!(context_window(&f,&original_key),original_window);
    assert!(matches!(ledger::prepare_model(&mut f.store,&f.binding,&ledger::ModelIntent {
        key:original_key,request:&replay_request,max_wall_ms:5000 }).unwrap(),ledger::ModelAdmission::Known(_)));
    assert_eq!(ledger::state(&mut f.store,&f.binding).unwrap(),before);
    assert_eq!(f.requests.load(Ordering::SeqCst),2);
    f.prepare_step("author",0);
    let window=context_window(&f,&f.key);
    assert!(window.0>0 && window.0<5000);
    assert_eq!(ledger::state(&mut f.store,&f.binding).unwrap().held.wall_ms,window.0);
    f.complete(fixture::tool("write_artifact",json!({"name":"draft","text":TEXT}),"write"));
    agentic_tools::execute(&mut f.store,&f.binding,&f.key).unwrap();
    f.prepare_step("author",1);let record=f.complete(fixture::response(TEXT));f.finish_agent(&record);
    let evidence=agentic_evidence::qualify(&mut f.store,&f.binding).unwrap();
    assert!(evidence.contract_satisfied());
    agentic_exchange::publish(&mut f.store,&f.binding,&evidence).unwrap();
    let final_state=ledger::release(&mut f.store,&f.binding).unwrap();
    assert_eq!((final_state.limits.wall_ms,final_state.spent.model_calls,final_state.spent.tool_calls),(10000,4,2));
    assert!(final_state.spent.wall_ms<9500 && !final_state.overrun);
    assert_eq!(final_state.held,ledger::Amounts::default());
    assert_eq!(f.requests.load(Ordering::SeqCst),4);
}

fn context_window(f:&fixture::Pending,key:&ledger::StepKey) -> (u64,u64) {
    let connection=rusqlite::Connection::open(f.directory.path().join("ledger.sqlite")).unwrap();
    let raw:String=connection.query_row("SELECT context_json FROM protocol_agentic_contexts
        WHERE run_id=?1 AND agent_id=?2 AND turn=?3",rusqlite::params![f.binding.run_id,key.agent_id,key.turn],|row|row.get(0)).unwrap();
    let value:serde_json::Value=serde_json::from_str(&raw).unwrap();
    (value["max_wall_ms"].as_u64().unwrap(),value["expires_ms"].as_u64().unwrap())
}

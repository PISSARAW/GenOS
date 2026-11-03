#![cfg(feature="native-llm")]
#[path="helpers/llm_effect_fixture.rs"]
mod fixture;
use genos_orchestrator::mission_protocols::{llm_allostasis,llm_omega};
use genos_api::native_inference;
use std::sync::{Arc,atomic::AtomicBool};

#[test]
fn an_existing_intent_never_authorizes_a_second_http_dispatch() {
    let mut f = fixture::prepare();
    let duplicate = llm_omega::begin(&mut f.store,&f.binding,llm_omega::InferenceIntent {
        request:&f.request,max_wall_ms:20000 }).unwrap();
    assert!(matches!(duplicate,llm_omega::DispatchAdmission::Unknown));
    f.listener.as_ref().unwrap().set_nonblocking(true).unwrap();
    assert!(f.listener.as_ref().unwrap().accept().is_err());
}

#[test]
fn foreign_before_dispatch_failure_cannot_refund_an_old_unknown_exposure() {
    let mut f = fixture::prepare();
    let lost = f.lose_response();
    assert_eq!(lost.phase(),native_inference::FailurePhase::OutcomeUnknown);
    llm_omega::record_failure(&mut f.store,&f.binding,&lost).unwrap();
    let mut cancelled = f.request.clone(); cancelled.cancelled=Some(Arc::new(AtomicBool::new(true)));
    let failure = native_inference::execute(&cancelled).unwrap_err();
    assert!(llm_omega::record_failure(&mut f.store,&f.binding,&failure).is_err());
    let state = llm_allostasis::state(&mut f.store,&f.binding).unwrap();
    assert_eq!(state.unknown_operations,1);
    assert!(state.held.tokens>0);
}

#[test]
fn changed_actual_head_refuses_http_even_with_an_unconsumed_permit() {
    let mut f = fixture::prepare();
    let connection = rusqlite::Connection::open(f.directory.path().join("protocols.sqlite")).unwrap();
    connection.execute("UPDATE protocol_gqwf_heads SET generation=1",[]).unwrap();
    let result = llm_omega::dispatch(&mut f.store,&f.binding,llm_omega::Dispatch {
        permit:f.permit.take().unwrap(),request:&f.request });
    assert!(matches!(result,Err(llm_omega::DispatchError::Guard(_))));
    f.listener.as_ref().unwrap().set_nonblocking(true).unwrap();
    assert!(f.listener.as_ref().unwrap().accept().is_err());
}

#[test]
fn completed_output_replays_exactly_without_another_request() {
    let mut f = fixture::prepare();
    let observation = f.complete(fixture::response());
    let replay = llm_omega::begin(&mut f.store,&f.binding,llm_omega::InferenceIntent {
        request:&f.request,max_wall_ms:20000 }).unwrap();
    match replay { llm_omega::DispatchAdmission::Completed(value) => assert_eq!(value.output,observation.output()),
        _ => panic!("completed native observation must be reused") }
    assert_eq!(llm_allostasis::state(&mut f.store,&f.binding).unwrap().spent.model_calls,1);
}

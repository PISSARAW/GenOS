#![cfg(feature="native-llm")]
#[path="helpers/llm_effect_fixture.rs"]
mod fixture;
use genos_orchestrator::mission_protocols::{Store,llm_allostasis,llm_omega};

#[test]
fn actual_provider_counts_are_spent_once_and_release_never_refunds() {
    let mut f = fixture::prepare();
    let observation = f.complete(fixture::response());
    let first = llm_allostasis::state(&mut f.store,&f.binding).unwrap();
    assert_eq!((first.spent.tokens,first.spent.model_calls),(40,1));
    assert_eq!(first.spent.wall_ms,observation.elapsed_ms());
    llm_omega::observe(&mut f.store,&f.binding,&observation).unwrap();
    llm_allostasis::settle_observation(&mut f.store,&f.binding,&observation).unwrap();
    let released = llm_allostasis::release(&mut f.store,&f.binding).unwrap();
    assert_eq!(released.spent,first.spent);
    assert!(released.released);
}

#[test]
fn missing_usage_retains_full_exposure_across_restart_and_refuses_release() {
    let mut f = fixture::prepare();
    let mut response = fixture::response();
    response.as_object_mut().unwrap().remove("eval_count");
    f.complete(response);
    let mut restored = Store::open(&f.directory.path().join("protocols.sqlite")).unwrap();
    let state = llm_allostasis::state(&mut restored,&f.binding).unwrap();
    assert_eq!(state.held.tokens,f.spec.max_input_tokens+f.spec.generation.max_output_tokens);
    assert_eq!(state.unknown_operations,1);
    assert!(llm_allostasis::release(&mut restored,&f.binding).is_err());
}

#[test]
fn actual_overrun_is_retained_as_debt_instead_of_rolling_back_usage() {
    let mut f = fixture::prepare();
    let mut response = fixture::response(); response["eval_count"]=25000u64.into();
    f.complete(response);
    let state = llm_allostasis::state(&mut f.store,&f.binding).unwrap();
    assert_eq!(state.spent.tokens,25017);
    assert!(state.overrun); assert!(state.debt_tokens()>0);
    assert!(llm_allostasis::release(&mut f.store,&f.binding).is_err());
}

#[test]
fn partial_known_input_is_debited_and_can_prove_overrun_without_complete_usage() {
    let mut f = fixture::prepare();
    let mut response = fixture::response(); response["prompt_eval_count"]=25000u64.into();
    response.as_object_mut().unwrap().remove("eval_count");
    let observation = f.complete(response);
    assert!(observation.usage().is_none());
    let first = llm_allostasis::state(&mut f.store,&f.binding).unwrap();
    assert_eq!(first.spent.tokens,25000); assert!(first.overrun); assert!(first.debt_tokens()>0);
    assert_eq!(first.unknown_operations,1); assert!(first.held.tokens>0);
    llm_omega::observe(&mut f.store,&f.binding,&observation).unwrap();
    assert_eq!(llm_allostasis::state(&mut f.store,&f.binding).unwrap().spent.tokens,25000);
}

#[test]
fn a_malformed_response_preserves_its_partial_usage_in_failure_accounting() {
    let mut f = fixture::prepare();
    let mut response = fixture::response(); response["prompt_eval_count"]=25000u64.into();
    response.as_object_mut().unwrap().remove("eval_count"); response.as_object_mut().unwrap().remove("message");
    let error = f.dispatch(response).unwrap_err();
    let failure = match error { llm_omega::DispatchError::Transport(failure)=>failure,
        _=>panic!("the provider reply was observed before response decoding failed") };
    llm_omega::record_failure(&mut f.store,&f.binding,&failure).unwrap();
    let state = llm_allostasis::state(&mut f.store,&f.binding).unwrap();
    assert_eq!(state.spent.tokens,25000); assert!(state.overrun); assert!(state.held.tokens>0);
}

#[test]
fn ordinary_token_demand_cannot_consume_the_protected_five_percent() {
    let limits = llm_allostasis::Limits { tokens:100,model_calls:2,wall_ms:1000 };
    assert!(llm_allostasis::validate_demand(&limits,90,5).is_ok());
    assert!(llm_allostasis::validate_demand(&limits,90,6).is_err());
    assert!(llm_allostasis::validate_limits(&llm_allostasis::Limits { model_calls:1,..limits }).is_err());
}

#[test]
fn ambiguous_http_framing_keeps_exposure_even_when_the_json_reports_both_counts() {
    let mut f=fixture::prepare();
    let error=f.incomplete_response(fixture::response()).unwrap_err();
    let failure=match error { llm_omega::DispatchError::Transport(failure)=>failure,
        _=>panic!("the real HTTP body was incomplete") };
    assert_eq!(failure.phase(),genos_api::native_inference::FailurePhase::OutcomeUnknown);
    assert_eq!(failure.observed_input_tokens(),Some(17)); assert_eq!(failure.observed_output_tokens(),Some(23));
    llm_omega::record_failure(&mut f.store,&f.binding,&failure).unwrap();
    let state=llm_allostasis::state(&mut f.store,&f.binding).unwrap();
    assert_eq!(state.spent.tokens,40); assert_eq!(state.unknown_operations,1);
    assert_eq!(state.held.tokens,2560);
    assert!(llm_allostasis::release(&mut f.store,&f.binding).is_err());
}

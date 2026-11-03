use super::{Binding, Event, Store, data};
use genos_api::native_inference::{InferenceFailure, FailurePhase};
use serde_json::json;

pub fn record_failure(store: &mut Store, binding: &Binding, failure: &InferenceFailure) -> Result<(),String> {
    store.observation_transaction(binding,|tx| {
        verify_failure(tx,binding,failure)?;
        super::super::llm_allostasis::failure_in(tx,binding,failure)?;
        let previous = data::status(tx,binding)?;
        let status = status(failure.phase());
        if previous == status { return Ok(()); }
        data::set_status(tx,binding,status)?;
        Store::event(tx,binding,Event { protocol:"OMEGA",phase:"MODEL_DISPATCH_FAILURE",payload:json!(failure) })?;
        if failure.phase() != FailurePhase::OutcomeUnknown {
            super::super::continuity_effect::complete_in(tx,binding,("llm:infer",&json!({"failure":failure})))?;
        }
        Ok(())
    })
}

fn verify_failure(connection: &rusqlite::Connection, binding: &Binding, failure: &InferenceFailure) -> Result<(),String> {
    super::issued::require(connection,binding,("failure",&super::issued::failure_hash(failure)?))?;
    if data::intent(connection,binding)?.request_hash != failure.request_hash() { return Err("LLM_OMEGA_FAILURE_REQUEST_CHANGED".into()); }
    Ok(())
}

fn status(phase: FailurePhase) -> &'static str {
    match phase { FailurePhase::BeforeDispatch => "not_dispatched", FailurePhase::ObservedHttpFailure => "failed",
        FailurePhase::OutcomeUnknown => "outcome_unknown" }
}

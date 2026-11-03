use super::{Binding, Event, Store, ModelIntent, ModelAdmission, ModelPermit, ModelDispatch, ModelRecord,
    DispatchError, StepKey, budget, data, records, digest, now_ms};
use super::types::StoredIntent;
use genos_api::native_inference::{self as api, ToolInferenceRequest, ToolObservation, InferenceFailure, FailurePhase};
use rusqlite::{Connection,Transaction,params};
use serde_json::json;
use data::error;

pub fn prepare_model(store:&mut Store, binding:&Binding, input:&ModelIntent<'_>) -> Result<ModelAdmission,String> {
    store.transaction(binding,|tx| {
        if let Some(status)=data::model_status(tx,binding,&input.key)? { return replay(tx,binding,(input,&status)); }
        validate_request(tx,binding,(&input.key,input.request))?;
        super::agents::eligible(tx,binding,&input.key)?;
        prepare_fresh(tx,binding,input)
    })
}

fn prepare_fresh(tx:&Transaction<'_>, binding:&Binding, input:&ModelIntent<'_>) -> Result<ModelAdmission,String> {
    let spec=super::super::agentic_admission::admitted_in(tx,binding)?;
    let actual=allocated_wall(tx,binding,(input,spec.config.turn_timeout_ms))?;
    let amount=budget::model_amount(spec.config.max_input_tokens,spec.config.generation.max_output_tokens,actual)?;
    budget::expose(tx,binding,&amount)?;
    let intent=StoredIntent { key:input.key.clone(),binding_hash:digest(binding)?,
        request_hash:api::tool_request_hash(input.request)?,descriptor:api::tool_request_descriptor(input.request),
        max_wall_ms:actual,nonce:uuid::Uuid::new_v4().to_string() };
    insert(tx,binding,&intent)?;
    Ok(ModelAdmission::Fresh(ModelPermit { key:intent.key,binding_hash:intent.binding_hash,
        request_hash:intent.request_hash,nonce:intent.nonce }))
}

fn allocated_wall(connection:&Connection, binding:&Binding, input:(&ModelIntent<'_>,u64)) -> Result<u64,String> {
    let (intent,policy_maximum)=input;
    let context=super::super::agentic_context::applied_in(connection,binding,&intent.key)?;
    if context.max_wall_ms>intent.max_wall_ms || context.max_wall_ms>policy_maximum {
        return Err("AGENTIC_CONTEXT_WALL_EXCEEDS_CALLER_OR_POLICY".into());
    }
    check_deadline(binding,intent.request,context.max_wall_ms)?;
    Ok(context.max_wall_ms)
}

fn insert(tx:&Transaction<'_>, binding:&Binding, intent:&StoredIntent) -> Result<(),String> {
    super::super::continuity_effect::begin_in(tx,binding,(&format!("agentic:{}",intent.key.operation_id()),&intent.descriptor))?;
    tx.execute("INSERT INTO agentic_models VALUES(?1,?2,?3,?4,?5,'intent',NULL,NULL,NULL)",params![
        binding.run_id,intent.key.agent_id,intent.key.turn,serde_json::to_string(intent).map_err(error)?,digest(intent)?]).map_err(error)?;
    Store::event(tx,binding,Event { protocol:"OMEGA",phase:"AGENTIC_MODEL_INTENT",payload:json!(intent) })
}

fn replay(connection:&Connection, binding:&Binding, input:(&ModelIntent<'_>,&str)) -> Result<ModelAdmission,String> {
    let (input,status)=input;
    let stored=records::intent(connection,binding,&input.key)?;
    if stored.request_hash!=api::tool_request_hash(input.request)? { return Err("AGENTIC_MODEL_REQUEST_CONFLICT".into()); }
    if status=="observed" { return Ok(ModelAdmission::Known(records::model_record_in(connection,binding,&input.key)?)); }
    Ok(ModelAdmission::Unknown)
}

pub fn dispatch_model(store:&mut Store, binding:&Binding, input:ModelDispatch<'_>) -> Result<ModelRecord,DispatchError> {
    let intent=store.transaction(binding,|tx|claim(tx,binding,&input)).map_err(DispatchError::Guard)?;
    match api::execute_tools(input.request) {
        Ok(observation)=>observe(store,binding,(&intent,&observation)).map_err(DispatchError::Guard),
        Err(failure)=> {
            failed(store,binding,(&intent,&failure)).map_err(DispatchError::Guard)?;
            Err(DispatchError::Transport(failure.to_string()))
        }
    }
}

fn claim(tx:&Transaction<'_>, binding:&Binding, input:&ModelDispatch<'_>) -> Result<StoredIntent,String> {
    let stored=records::intent(tx,binding,&input.permit.key)?;
    verify_permit(binding,input,&stored)?;
    validate_request(tx,binding,(&stored.key,input.request))?;
    super::agents::eligible(tx,binding,&stored.key)?;
    check_deadline(binding,input.request,stored.max_wall_ms)?;
    api::validate_tool_request(input.request)?;
    claim_row(tx,binding,&stored.key)?;
    Ok(stored)
}

fn claim_row(tx:&Transaction<'_>, binding:&Binding, key:&StepKey) -> Result<(),String> {
    let changed=tx.execute("UPDATE agentic_models SET status='dispatching' WHERE run_id=?1 AND agent_id=?2 AND turn=?3 AND status='intent'",
        params![binding.run_id,key.agent_id,key.turn]).map_err(error)?;
    if changed!=1 { return Err("AGENTIC_MODEL_DISPATCH_ALREADY_CLAIMED".into()); }
    Ok(())
}

fn verify_permit(binding:&Binding, input:&ModelDispatch<'_>, stored:&StoredIntent) -> Result<(),String> {
    if input.permit.binding_hash!=digest(binding)? || input.permit.request_hash!=stored.request_hash
        || input.permit.nonce!=stored.nonce || api::tool_request_hash(input.request)?!=stored.request_hash {
        return Err("AGENTIC_MODEL_DISPATCH_PERMIT_CHANGED".into());
    }
    Ok(())
}

fn validate_request(connection:&Connection, binding:&Binding, input:(&StepKey,&ToolInferenceRequest)) -> Result<(),String> {
    let (key,request)=input;
    let expected=super::super::agentic_context::request_in(connection,binding,key)?;
    if api::tool_request_hash(request)?!=api::tool_request_hash(&expected)?
        || request.base.operation_id!=key.operation_id()
        || request.base.actor_id!=super::require_actor_in(connection,binding,&key.agent_id)? {
        return Err("AGENTIC_APPLIED_MODEL_REQUEST_CHANGED".into());
    }
    Ok(())
}

fn check_deadline(binding:&Binding, request:&ToolInferenceRequest, maximum:u64) -> Result<(),String> {
    let now=now_ms();
    if maximum==0 || request.base.expires_ms<=now || request.base.expires_ms>binding.expires_ms
        || request.base.expires_ms-now>maximum { return Err("AGENTIC_MODEL_DEADLINE_EXCEEDS_EXPOSURE".into()); }
    Ok(())
}

fn observe(store:&mut Store, binding:&Binding, input:(&StoredIntent,&ToolObservation)) -> Result<ModelRecord,String> {
    let (intent,observation)=input;
    store.observation_transaction(binding,|tx| {
        let record=records::capture(binding,intent,observation)?;
        if record.request_hash!=intent.request_hash { return Err("AGENTIC_NATIVE_MODEL_REQUEST_CHANGED".into()); }
        let charge=charge(tx,binding,intent)?;
        settle_observation(tx,binding,(&charge,observation))?;
        records::persist(tx,binding,&record)?;
        super::super::continuity_effect::complete_in(tx,binding,(&format!("agentic:{}",intent.key.operation_id()),
            &json!({"model_hash":record.model_hash})))?;
        Ok(record)
    })
}

fn charge(connection:&Connection, binding:&Binding, intent:&StoredIntent) -> Result<budget::Charge,String> {
    let spec=super::super::agentic_admission::admitted_in(connection,binding)?;
    Ok(budget::Charge { held:budget::model_amount(spec.config.max_input_tokens,spec.config.generation.max_output_tokens,intent.max_wall_ms)?,
        input:None,output:None,total:None,input_limit:spec.config.max_input_tokens,
        output_limit:spec.config.generation.max_output_tokens,usage_known:false,dispatched:true,elapsed_ms:0,counted_unknown:false,
        retain_exposure:false })
}

fn settle_observation(tx:&Transaction<'_>, binding:&Binding, input:(&budget::Charge,&ToolObservation)) -> Result<(),String> {
    let (original,observation)=input;
    let native=observation.native();
    let charge=budget::Charge { held:original.held.clone(),input:native.observed_input_tokens(),output:native.observed_output_tokens(),
        total:native.observed_total_tokens(),input_limit:original.input_limit,output_limit:original.output_limit,
        usage_known:native.usage().is_some(),dispatched:true,elapsed_ms:native.elapsed_ms(),counted_unknown:false,retain_exposure:false };
    budget::settle(tx,binding,&charge)
}

fn failed(store:&mut Store, binding:&Binding, input:(&StoredIntent,&InferenceFailure)) -> Result<(),String> {
    store.observation_transaction(binding,|tx|record_failure(tx,binding,input))
}

fn record_failure(tx:&Transaction<'_>, binding:&Binding, input:(&StoredIntent,&InferenceFailure)) -> Result<(),String> {
    let (intent,failure)=input;
    if failure.request_hash()!=intent.request_hash || failure.binding_hash()!=digest(binding)? {
        return Err("AGENTIC_FAILURE_REQUEST_CHANGED".into());
    }
    let mut charge=charge(tx,binding,intent)?;
    charge.input=failure.observed_input_tokens();charge.output=failure.observed_output_tokens();charge.total=failure.observed_total_tokens();
    charge.retain_exposure=failure.phase()==FailurePhase::OutcomeUnknown;
    charge.usage_known=failure.usage().is_some() && !charge.retain_exposure;charge.elapsed_ms=failure.elapsed_ms();
    charge.dispatched=failure.phase()!=FailurePhase::BeforeDispatch;
    budget::settle(tx,binding,&charge)?;
    persist_failure(tx,binding,(intent,failure))
}

fn persist_failure(tx:&Transaction<'_>, binding:&Binding, input:(&StoredIntent,&InferenceFailure)) -> Result<(),String> {
    let (intent,failure)=input;
    let value=serde_json::to_value(failure).map_err(error)?;
    let status=if failure.phase()==FailurePhase::OutcomeUnknown { "unknown" } else { "failed" };
    write_failure(tx,binding,(intent,status,&value))?;
    if failure.phase()!=FailurePhase::OutcomeUnknown {
        super::super::continuity_effect::complete_in(tx,binding,(&format!("agentic:{}",intent.key.operation_id()),&json!({"failure":value})))?;
    }
    Store::event(tx,binding,Event { protocol:"OMEGA",phase:"AGENTIC_MODEL_FAILED",payload:json!({"key":intent.key,"failure":value}) })
}

fn write_failure(tx:&Transaction<'_>, binding:&Binding, input:(&StoredIntent,&str,&serde_json::Value)) -> Result<(),String> {
    let (intent,status,value)=input;
    let (serialized,hash)=failure_material(value)?;
    let changed=tx.execute("UPDATE agentic_models SET status=?1,outcome_json=?2,outcome_hash=?3
        WHERE run_id=?4 AND agent_id=?5 AND turn=?6 AND status='dispatching'",params![status,
            serialized,hash,binding.run_id,intent.key.agent_id,intent.key.turn]).map_err(error)?;
    if changed!=1 { return Err("AGENTIC_FAILURE_OWNERSHIP_CONFLICT".into()); }
    Ok(())
}

fn failure_material(value:&serde_json::Value) -> Result<(String,String),String> {
    Ok((serde_json::to_string(value).map_err(error)?,digest(value)?))
}

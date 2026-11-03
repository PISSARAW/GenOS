use super::{Binding, Event, ModelRecord, StepKey, Store, data, digest, raw_hash};
use super::types::StoredIntent;
use genos_api::native_inference::ToolObservation;
use rusqlite::{Connection,Transaction,params};
use serde_json::{Value,json};
use data::error;

pub(super) fn intent(connection:&Connection, binding:&Binding, key:&StepKey) -> Result<StoredIntent,String> {
    let value=load_intent(connection,binding,key)?;
    if value.key!=*key || value.binding_hash!=digest(binding)? || value.request_hash!=digest(&value.descriptor)? {
        return Err("AGENTIC_MODEL_INTENT_FOREIGN".into());
    }
    Ok(value)
}

fn load_intent(connection:&Connection, binding:&Binding, key:&StepKey) -> Result<StoredIntent,String> {
    let row:(String,String)=connection.query_row("SELECT intent_json,intent_hash FROM agentic_models
        WHERE run_id=?1 AND agent_id=?2 AND turn=?3",params![binding.run_id,key.agent_id,key.turn],
        |r|Ok((r.get(0)?,r.get(1)?))).map_err(error)?;
    data::decode(row)
}

pub(super) fn capture(binding:&Binding, intent:&StoredIntent, observation:&ToolObservation) -> Result<ModelRecord,String> {
    let native=observation.native();
    let mut record=ModelRecord { key:intent.key.clone(),binding_hash:digest(binding)?,actor_id:native.actor_id().into(),
        request_hash:native.request_hash().into(),context_hash:native.context_hash().into(),input_hash:native.input_hash().into(),
        provider_config_hash:native.provider_config_hash().into(),observation_hash:native.receipt_hash().into(),
        result_hash:raw_hash(native.output()),text:native.text().into(),tool_calls:observation.tool_calls().to_vec(),
        finish:native.finish(),usage_known:native.usage().is_some(),native_receipt:serde_json::to_value(observation).map_err(error)?,
        model_hash:String::new(),record_hash:String::new() };
    let hash=record_hash(&record)?;
    record.model_hash=hash.clone();record.record_hash=hash;
    Ok(record)
}

pub(super) fn persist(tx:&Transaction<'_>, binding:&Binding, record:&ModelRecord) -> Result<(),String> {
    save_observed(tx,binding,record)?;
    Store::event(tx,binding,Event { protocol:"OMEGA",phase:"AGENTIC_MODEL_OBSERVED",
        payload:json!({"operation_id":record.key.operation_id(),"record":record}) })
}

fn save_observed(tx:&Transaction<'_>, binding:&Binding, record:&ModelRecord) -> Result<(),String> {
    let (serialized,hash,issued)=outcome_material(binding,record)?;
    let changed=tx.execute("UPDATE agentic_models SET status='observed',outcome_json=?1,outcome_hash=?2,issued_hash=?3
        WHERE run_id=?4 AND agent_id=?5 AND turn=?6 AND status IN ('dispatching','unknown')",
        params![serialized,hash,issued,
            binding.run_id,record.key.agent_id,record.key.turn]).map_err(error)?;
    if changed!=1 { return Err("AGENTIC_OBSERVATION_OWNERSHIP_CONFLICT".into()); }
    Ok(())
}

fn outcome_material(binding:&Binding, record:&ModelRecord) -> Result<(String,String,String),String> {
    Ok((serde_json::to_string(record).map_err(error)?,digest(record)?,issued_hash(binding,record)?))
}

pub fn model_record_in(connection:&Connection, binding:&Binding, key:&StepKey) -> Result<ModelRecord,String> {
    super::super::store::current_checked(connection,binding)?;
    let record=data::model_record(connection,binding,key)?;
    if record.key!=*key { return Err("AGENTIC_MODEL_STEP_IDENTITY_CHANGED".into()); }
    validate_record(connection,binding,&record)?;
    validate_native(&record)?;
    validate_event(connection,binding,&record)?;
    Ok(record)
}

fn validate_record(connection:&Connection, binding:&Binding, record:&ModelRecord) -> Result<(),String> {
    validate_metadata(connection,binding,record)?;
    validate_envelope(connection,binding,record)?;
    validate_issued(connection,binding,record)
}

fn validate_metadata(connection:&Connection, binding:&Binding, record:&ModelRecord) -> Result<(),String> {
    let intent=intent(connection,binding,&record.key)?;
    let expected=record_hash(record)?;
    if record.binding_hash!=digest(binding)? || record.request_hash!=intent.request_hash
        || record.record_hash!=expected || record.model_hash!=expected {
        return Err("AGENTIC_MODEL_RECORD_BINDING_CHANGED".into());
    }
    Ok(())
}

fn validate_issued(connection:&Connection, binding:&Binding, record:&ModelRecord) -> Result<(),String> {
    let issued:String=connection.query_row("SELECT issued_hash FROM agentic_models
        WHERE run_id=?1 AND agent_id=?2 AND turn=?3",params![binding.run_id,record.key.agent_id,record.key.turn],
        |r|r.get(0)).map_err(error)?;
    if issued!=issued_hash(binding,record)? { return Err("AGENTIC_MODEL_NOT_ISSUED".into()); }
    Ok(())
}

fn validate_envelope(connection:&Connection, binding:&Binding, record:&ModelRecord) -> Result<(),String> {
    let envelope=super::super::agentic_context::applied_in(connection,binding,&record.key)?;
    if (&record.context_hash,&record.input_hash,&record.actor_id)!=(&envelope.hash,&envelope.input_hash,&envelope.actor_id)
        || record.actor_id!=super::require_actor_in(connection,binding,&record.key.agent_id)? {
        return Err("AGENTIC_MODEL_CONTEXT_OR_ACTOR_CHANGED".into());
    }
    Ok(())
}

fn record_hash(record:&ModelRecord) -> Result<String,String> {
    let mut value=record.clone();value.record_hash.clear();value.model_hash.clear();
    digest(&("genos.agentic.model-record/v1",value))
}

fn issued_hash(binding:&Binding, record:&ModelRecord) -> Result<String,String> {
    digest(&("genos.agentic.native-model-issued/v1",binding,&record.key,&record.model_hash))
}

fn validate_native(record:&ModelRecord) -> Result<(),String> {
    let mut native=record.native_receipt["native"].clone();
    verify_native_fields(record,&native)?;
    native["receipt_hash"]=Value::String(String::new());
    if digest(&json!({"profile":"genos.native-inference/observation/v1","observation":native}))?!=record.observation_hash {
        return Err("AGENTIC_NATIVE_RECEIPT_HASH_CHANGED".into());
    }
    let calls:Vec<genos_api::native_inference::ToolCall>=serde_json::from_value(record.native_receipt["tool_calls"].clone()).map_err(error)?;
    if calls!=record.tool_calls { return Err("AGENTIC_NATIVE_TOOL_CALLS_CHANGED".into()); }
    Ok(())
}

fn verify_native_fields(record:&ModelRecord, native:&Value) -> Result<(),String> {
    verify_native_identity(record,native)?;
    verify_native_result(record,native)?;
    verify_native_response(record,native)
}

fn verify_native_identity(record:&ModelRecord, native:&Value) -> Result<(),String> {
    let identity=&native["identity"];
    let expected=json!({"binding_hash":record.binding_hash,"operation_id":record.key.operation_id(),
        "actor_id":record.actor_id,"request_hash":record.request_hash,"context_hash":record.context_hash,
        "input_hash":record.input_hash,"provider_config_hash":record.provider_config_hash});
    compare_fields(identity,&expected)
}

fn verify_native_result(record:&ModelRecord, native:&Value) -> Result<(),String> {
    if native["receipt_hash"].as_str()!=Some(&record.observation_hash) || native["text"].as_str()!=Some(&record.text)
        || raw_hash(record.text.as_bytes())!=record.result_hash || native["finish"]!=serde_json::to_value(record.finish).map_err(error)? {
        return Err("AGENTIC_NATIVE_RESULT_CHANGED".into());
    }
    Ok(())
}

fn verify_native_response(record:&ModelRecord, native:&Value) -> Result<(),String> {
    let body:Vec<u8>=serde_json::from_value(native["response_body"].clone()).map_err(error)?;
    if body.len()>2*1024*1024 || native["response"]["response_hash"].as_str()!=Some(&format!("sha256:{}",raw_hash(&body))) {
        return Err("AGENTIC_NATIVE_RAW_RESPONSE_CHANGED".into());
    }
    if record.usage_known!=native["response"]["usage"].is_object() {
        return Err("AGENTIC_NATIVE_USAGE_AVAILABILITY_CHANGED".into());
    }
    Ok(())
}

fn compare_fields(actual:&Value, expected:&Value) -> Result<(),String> {
    let fields=expected.as_object().ok_or("AGENTIC_EXPECTED_IDENTITY_INVALID")?;
    for (name,value) in fields {
        if actual.get(name)!=Some(value) { return Err("AGENTIC_NATIVE_IDENTITY_CHANGED".into()); }
    }
    Ok(())
}

fn validate_event(connection:&Connection, binding:&Binding, record:&ModelRecord) -> Result<(),String> {
    let row:(String,String)=connection.query_row("SELECT payload_json,digest FROM rust_protocol_events
        WHERE run_id=?1 AND protocol='OMEGA' AND phase='AGENTIC_MODEL_OBSERVED'
        AND json_extract(payload_json,'$.operation_id')=?2 ORDER BY sequence DESC LIMIT 1",
        params![binding.run_id,record.key.operation_id()],|r|Ok((r.get(0)?,r.get(1)?))).map_err(error)?;
    let payload:Value=serde_json::from_str(&row.0).map_err(error)?;
    if payload!=json!({"operation_id":record.key.operation_id(),"record":record})
        || row.1!=digest(&(binding,"OMEGA","AGENTIC_MODEL_OBSERVED",&payload))? {
        return Err("AGENTIC_MODEL_EVENT_CHANGED".into());
    }
    Ok(())
}

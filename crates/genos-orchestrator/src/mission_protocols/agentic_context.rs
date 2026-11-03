//! Contextes adressés, reconstruits depuis les observations et les reçus effectifs.
use super::{Binding,Event,Store,agentic_admission,agentic_ledger,agentic_spec::AgenticSpec,digest,now_ms};
use agentic_ledger::StepKey;
use genos_api::native_inference::{InferenceRequest,ToolDefinition,ToolInferenceRequest,ToolMessage,tool_base_messages};
use rusqlite::{Connection,OptionalExtension,params};
use serde::{Deserialize,Serialize};
use serde_json::Value;

#[path="agentic_context_prompt.rs"]
mod prompt;

#[derive(Clone,Debug,Deserialize,Serialize,PartialEq,Eq)]
pub struct AppliedContext {
    pub schema:String, pub binding_hash:String, pub key:StepKey, pub actor_id:String,
    pub expires_ms:u64, pub max_wall_ms:u64, pub input_hash:String, pub hash:String, pub payload:Value,
}

pub fn prepare(store:&mut Store, binding:&Binding, key:&StepKey) -> Result<ToolInferenceRequest,String> {
    store.transaction(binding,|tx| {
        ensure(tx)?;
        if load(tx,binding,key)?.is_none() { install(tx,binding,key)?; }
        request_in(tx,binding,key)
    })
}

fn install(tx:&rusqlite::Transaction<'_>, binding:&Binding, key:&StepKey) -> Result<(),String> {
    let spec=agentic_admission::admitted_in(tx,binding)?;
    let actor_id=agentic_ledger::require_actor_in(tx,binding,&key.agent_id)?;
    let payload=prompt::payload(tx,(binding,&spec),key)?;
    let (max_wall_ms,expires_ms)=wall_window(tx,binding,spec.config.turn_timeout_ms)?;
    let mut context=AppliedContext { schema:"genos.rust-agentic-context/v1".into(),binding_hash:digest(binding)?,
        key:key.clone(),actor_id,expires_ms,max_wall_ms,input_hash:digest(&payload)?,hash:String::new(),payload };
    context.hash=context_hash(&context)?;
    persist(tx,binding,&context)
}

fn wall_window(connection:&Connection, binding:&Binding, maximum:u64) -> Result<(u64,u64),String> {
    let now=now_ms();
    let max_wall_ms=maximum.min(agentic_ledger::remaining_wall_in(connection,binding)?)
        .min(binding.expires_ms.saturating_sub(now));
    if max_wall_ms==0 { return Err("AGENTIC_CONTEXT_WALL_WINDOW_UNAVAILABLE".into()); }
    let expires_ms=now.checked_add(max_wall_ms).ok_or("AGENTIC_CONTEXT_DEADLINE_OVERFLOW")?;
    Ok((max_wall_ms,expires_ms))
}

fn persist(tx:&rusqlite::Transaction<'_>, binding:&Binding, context:&AppliedContext) -> Result<(),String> {
    tx.execute("INSERT INTO protocol_agentic_contexts VALUES($1,$2,$3,$4,$5)",
        params![binding.run_id,context.key.agent_id,context.key.turn,serde_json::to_string(context).map_err(error)?,context.hash]).map_err(error)?;
    Store::event(tx,binding,Event { protocol:"SYNAPSE",phase:"AGENTIC_CONTEXT_APPLIED",payload:serde_json::to_value(context).map_err(error)? })
}

pub(crate) fn applied_in(connection:&Connection, binding:&Binding, key:&StepKey) -> Result<AppliedContext,String> {
    let context=load(connection,binding,key)?.ok_or("AGENTIC_CONTEXT_NOT_APPLIED")?;
    validate(&context,binding,key)?;
    event_matches(connection,binding,&context)?;
    Ok(context)
}

fn validate(context:&AppliedContext, binding:&Binding, key:&StepKey) -> Result<(),String> {
    if context.schema!="genos.rust-agentic-context/v1" || context.key!=*key || context.binding_hash!=digest(binding)? {
        return Err("AGENTIC_CONTEXT_SCOPE_CHANGED".into());
    }
    if context_hash(&context)?!=context.hash || digest(&context.payload)?!=context.input_hash {
        return Err("AGENTIC_CONTEXT_CORRUPTED".into());
    }
    Ok(())
}

pub(crate) fn request_in(connection:&Connection, binding:&Binding, key:&StepKey) -> Result<ToolInferenceRequest,String> {
    let context=applied_in(connection,binding,key)?;
    let spec=agentic_admission::admitted_in(connection,binding)?;
    let actor=agentic_ledger::require_actor_in(connection,binding,&key.agent_id)?;
    if context.actor_id!=actor || context.payload!=prompt::payload(connection,(binding,&spec),key)? {
        return Err("AGENTIC_EFFECTIVE_CONTEXT_CHANGED".into());
    }
    build(binding,&spec,&context)
}

fn build(binding:&Binding, spec:&AgenticSpec, context:&AppliedContext) -> Result<ToolInferenceRequest,String> {
    let messages:Vec<ToolMessage>=serde_json::from_value(context.payload["messages"].clone()).map_err(error)?;
    let tools:Vec<ToolDefinition>=serde_json::from_value(context.payload["tools"].clone()).map_err(error)?;
    let base=InferenceRequest { operation_id:context.key.operation_id(),binding_hash:digest(binding)?,
        context_hash:context.hash.clone(),actor_id:context.actor_id.clone(),input_hash:context.input_hash.clone(),
        provider:spec.config.provider.clone(),generation:spec.config.generation.clone(),messages:tool_base_messages(&messages),
        max_input_tokens:spec.config.max_input_tokens,expires_ms:context.expires_ms,credential:None,cancelled:None };
    Ok(ToolInferenceRequest { base,messages,tools })
}

fn load(connection:&Connection, binding:&Binding, key:&StepKey) -> Result<Option<AppliedContext>,String> {
    let row:Option<(String,String)>=connection.query_row("SELECT context_json,context_hash FROM protocol_agentic_contexts
        WHERE run_id=$1 AND agent_id=$2 AND turn=$3",params![binding.run_id,key.agent_id,key.turn],
        |row|Ok((row.get(0)?,row.get(1)?))).optional().map_err(error)?;
    row.map(|(raw,hash)|decode(&raw,&hash)).transpose()
}

fn decode(raw:&str, hash:&str) -> Result<AppliedContext,String> {
    let context:AppliedContext=serde_json::from_str(raw).map_err(error)?;
    if context.hash!=hash { return Err("AGENTIC_CONTEXT_COLUMN_CHANGED".into()); }
    Ok(context)
}

fn event_matches(connection:&Connection, binding:&Binding, context:&AppliedContext) -> Result<(),String> {
    let raw=serde_json::to_string(&serde_json::to_value(context).map_err(error)?).map_err(error)?;
    let expected=digest(&(binding,"SYNAPSE","AGENTIC_CONTEXT_APPLIED",context))?;
    let found:bool=connection.query_row("SELECT EXISTS(SELECT 1 FROM rust_protocol_events
        WHERE run_id=$1 AND protocol='SYNAPSE' AND phase='AGENTIC_CONTEXT_APPLIED' AND payload_json=$2 AND digest=$3)",
        params![binding.run_id,raw,expected],|row|row.get(0)).map_err(error)?;
    if !found { return Err("AGENTIC_CONTEXT_INSTALLATION_EVENT_CHANGED".into()); }
    Ok(())
}

fn context_hash(context:&AppliedContext) -> Result<String,String> {
    let mut value=context.clone(); value.hash.clear(); digest(&value)
}

fn ensure(connection:&Connection) -> Result<(),String> {
    connection.execute_batch("CREATE TABLE IF NOT EXISTS protocol_agentic_contexts(
        run_id TEXT NOT NULL,agent_id TEXT NOT NULL,turn INTEGER NOT NULL,context_json TEXT NOT NULL,
        context_hash TEXT NOT NULL,PRIMARY KEY(run_id,agent_id,turn))").map_err(error)
}

fn error(error:impl std::fmt::Display) -> String { error.to_string() }

use super::{Binding, Event, Store, agentic_spec::{AgenticSpec,POLICY}, digest, now_ms, raw_hash};
use rusqlite::{Connection,OptionalExtension,TransactionBehavior,params};

impl Store {
    pub fn admit_agentic(&mut self, spec:&AgenticSpec) -> Result<Binding,String> {
        spec.validate()?;
        let binding=binding_for(spec)?;
        let _guard=self.current_writer(&binding)?;
        let tx=self.connection.transaction_with_behavior(TransactionBehavior::Immediate).map_err(error)?;
        reject_existing(&tx,&spec.mission_id)?;
        persist(&tx,&binding,spec)?;
        super::store::current_checked(&tx,&binding)?;
        tx.commit().map_err(error)?;
        Ok(binding)
    }

    pub fn agentic_spec(&self, binding:&Binding) -> Result<AgenticSpec,String> { admitted_in(&self.connection,binding) }
}

fn binding_for(spec:&AgenticSpec) -> Result<Binding,String> {
    let workspace=spec.workspace.canonicalize().map_err(error)?;
    if !workspace.is_dir() { return Err("AGENTIC_WORKSPACE_REQUIRED".into()); }
    Ok(Binding { mission_id:spec.mission_id.clone(),run_id:uuid::Uuid::new_v4().to_string(),
        actor_id:format!("mission:{}",spec.mission_id),workspace:workspace.to_string_lossy().into(),
        generation:1,policy_hash:raw_hash(POLICY),request_hash:digest(spec)?,env_hash:spec.env_hash.clone(),
        expires_ms:now_ms().checked_add(spec.timeout_ms).ok_or("AGENTIC_DEADLINE_OVERFLOW")? })
}

fn persist(tx:&rusqlite::Transaction<'_>, binding:&Binding, spec:&AgenticSpec) -> Result<(),String> {
    super::store::insert_binding(tx,binding)?;
    tx.execute("INSERT INTO rust_protocol_current VALUES (?1,?2,?3)",
        params![binding.mission_id,binding.run_id,binding.generation]).map_err(error)?;
    Store::event(tx,binding,Event { protocol:"RUNTIME",phase:"ADMIT",payload:serde_json::to_value(spec).map_err(error)? })
}

pub(crate) fn admitted_in(connection:&Connection, binding:&Binding) -> Result<AgenticSpec,String> {
    historical(connection,binding)?;
    let value = fetch_admitted_value(connection, binding)?;
    let spec:AgenticSpec=serde_json::from_value(value).map_err(error)?;
    spec.validate()?;
    validate_identity(&spec,binding)?;
    Ok(spec)
}

fn fetch_admitted_value(connection:&Connection, binding:&Binding) -> Result<serde_json::Value,String> {
    let (raw,hash):(String,String)=connection.query_row("SELECT payload_json,digest FROM rust_protocol_events
        WHERE run_id=?1 AND protocol='RUNTIME' AND phase='ADMIT' ORDER BY sequence LIMIT 1",
        [&binding.run_id],|row|Ok((row.get(0)?,row.get(1)?))).map_err(error)?;
    let value:serde_json::Value=serde_json::from_str(&raw).map_err(error)?;
    if digest(&(binding,"RUNTIME","ADMIT",&value))?!=hash || digest(&value)?!=binding.request_hash {
        return Err("AGENTIC_ADMISSION_CHANGED".into());
    }
    Ok(value)
}

fn historical(connection:&Connection, binding:&Binding) -> Result<(),String> {
    let stored:Option<String>=connection.query_row("SELECT binding_json FROM rust_protocol_runs WHERE run_id=?1",
        [&binding.run_id],|row|row.get(0)).optional().map_err(error)?;
    if stored.as_deref()!=Some(&serde_json::to_string(binding).map_err(error)?) {
        return Err("AGENTIC_HISTORICAL_BINDING_FORGED".into());
    }
    Ok(())
}

fn validate_identity(spec:&AgenticSpec, binding:&Binding) -> Result<(),String> {
    let workspace=spec.workspace.canonicalize().map_err(error)?;
    if spec.mission_id!=binding.mission_id || spec.env_hash!=binding.env_hash || binding.policy_hash!=raw_hash(POLICY) {
        return Err("AGENTIC_ADMISSION_BINDING_MISMATCH".into());
    }
    if workspace.to_string_lossy()!=binding.workspace { return Err("AGENTIC_ADMISSION_WORKSPACE_CHANGED".into()); }
    Ok(())
}

fn error(error:impl std::fmt::Display) -> String { error.to_string() }

fn reject_existing(connection:&Connection, mission:&str) -> Result<(),String> {
    let exists:bool=connection.query_row("SELECT EXISTS(SELECT 1 FROM rust_protocol_current WHERE mission_id=?1)",
        [mission],|row|row.get(0)).map_err(error)?;
    if exists { return Err("MISSION_ALREADY_ADMITTED: resume or explicit handoff required".into()); }
    Ok(())
}

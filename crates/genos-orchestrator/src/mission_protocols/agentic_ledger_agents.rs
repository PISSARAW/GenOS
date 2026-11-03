use super::{AgentCompletion, Binding, CompletedAgent, Event, ModelRecord, StepKey, Store, data, digest, records};
use super::super::agentic_spec::AgenticSpec;
use genos_api::native_inference::Finish;
use rusqlite::{Connection,Transaction,OptionalExtension,params};
use serde_json::json;
use data::error;

pub(super) fn eligible(connection:&Connection, binding:&Binding, key:&StepKey) -> Result<(),String> {
    let spec=super::super::agentic_admission::admitted_in(connection,binding)?;
    let agent=spec.agent(&key.agent_id)?;
    if key.turn>=agent.max_turns { return Err("AGENTIC_TURN_LIMIT_EXCEEDED".into()); }
    if completed_in(connection,binding,&key.agent_id)?.is_some() { return Err("AGENTIC_AGENT_ALREADY_COMPLETED".into()); }
    predecessors(connection,binding,(&spec,&key.agent_id))?;
    if key.turn!=0 { previous_turn(connection,binding,&StepKey { agent_id:key.agent_id.clone(),turn:key.turn-1 })?; }
    let state=super::budget::required(connection,binding)?;
    super::budget::available(&state,&super::Amounts::default())
}

fn predecessors(connection:&Connection, binding:&Binding, input:(&AgenticSpec,&str)) -> Result<(),String> {
    let (spec,id)=input;
    for dependency in &spec.agent(id)?.depends_on {
        if completed_in(connection,binding,dependency)?.is_none() { return Err("AGENTIC_PREDECESSOR_NOT_COMPLETED".into()); }
    }
    Ok(())
}

fn previous_turn(connection:&Connection, binding:&Binding, key:&StepKey) -> Result<(),String> {
    let previous=records::model_record_in(connection,binding,key)?;
    if previous.finish!=Finish::ToolRequested || previous.tool_calls.is_empty() || !previous.usage_known {
        return Err("AGENTIC_PREVIOUS_TURN_NOT_CONTINUABLE".into());
    }
    let results=super::super::agentic_tools::results_in(connection,binding,key)?;
    if results.len()!=previous.tool_calls.len() { return Err("AGENTIC_TOOL_RESULTS_REQUIRED".into()); }
    Ok(())
}

pub fn complete_agent(store:&mut Store, binding:&Binding, input:&AgentCompletion) -> Result<CompletedAgent,String> {
    store.transaction(binding,|tx| {
        let key=StepKey { agent_id:input.agent_id.clone(),turn:input.last_turn };
        let record=records::model_record_in(tx,binding,&key)?;
        validate_terminal(&record,input)?;
        let spec=super::super::agentic_admission::admitted_in(tx,binding)?;
        predecessors(tx,binding,(&spec,&input.agent_id))?;
        let completion=make_completion(binding,&record)?;
        persist(tx,binding,&completion)?;
        Ok(completion)
    })
}

fn validate_terminal(record:&ModelRecord, input:&AgentCompletion) -> Result<(),String> {
    if record.key.agent_id!=input.agent_id || record.key.turn!=input.last_turn
        || record.text!=input.text || record.observation_hash!=input.observation_hash || record.finish!=Finish::Complete
        || !record.tool_calls.is_empty() || !record.usage_known {
        return Err("AGENTIC_AGENT_TERMINAL_OBSERVATION_REQUIRED".into());
    }
    Ok(())
}

fn make_completion(binding:&Binding, record:&ModelRecord) -> Result<CompletedAgent,String> {
    let mut value=CompletedAgent { agent_id:record.key.agent_id.clone(),last_turn:record.key.turn,text:record.text.clone(),
        observation_hash:record.observation_hash.clone(),result_hash:record.result_hash.clone(),
        completion_hash:String::new(),binding_hash:digest(binding)? };
    value.completion_hash=completion_hash(&value)?;
    Ok(value)
}

fn persist(tx:&Transaction<'_>, binding:&Binding, value:&CompletedAgent) -> Result<(),String> {
    if let Some(existing)=load(tx,binding,&value.agent_id)? {
        if existing!=*value { return Err("AGENTIC_AGENT_COMPLETION_CONFLICT".into()); }
        return Ok(());
    }
    write_completion(tx,binding,value)?;
    Store::event(tx,binding,Event { protocol:"OMEGA",phase:"AGENTIC_AGENT_COMPLETED",payload:json!(value) })
}

fn write_completion(tx:&Transaction<'_>, binding:&Binding, value:&CompletedAgent) -> Result<(),String> {
    tx.execute("INSERT INTO agentic_agents VALUES(?1,?2,?3,?4)",params![binding.run_id,value.agent_id,
        serde_json::to_string(value).map_err(error)?,digest(value)?]).map_err(error)?;
    Ok(())
}

fn load(connection:&Connection, binding:&Binding, id:&str) -> Result<Option<CompletedAgent>,String> {
    let row:Option<(String,String)>=connection.query_row("SELECT value_json,value_hash FROM agentic_agents WHERE run_id=?1 AND agent_id=?2",
        params![binding.run_id,id],|r|Ok((r.get(0)?,r.get(1)?))).optional().map_err(error)?;
    row.map(data::decode).transpose()
}

pub fn completed_in(connection:&Connection, binding:&Binding, id:&str) -> Result<Option<CompletedAgent>,String> {
    super::super::store::current_checked(connection,binding)?;
    let Some(value)=load(connection,binding,id)? else { return Ok(None); };
    let key=StepKey { agent_id:id.into(),turn:value.last_turn };
    let record=records::model_record_in(connection,binding,&key)?;
    if value!=make_completion(binding,&record)? { return Err("AGENTIC_AGENT_COMPLETION_CHANGED".into()); }
    validate_terminal(&record,&AgentCompletion { agent_id:id.into(),last_turn:value.last_turn,
        text:value.text.clone(),observation_hash:value.observation_hash.clone() })?;
    Ok(Some(value))
}

fn completion_hash(value:&CompletedAgent) -> Result<String,String> {
    let mut unsigned=value.clone();unsigned.completion_hash.clear();
    digest(&("genos.agentic.completed-agent/v1",unsigned))
}

pub(super) fn require_all(connection:&Connection, binding:&Binding, spec:&AgenticSpec) -> Result<(),String> {
    for agent in &spec.config.agents {
        if completed_in(connection,binding,&agent.id)?.is_none() { return Err("AGENTIC_ALL_AGENTS_MUST_COMPLETE".into()); }
    }
    Ok(())
}

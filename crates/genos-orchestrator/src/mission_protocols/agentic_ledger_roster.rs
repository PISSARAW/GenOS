use super::{Binding, Event, digest};
use super::super::{Store,agentic_spec::AgenticSpec};
use rusqlite::{Connection,Transaction,OptionalExtension,params};
use serde::{Deserialize,Serialize};
use serde_json::json;
use super::data::error;

#[derive(Clone,Debug,Deserialize,Serialize,PartialEq,Eq)]
struct InstalledAgent {
    agent_id:String, actor_id:String, binding_hash:String, config_hash:String,
    method:String, provider_hash:String,
}

fn expected(binding:&Binding, spec:&AgenticSpec, id:&str) -> Result<InstalledAgent,String> {
    Ok(InstalledAgent { agent_id:id.into(),actor_id:format!("{}:{id}",binding.run_id),binding_hash:digest(binding)?,
        config_hash:digest(spec.agent(id)?)?,method:"native_tool_http_inference/v1".into(),
        provider_hash:genos_api::native_inference::provider_config_hash(&spec.config.provider)? })
}

pub(super) fn install(tx:&Transaction<'_>, binding:&Binding, spec:&AgenticSpec) -> Result<(),String> {
    for agent in &spec.config.agents {
        let value=expected(binding,spec,&agent.id)?;
        if let Some(prior)=load(tx,binding,&agent.id)? {
            if prior!=value { return Err("AGENTIC_ROSTER_CHANGED".into()); }
            continue;
        }
        insert(tx,binding,&value)?;
    }
    Ok(())
}

fn insert(tx:&Transaction<'_>, binding:&Binding, value:&InstalledAgent) -> Result<(),String> {
    tx.execute("INSERT INTO agentic_roster VALUES(?1,?2,?3,?4)",
        params![binding.run_id,value.agent_id,serde_json::to_string(value).map_err(error)?,digest(value)?]).map_err(error)?;
    Store::event(tx,binding,Event { protocol:"MORPH",phase:"AGENTIC_AGENT_INSTALLED",payload:json!(value) })
}

fn load(connection:&Connection, binding:&Binding, id:&str) -> Result<Option<InstalledAgent>,String> {
    let row:Option<(String,String)>=connection.query_row("SELECT value_json,value_hash FROM agentic_roster
        WHERE run_id=?1 AND agent_id=?2",params![binding.run_id,id],|r|Ok((r.get(0)?,r.get(1)?)))
        .optional().map_err(error)?;
    row.map(super::data::decode).transpose()
}

pub fn require_actor_in(connection:&Connection, binding:&Binding, id:&str) -> Result<String,String> {
    super::super::store::current_checked(connection,binding)?;
    let spec=super::super::agentic_admission::admitted_in(connection,binding)?;
    let installed=load(connection,binding,id)?.ok_or("AGENTIC_AGENT_NOT_INSTALLED")?;
    if installed!=expected(binding,&spec,id)? { return Err("AGENTIC_AGENT_OR_METHOD_CHANGED".into()); }
    Ok(installed.actor_id)
}

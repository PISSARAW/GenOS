use super::{Binding, Event, Store, WorkerRole, digest, llm_spec, morph_types::Roster};
use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};
use serde_json::json;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub struct InstalledMethod {
    pub actor_id: String,
    pub role: WorkerRole,
    pub method_id: String,
    pub policy_hash: String,
}

pub fn install(store: &mut Store, binding: &Binding) -> Result<Roster,String> {
    let roster = store.ensure_roster(binding)?;
    store.transaction(binding,|tx| {
        llm_spec::admitted_in(tx,binding)?;
        ensure(tx)?;
        let current = super::morph::committed(tx,binding)?;
        if current != roster { return Err("LLM_MORPH_ROSTER_CHANGED".into()); }
        for role in [WorkerRole::Producer,WorkerRole::VerifierA,WorkerRole::VerifierB] {
            install_one(tx,(binding,&roster),role)?;
        }
        Ok(roster.clone())
    })
}

fn ensure(connection: &Connection) -> Result<(),String> {
    connection.execute_batch("CREATE TABLE IF NOT EXISTS protocol_llm_installed_methods(
        run_id TEXT NOT NULL, role TEXT NOT NULL, method_json TEXT NOT NULL,
        PRIMARY KEY(run_id,role))").map_err(error)
}

fn installed(binding: &Binding, roster: &Roster, role: WorkerRole) -> Result<InstalledMethod,String> {
    let method = match role {
        WorkerRole::Producer => "native_http_inference/v1",
        WorkerRole::VerifierA => "rust_str_contains/v1",
        WorkerRole::VerifierB => "rust_byte_windows/v1",
    };
    Ok(InstalledMethod { actor_id:roster.member(role.as_str())?.actor_id.clone(),role,
        method_id:method.into(),policy_hash:binding.policy_hash.clone() })
}

fn load(connection: &Connection, identity: (&Binding,WorkerRole)) -> Result<Option<InstalledMethod>,String> {
    let raw: Option<String> = connection.query_row("SELECT method_json FROM protocol_llm_installed_methods WHERE run_id=?1 AND role=?2",
        params![identity.0.run_id,identity.1.as_str()],|row| row.get(0)).optional().map_err(error)?;
    raw.map(|value| serde_json::from_str(&value).map_err(error)).transpose()
}

fn install_one(connection: &rusqlite::Transaction<'_>, identity: (&Binding,&Roster), role: WorkerRole) -> Result<(),String> {
    let (binding,roster)=identity;
    let method = installed(binding,roster,role)?;
    if let Some(previous)=load(connection,(binding,role))? {
        if previous != method { return Err("LLM_MORPH_METHOD_CONFLICT".into()); }
        return Ok(());
    }
    persist(connection,binding,&method)
}

fn persist(connection: &rusqlite::Transaction<'_>, binding: &Binding, method: &InstalledMethod) -> Result<(),String> {
    connection.execute("INSERT INTO protocol_llm_installed_methods VALUES(?1,?2,?3)",
        params![binding.run_id,method.role.as_str(),serde_json::to_string(&method).map_err(error)?]).map_err(error)?;
    Store::event(connection,binding,Event { protocol:"MORPH",phase:"LLM_METHOD_APPLIED",
        payload:json!({"method":method,"method_hash":digest(&method)?}) })
}

pub(crate) fn require_in(connection: &Connection, binding: &Binding, role: WorkerRole) -> Result<InstalledMethod,String> {
    super::store::current_checked(connection,binding)?;
    let roster=super::morph::committed(connection,binding)?;
    let expected=installed(binding,&roster,role)?;
    let recorded=load(connection,(binding,role))?.ok_or("LLM_MORPH_METHOD_NOT_INSTALLED")?;
    if recorded != expected { return Err("LLM_MORPH_METHOD_CHANGED".into()); }
    Ok(recorded)
}

fn error(error: impl std::fmt::Display) -> String { error.to_string() }

use super::{Binding, MissionState, ModelRecord, StepKey, digest};
use rusqlite::{Connection, OptionalExtension, params};
use serde::{Serialize, de::DeserializeOwned};

pub(super) fn ensure(connection:&Connection) -> Result<(),String> {
    connection.execute_batch("CREATE TABLE IF NOT EXISTS agentic_pools(
        mission_id TEXT PRIMARY KEY,value_json TEXT NOT NULL,value_hash TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS agentic_roster(
        run_id TEXT NOT NULL,agent_id TEXT NOT NULL,value_json TEXT NOT NULL,value_hash TEXT NOT NULL,
        PRIMARY KEY(run_id,agent_id));
      CREATE TABLE IF NOT EXISTS agentic_models(
        run_id TEXT NOT NULL,agent_id TEXT NOT NULL,turn INTEGER NOT NULL,
        intent_json TEXT NOT NULL,intent_hash TEXT NOT NULL,status TEXT NOT NULL,
        outcome_json TEXT,outcome_hash TEXT,issued_hash TEXT,
        PRIMARY KEY(run_id,agent_id,turn));
      CREATE TABLE IF NOT EXISTS agentic_agents(
        run_id TEXT NOT NULL,agent_id TEXT NOT NULL,value_json TEXT NOT NULL,value_hash TEXT NOT NULL,
        PRIMARY KEY(run_id,agent_id));
      CREATE TABLE IF NOT EXISTS agentic_tools(
        run_id TEXT NOT NULL,operation_id TEXT NOT NULL,intent_json TEXT NOT NULL,intent_hash TEXT NOT NULL,
        status TEXT NOT NULL,receipt_hash TEXT,elapsed_ms INTEGER,
        PRIMARY KEY(run_id,operation_id));").map_err(error)
}

pub(super) fn pool(connection:&Connection, binding:&Binding) -> Result<Option<MissionState>,String> {
    let row:Option<(String,String)>=connection.query_row("SELECT value_json,value_hash FROM agentic_pools WHERE mission_id=?1",
        [&binding.mission_id],|r|Ok((r.get(0)?,r.get(1)?))).optional().map_err(error)?;
    row.map(decode).transpose()
}

pub(super) fn write_pool(connection:&Connection, binding:&Binding, value:&MissionState) -> Result<(),String> {
    connection.execute("INSERT INTO agentic_pools VALUES(?1,?2,?3)
        ON CONFLICT(mission_id) DO UPDATE SET value_json=excluded.value_json,value_hash=excluded.value_hash",
        params![binding.mission_id,serde_json::to_string(value).map_err(error)?,digest(value)?]).map_err(error)?;
    Ok(())
}

pub(super) fn decode<T:DeserializeOwned+Serialize>(row:(String,String)) -> Result<T,String> {
    let value:T=serde_json::from_str(&row.0).map_err(error)?;
    if digest(&value)?!=row.1 { return Err("AGENTIC_LEDGER_RECORD_CORRUPT".into()); }
    Ok(value)
}

pub(super) fn model_status(connection:&Connection, binding:&Binding, key:&StepKey) -> Result<Option<String>,String> {
    connection.query_row("SELECT status FROM agentic_models WHERE run_id=?1 AND agent_id=?2 AND turn=?3",
        params![binding.run_id,key.agent_id,key.turn],|r|r.get(0)).optional().map_err(error)
}

pub(super) fn model_record(connection:&Connection, binding:&Binding, key:&StepKey) -> Result<ModelRecord,String> {
    let row:(String,String)=connection.query_row("SELECT outcome_json,outcome_hash FROM agentic_models
        WHERE run_id=?1 AND agent_id=?2 AND turn=?3 AND status='observed'",
        params![binding.run_id,key.agent_id,key.turn],|r|Ok((r.get(0)?,r.get(1)?))).map_err(error)?;
    decode(row)
}

pub(super) fn pending(connection:&Connection, binding:&Binding) -> Result<u64,String> {
    connection.query_row("SELECT (SELECT count(*) FROM agentic_models WHERE run_id=?1 AND status!='observed')
        +(SELECT count(*) FROM agentic_tools WHERE run_id=?1 AND status!='completed')",
        [&binding.run_id],|r|r.get(0)).map_err(error)
}

pub(super) fn error(value:impl std::fmt::Display) -> String { value.to_string() }

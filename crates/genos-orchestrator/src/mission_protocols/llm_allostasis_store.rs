use super::super::{Binding, digest};
use super::{Exposure, State, types::Exposed};
use rusqlite::{Connection, OptionalExtension, Transaction, params};

pub(super) fn sql<T>(result: rusqlite::Result<T>) -> Result<T,String> { result.map_err(|error| error.to_string()) }

pub(super) fn ensure(tx: &Transaction<'_>) -> Result<(),String> {
    sql(tx.execute_batch("CREATE TABLE IF NOT EXISTS protocol_llm_resource_pools(
        mission_id TEXT PRIMARY KEY,binding_hash TEXT NOT NULL,state_json TEXT NOT NULL,state_hash TEXT NOT NULL,
        held_tokens INTEGER NOT NULL,held_calls INTEGER NOT NULL,held_wall_ms INTEGER NOT NULL,overrun INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS protocol_llm_resource_exposures(
        mission_id TEXT NOT NULL,operation_id TEXT NOT NULL,binding_hash TEXT NOT NULL,status TEXT NOT NULL,
        exposure_json TEXT NOT NULL,exposure_hash TEXT NOT NULL,PRIMARY KEY(mission_id,operation_id));"))
}

pub(super) fn pool(connection: &Connection, binding: &Binding) -> Result<Option<State>,String> {
    let row: Option<(String,String)> = sql(connection.query_row("SELECT state_json,state_hash
        FROM protocol_llm_resource_pools WHERE mission_id=$1", [&binding.mission_id],
        |row| Ok((row.get(0)?,row.get(1)?))).optional())?;
    row.map(|row| decode_state(binding, row)).transpose()
}

fn decode_state(binding: &Binding, row: (String,String)) -> Result<State,String> {
    let state: State = serde_json::from_str(&row.0).map_err(|error| error.to_string())?;
    if digest(&(&binding.mission_id,&state))? != row.1 { return Err("LLM_RESOURCE_STATE_CORRUPT".into()); }
    Ok(state)
}

pub(super) fn write_pool(tx: &Transaction<'_>, binding: &Binding, state: &State) -> Result<(),String> {
    let serialized = serde_json::to_string(state).map_err(|error| error.to_string())?;
    let hash = digest(&(&binding.mission_id,state))?;
    sql(tx.execute("INSERT INTO protocol_llm_resource_pools VALUES($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT(mission_id) DO UPDATE SET state_json=excluded.state_json,state_hash=excluded.state_hash,
        held_tokens=excluded.held_tokens,held_calls=excluded.held_calls,held_wall_ms=excluded.held_wall_ms,overrun=excluded.overrun",
        params![binding.mission_id,digest(binding)?,serialized,hash,state.held.tokens,state.held.model_calls,state.held.wall_ms,state.overrun]))?;
    Ok(())
}

pub(super) fn exposure(connection: &Connection, input: (&Binding,&str)) -> Result<Option<Exposed>,String> {
    let row: Option<(String,String)> = sql(connection.query_row("SELECT exposure_json,exposure_hash
        FROM protocol_llm_resource_exposures WHERE mission_id=$1 AND operation_id=$2",
        params![input.0.mission_id,input.1], |row| Ok((row.get(0)?,row.get(1)?))).optional())?;
    row.map(|row| decode_exposure(input,row)).transpose()
}

fn decode_exposure(input: (&Binding,&str), row: (String,String)) -> Result<Exposed,String> {
    let record: Exposed = serde_json::from_str(&row.0).map_err(|error| error.to_string())?;
    if record.mission_id != input.0.mission_id || record.input.operation_id != input.1 || digest(&record)? != row.1 {
        return Err("LLM_RESOURCE_EXPOSURE_CORRUPT".into());
    }
    Ok(record)
}

pub(super) fn write_exposure(tx: &Transaction<'_>, record: &Exposed) -> Result<(),String> {
    sql(tx.execute("INSERT INTO protocol_llm_resource_exposures VALUES($1,$2,$3,$4,$5,$6)
        ON CONFLICT(mission_id,operation_id) DO UPDATE SET status=excluded.status,
        exposure_json=excluded.exposure_json,exposure_hash=excluded.exposure_hash",
        params![record.mission_id,record.input.operation_id,record.binding_hash,record.status,
            serde_json::to_string(record).map_err(|error| error.to_string())?,digest(record)?]))?;
    Ok(())
}

pub(super) fn new_exposure(binding: &Binding, input: Exposure) -> Result<Exposed,String> {
    Ok(Exposed { mission_id:binding.mission_id.clone(),run_id:binding.run_id.clone(),binding_hash:digest(binding)?,
        input,status:"active".into(),observation_hash:None,accounted:false })
}

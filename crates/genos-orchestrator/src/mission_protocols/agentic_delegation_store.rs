use super::{Assignment,Binding,digest};
use rusqlite::{Connection,Transaction,OptionalExtension,params};

pub(super) fn ensure(tx:&Transaction<'_>) -> Result<(),String> {
    tx.execute_batch("CREATE TABLE IF NOT EXISTS protocol_agentic_delegations(
        run_id TEXT NOT NULL,worker_id TEXT NOT NULL,parent_agent TEXT NOT NULL,parent_turn INTEGER NOT NULL,
        call_index INTEGER NOT NULL,value_json TEXT NOT NULL,value_hash TEXT NOT NULL,
        PRIMARY KEY(run_id,worker_id),UNIQUE(run_id,parent_agent,parent_turn,call_index));").map_err(error)
}

pub(super) fn insert(tx:&Transaction<'_>, binding:&Binding, value:&Assignment) -> Result<(),String> {
    tx.execute("INSERT INTO protocol_agentic_delegations VALUES(?1,?2,?3,?4,?5,?6,?7)",params![binding.run_id,value.worker_id,
        value.parent.agent_id,value.parent.turn,value.call_index,serde_json::to_string(value).map_err(error)?,value.assignment_hash]).map_err(error)?;
    Ok(())
}

type Row=(String,String,u32,u32,String,String);

fn decode(row:Row) -> Result<Assignment,String> {
    let value:Assignment=serde_json::from_str(&row.4).map_err(error)?;
    if (&value.worker_id,&value.parent.agent_id,value.parent.turn,value.call_index,&value.assignment_hash)
        !=(&row.0,&row.1,row.2,row.3,&row.5) { return Err("AGENTIC_DELEGATION_INDEX_CHANGED".into()); }
    Ok(value)
}

fn read_row(row:&rusqlite::Row<'_>) -> rusqlite::Result<Row> {
    Ok((row.get(0)?,row.get(1)?,row.get(2)?,row.get(3)?,row.get(4)?,row.get(5)?))
}

pub(super) fn assigned(connection:&Connection, binding:&Binding, worker:&str) -> Result<Option<Assignment>,String> {
    let row:Option<Row>=connection.query_row("SELECT worker_id,parent_agent,parent_turn,call_index,value_json,value_hash
        FROM protocol_agentic_delegations WHERE run_id=?1 AND worker_id=?2",params![binding.run_id,worker],read_row)
        .optional().map_err(error)?;
    row.map(decode).transpose()
}

pub(super) fn selected(connection:&Connection, binding:&Binding, before:Option<&super::StepKey>) -> Result<Vec<Assignment>,String> {
    let mut statement=connection.prepare("SELECT worker_id,parent_agent,parent_turn,call_index,value_json,value_hash
        FROM protocol_agentic_delegations WHERE run_id=?1 AND (?2 IS NULL OR (parent_agent=?2 AND parent_turn<?3))
        ORDER BY parent_turn,call_index,worker_id").map_err(error)?;
    let rows=statement.query_map(params![binding.run_id,before.map(|key|&key.agent_id),before.map(|key|key.turn)],read_row).map_err(error)?;
    rows.map(|row|decode(row.map_err(error)?)).collect()
}

pub(super) fn missing_assignment(connection:&Connection, binding:&Binding, worker:&str) -> Result<(),String> {
    let found:bool=connection.query_row("SELECT EXISTS(SELECT 1 FROM rust_protocol_events WHERE run_id=?1
        AND protocol='MORPH' AND phase='AGENTIC_WORKER_ASSIGNED' AND json_extract(payload_json,'$.worker_id')=?2)",
        params![binding.run_id,worker],|row|row.get(0)).map_err(error)?;
    if found { return Err("AGENTIC_DELEGATION_RECORD_MISSING".into()); }
    Ok(())
}

pub(super) fn require_event(connection:&Connection, binding:&Binding, assignment:&Assignment) -> Result<(),String> {
    let payload=serde_json::to_value(assignment).map_err(error)?;
    let expected=digest(&(binding,"MORPH","AGENTIC_WORKER_ASSIGNED",&payload))?;
    let raw=serde_json::to_string(&payload).map_err(error)?;
    let found:bool=connection.query_row("SELECT EXISTS(SELECT 1 FROM rust_protocol_events WHERE run_id=?1
        AND protocol='MORPH' AND phase='AGENTIC_WORKER_ASSIGNED' AND payload_json=?2 AND digest=?3)",
        params![binding.run_id,raw,expected],|row|row.get(0)).map_err(error)?;
    if !found { return Err("AGENTIC_DELEGATION_MORPH_EVENT_CHANGED".into()); }
    Ok(())
}

pub(super) fn coverage(connection:&Connection, binding:&Binding, input:(&[Assignment],Option<&super::StepKey>)) -> Result<(),String> {
    let count:u64=connection.query_row("SELECT count(*) FROM rust_protocol_events WHERE run_id=?1 AND protocol='MORPH'
        AND phase='AGENTIC_WORKER_ASSIGNED' AND (?2 IS NULL OR (json_extract(payload_json,'$.parent.agent_id')=?2 AND json_extract(payload_json,'$.parent.turn')<?3))",
        params![binding.run_id,input.1.map(|key|&key.agent_id),input.1.map(|key|key.turn)],|row|row.get(0)).map_err(error)?;
    if count!=input.0.len() as u64 { return Err("AGENTIC_DELEGATION_EVENT_COVERAGE_CHANGED".into()); }
    Ok(())
}

pub(super) fn no_dormant_models(connection:&Connection, binding:&Binding, allowed:&std::collections::BTreeSet<String>) -> Result<(),String> {
    let mut statement=connection.prepare("SELECT DISTINCT agent_id FROM agentic_models WHERE run_id=?1").map_err(error)?;
    let rows=statement.query_map([&binding.run_id],|row|row.get::<_,String>(0)).map_err(error)?;
    for agent in rows {
        if !allowed.contains(&agent.map_err(error)?) { return Err("AGENTIC_DORMANT_WORKER_WAS_EXECUTED".into()); }
    }
    Ok(())
}

fn error(error:impl std::fmt::Display) -> String { error.to_string() }

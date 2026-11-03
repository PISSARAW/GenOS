use super::{Binding,TaskDelivery,ReturnDelivery};
use super::super::{digest,Store,Event};
use rusqlite::{Connection,Transaction,OptionalExtension,params};
use serde::{Serialize,de::DeserializeOwned};
pub(super) use super::super::gqwf_store::{sql,put};

pub(super) fn ensure(tx:&Transaction<'_>)->Result<(),String> {
    super::super::gqwf_store::ensure(tx)?;
    sql(tx.execute_batch("CREATE TABLE IF NOT EXISTS protocol_agentic_task_deliveries(
      run_id TEXT NOT NULL,worker_id TEXT NOT NULL,value_json TEXT NOT NULL,value_hash TEXT NOT NULL,PRIMARY KEY(run_id,worker_id));
      CREATE TABLE IF NOT EXISTS protocol_agentic_delegation_returns(
      run_id TEXT NOT NULL,worker_id TEXT NOT NULL,value_json TEXT NOT NULL,value_hash TEXT NOT NULL,PRIMARY KEY(run_id,worker_id));"))
}
fn decode<T:DeserializeOwned+Serialize>(row:(String,String))->Result<T,String> {
    let value:T=serde_json::from_str(&row.0).map_err(|e|e.to_string())?;
    if digest(&value)?!=row.1 { return Err("AGENTIC_DELEGATION_DELIVERY_INDEX_CHANGED".into()); } Ok(value)
}
pub(super) fn task(conn:&Connection,b:&Binding,worker:&str)->Result<Option<TaskDelivery>,String> {
    let row=sql(conn.query_row("SELECT value_json,value_hash FROM protocol_agentic_task_deliveries WHERE run_id=$1 AND worker_id=$2",
        params![b.run_id,worker],|r|Ok((r.get(0)?,r.get(1)?))).optional())?;
    row.map(decode).transpose()
}
pub(super) fn returned(conn:&Connection,b:&Binding,worker:&str)->Result<Option<ReturnDelivery>,String> {
    let row=sql(conn.query_row("SELECT value_json,value_hash FROM protocol_agentic_delegation_returns WHERE run_id=$1 AND worker_id=$2",
        params![b.run_id,worker],|r|Ok((r.get(0)?,r.get(1)?))).optional())?;
    row.map(decode).transpose()
}
pub(super) fn save_task(tx:&Transaction<'_>,b:&Binding,value:&TaskDelivery)->Result<(),String> {
    sql(tx.execute("INSERT INTO protocol_agentic_task_deliveries VALUES($1,$2,$3,$4)",
        params![b.run_id,value.worker_id,encode(value)?,digest(value)?]))?; emit(tx,b,("AGENTIC_TASK_DELIVERED",value))
}
pub(super) fn save_return(tx:&Transaction<'_>,b:&Binding,value:&ReturnDelivery)->Result<(),String> {
    sql(tx.execute("INSERT INTO protocol_agentic_delegation_returns VALUES($1,$2,$3,$4)",
        params![b.run_id,value.worker_id,encode(value)?,digest(value)?]))?;emit(tx,b,("AGENTIC_DELEGATION_RETURNED",value))
}
fn encode<T:Serialize>(value:&T)->Result<String,String> { serde_json::to_string(value).map_err(|e|e.to_string()) }
fn emit<T:Serialize>(tx:&Transaction<'_>,b:&Binding,input:(&'static str,&T))->Result<(),String> {
    Store::event(tx,b,Event {protocol:"GQWF",phase:input.0,payload:serde_json::to_value(input.1).map_err(|e|e.to_string())?})
}
pub(super) fn event<T:Serialize>(conn:&Connection,b:&Binding,input:(&str,&T))->Result<(),String> {
    let payload=serde_json::to_value(input.1).map_err(|e|e.to_string())?;
    let hash=digest(&(b,"GQWF",input.0,&payload))?;
    let count:i64=sql(conn.query_row("SELECT COUNT(*) FROM rust_protocol_events WHERE run_id=$1 AND protocol='GQWF'
        AND phase=$2 AND digest=$3 AND payload_json=$4",params![b.run_id,input.0,hash,encode(&payload)?],|r|r.get(0)))?;
    if count!=1 { return Err("AGENTIC_DELEGATION_ORIGINAL_EVENT_CHANGED".into()); } Ok(())
}
pub(super) fn cardinality(conn:&Connection,b:&Binding,expected:usize)->Result<(),String> {
    let task:i64=sql(conn.query_row("SELECT COUNT(*) FROM protocol_agentic_task_deliveries WHERE run_id=$1",[&b.run_id],|r|r.get(0)))?;
    let ret:i64=sql(conn.query_row("SELECT COUNT(*) FROM protocol_agentic_delegation_returns WHERE run_id=$1",[&b.run_id],|r|r.get(0)))?;
    let events:i64=sql(conn.query_row("SELECT COUNT(*) FROM rust_protocol_events WHERE run_id=$1 AND protocol='GQWF'
      AND phase IN ('AGENTIC_TASK_DELIVERED','AGENTIC_DELEGATION_RETURNED')",[&b.run_id],|r|r.get(0)))?;
    if (task,ret,events)!=(expected as i64,expected as i64,2*expected as i64) { return Err("AGENTIC_DELEGATION_DELIVERY_COVERAGE_CHANGED".into()); }Ok(())
}

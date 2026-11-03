use super::{Binding,Head,Publication,ReceivedData};
use super::super::{digest,raw_hash};
use rusqlite::{Connection,OptionalExtension,Transaction,params};
pub(super) use super::super::gqwf_store::{sql,put,head,head_scope};

pub(super) fn ensure(tx:&Transaction<'_>)->Result<(),String> {
    super::super::gqwf_store::ensure(tx)?;
    sql(tx.execute_batch("CREATE TABLE IF NOT EXISTS protocol_agentic_bases(run_id TEXT PRIMARY KEY,value_json TEXT NOT NULL,value_hash TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS protocol_agentic_deliveries(run_id TEXT NOT NULL,sender TEXT NOT NULL,receiver TEXT NOT NULL,
        value_json TEXT NOT NULL,value_hash TEXT NOT NULL,PRIMARY KEY(run_id,sender,receiver));
      CREATE TABLE IF NOT EXISTS protocol_agentic_publications(run_id TEXT PRIMARY KEY,value_json TEXT NOT NULL,value_hash TEXT NOT NULL);"))
}

pub(super) fn base(connection:&Connection,binding:&Binding)->Result<Option<Head>,String> {
    let row:Option<(String,String)>=sql(connection.query_row("SELECT value_json,value_hash FROM protocol_agentic_bases WHERE run_id=$1",
        [&binding.run_id],|row|Ok((row.get(0)?,row.get(1)?))).optional())?;
    row.map(decode::<Head>).transpose()
}

pub(super) fn save_base(tx:&Transaction<'_>,binding:&Binding,head:&Head)->Result<(),String> {
    sql(tx.execute("INSERT INTO protocol_agentic_bases VALUES($1,$2,$3)",params![binding.run_id,encode(head)?,digest(head)?]))?;
    Ok(())
}

pub(super) fn delivery(connection:&Connection,binding:&Binding,pair:(&str,&str))->Result<Option<ReceivedData>,String> {
    let row:Option<(String,String)>=sql(connection.query_row("SELECT value_json,value_hash FROM protocol_agentic_deliveries
        WHERE run_id=$1 AND sender=$2 AND receiver=$3",params![binding.run_id,pair.0,pair.1],|row|Ok((row.get(0)?,row.get(1)?))).optional())?;
    row.map(decode::<ReceivedData>).transpose()
}

pub(super) fn save_delivery(tx:&Transaction<'_>,binding:&Binding,value:&ReceivedData)->Result<(),String> {
    sql(tx.execute("INSERT INTO protocol_agentic_deliveries VALUES($1,$2,$3,$4,$5)",
        params![binding.run_id,value.sender_id,value.receiver_id,encode(value)?,digest(value)?]))?;
    Ok(())
}

pub(super) fn publication(connection:&Connection,binding:&Binding)->Result<Option<Publication>,String> {
    let row:Option<(String,String)>=sql(connection.query_row("SELECT value_json,value_hash FROM protocol_agentic_publications WHERE run_id=$1",
        [&binding.run_id],|row|Ok((row.get(0)?,row.get(1)?))).optional())?;
    row.map(decode::<Publication>).transpose()
}

pub(super) fn save_publication(tx:&Transaction<'_>,binding:&Binding,value:&Publication)->Result<(),String> {
    sql(tx.execute("INSERT INTO protocol_agentic_publications VALUES($1,$2,$3)",params![binding.run_id,encode(value)?,digest(value)?]))?;
    Ok(())
}

pub(super) fn bytes(connection:&Connection,input:(&str,&str))->Result<Vec<u8>,String> {
    let bytes:Vec<u8>=sql(connection.query_row("SELECT bytes FROM protocol_gqwf_objects WHERE store_id=$1 AND hash=$2",
        params![input.0,input.1],|row|row.get(0)))?;
    if raw_hash(&bytes)!=input.1 { return Err("AGENTIC_EXCHANGE_OBJECT_CORRUPT".into()); }
    Ok(bytes)
}

pub(super) fn encode<T:serde::Serialize>(value:&T)->Result<String,String> { serde_json::to_string(value).map_err(|error|error.to_string()) }
fn decode<T:serde::de::DeserializeOwned+serde::Serialize>(row:(String,String))->Result<T,String> {
    let value:T=serde_json::from_str(&row.0).map_err(|error|error.to_string())?;
    if digest(&value)?!=row.1 { return Err("AGENTIC_EXCHANGE_INDEX_CHANGED".into()); }
    Ok(value)
}

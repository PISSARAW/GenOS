use super::{Binding,WaveDescriptor,WaveMember,WaveReceipt};
use rusqlite::{Connection,OptionalExtension,Transaction,params};
use super::super::{digest,gqwf_store::sql};

pub(super) fn ensure(tx:&Transaction<'_>)->Result<(),String> {
    sql(tx.execute_batch("CREATE TABLE IF NOT EXISTS protocol_agentic_parallel_waves(
        run_id TEXT NOT NULL,wave_id TEXT NOT NULL,status TEXT NOT NULL,descriptor_json TEXT NOT NULL,descriptor_hash TEXT NOT NULL,
        PRIMARY KEY(run_id,wave_id));
      CREATE UNIQUE INDEX IF NOT EXISTS agentic_one_pending_wave ON protocol_agentic_parallel_waves(run_id) WHERE status IN ('active','stopped');
      CREATE TABLE IF NOT EXISTS protocol_agentic_parallel_members(run_id TEXT NOT NULL,agent_id TEXT NOT NULL,turn INTEGER NOT NULL,
        wave_id TEXT NOT NULL,member_hash TEXT NOT NULL,PRIMARY KEY(run_id,agent_id,turn));
      CREATE TABLE IF NOT EXISTS protocol_agentic_parallel_receipts(run_id TEXT NOT NULL,wave_id TEXT NOT NULL,revision INTEGER NOT NULL,
        receipt_json TEXT NOT NULL,receipt_hash TEXT NOT NULL,PRIMARY KEY(run_id,wave_id,revision));"))
}

pub(super) fn insert(tx:&Transaction<'_>,binding:&Binding,value:&WaveDescriptor)->Result<(),String> {
    sql(tx.execute("INSERT INTO protocol_agentic_parallel_waves VALUES($1,$2,'active',$3,$4)",params![
        binding.run_id,value.wave_id,encode(value)?,value.descriptor_hash]))?;
    for member in &value.members { insert_member(tx,(binding,&value.wave_id),member)?; }
    Ok(())
}

fn insert_member(tx:&Transaction<'_>,owner:(&Binding,&str),member:&WaveMember)->Result<(),String> {
    sql(tx.execute("INSERT INTO protocol_agentic_parallel_members VALUES($1,$2,$3,$4,$5)",params![
        owner.0.run_id,member.key.agent_id,member.key.turn,owner.1,digest(member)?]))?;
    Ok(())
}

pub(super) fn load(connection:&Connection,binding:&Binding,id:&str)->Result<(WaveDescriptor,String),String> {
    let row:(String,String,String)=sql(connection.query_row("SELECT descriptor_json,descriptor_hash,status FROM protocol_agentic_parallel_waves
        WHERE run_id=$1 AND wave_id=$2",params![binding.run_id,id],|row|Ok((row.get(0)?,row.get(1)?,row.get(2)?))))?;
    let descriptor:WaveDescriptor=decode(&row.0)?;
    if descriptor.wave_id!=id || descriptor.descriptor_hash!=row.1 { return Err("AGENTIC_WAVE_DESCRIPTOR_INDEX_CHANGED".into()); }
    super::events::descriptor(connection,binding,&descriptor)?;
    Ok((descriptor,row.2))
}

pub(super) fn ids(connection:&Connection,binding:&Binding)->Result<Vec<String>,String> {
    let mut statement=sql(connection.prepare("SELECT wave_id FROM protocol_agentic_parallel_waves WHERE run_id=$1 ORDER BY rowid"))?;
    let rows=sql(statement.query_map([&binding.run_id],|row|row.get(0)))?;
    rows.collect::<Result<Vec<_>,_>>().map_err(|error|error.to_string())
}

pub(super) fn pending(connection:&Connection,binding:&Binding)->Result<Option<String>,String> {
    sql(connection.query_row("SELECT wave_id FROM protocol_agentic_parallel_waves WHERE run_id=$1 AND status IN ('active','stopped')",
        [&binding.run_id],|row|row.get(0)).optional())
}

pub(super) fn membership(connection:&Connection,binding:&Binding,key:&super::StepKey)->Result<(String,String),String> {
    sql(connection.query_row("SELECT wave_id,member_hash FROM protocol_agentic_parallel_members WHERE run_id=$1 AND agent_id=$2 AND turn=$3",
        params![binding.run_id,key.agent_id,key.turn],|row|Ok((row.get(0)?,row.get(1)?))))
}

pub(super) fn history(connection:&Connection,binding:&Binding,id:&str)->Result<Vec<WaveReceipt>,String> {
    let mut statement=sql(connection.prepare("SELECT receipt_json,receipt_hash FROM protocol_agentic_parallel_receipts
        WHERE run_id=$1 AND wave_id=$2 ORDER BY revision"))?;
    let rows=sql(statement.query_map(params![binding.run_id,id],|row|Ok((row.get::<_,String>(0)?,row.get::<_,String>(1)?))))?;
    let values=rows.map(|row|receipt_row(id,sql(row)?)).collect::<Result<Vec<_>,_>>()?;
    super::events::receipts(connection,binding,&values)?;
    Ok(values)
}

fn receipt_row(id:&str,row:(String,String))->Result<WaveReceipt,String> {
    let value:WaveReceipt=decode(&row.0)?;
    if value.receipt_hash!=row.1 || value.wave_id!=id { return Err("AGENTIC_WAVE_RECEIPT_INDEX_CHANGED".into()); }
    Ok(value)
}

pub(super) fn save(tx:&Transaction<'_>,binding:&Binding,value:&WaveReceipt)->Result<(),String> {
    sql(tx.execute("INSERT INTO protocol_agentic_parallel_receipts VALUES($1,$2,$3,$4,$5)",params![
        binding.run_id,value.wave_id,value.revision,encode(value)?,value.receipt_hash]))?;
    let changed=sql(tx.execute("UPDATE protocol_agentic_parallel_waves SET status=$1 WHERE run_id=$2 AND wave_id=$3 AND status IN ('active','stopped')",
        params![value.status,binding.run_id,value.wave_id]))?;
    if changed!=1 { return Err("AGENTIC_WAVE_SETTLEMENT_CONFLICT".into()); }
    Ok(())
}

pub(super) fn encode<T:serde::Serialize>(value:&T)->Result<String,String> { serde_json::to_string(value).map_err(|error|error.to_string()) }
fn decode<T:serde::de::DeserializeOwned>(value:&str)->Result<T,String> { serde_json::from_str(value).map_err(|error|error.to_string()) }

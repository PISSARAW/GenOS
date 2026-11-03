use super::types::{ArtifactRecord,ToolBody};
use super::super::{Binding,digest};
use rusqlite::{Connection,OptionalExtension,Transaction,params};
pub(super) use super::super::gqwf_store::{sql,put,object_bytes};

pub(super) fn ensure(tx:&Transaction<'_>)->Result<(),String> {
    super::super::gqwf_store::ensure(tx)?;
    sql(tx.execute_batch("CREATE TABLE IF NOT EXISTS protocol_agentic_tool_receipts(
        mission_id TEXT NOT NULL,operation_id TEXT NOT NULL,binding_hash TEXT NOT NULL,agent_id TEXT NOT NULL,
        turn INTEGER NOT NULL,call_index INTEGER NOT NULL,request_hash TEXT NOT NULL,receipt_json TEXT NOT NULL,receipt_hash TEXT NOT NULL,
        PRIMARY KEY(mission_id,operation_id));
      CREATE TABLE IF NOT EXISTS protocol_agentic_artifacts(
        mission_id TEXT NOT NULL,agent_id TEXT NOT NULL,name TEXT NOT NULL,store_id TEXT NOT NULL,hash TEXT NOT NULL,
        producer_operation TEXT NOT NULL,producer_receipt_hash TEXT NOT NULL,artifact_json TEXT NOT NULL,artifact_hash TEXT NOT NULL,
        PRIMARY KEY(mission_id,agent_id,name));"))
}

pub(super) fn receipt(connection:&Connection,input:(&Binding,&str))->Result<ToolBody,String> {
    let row:(String,String)=sql(connection.query_row("SELECT receipt_json,receipt_hash FROM protocol_agentic_tool_receipts
        WHERE mission_id=$1 AND operation_id=$2",params![input.0.mission_id,input.1],|row|Ok((row.get(0)?,row.get(1)?))))?;
    let body:ToolBody=serde_json::from_str(&row.0).map_err(|error|error.to_string())?;
    if body.receipt_hash!=row.1 || body.intent.operation_id()!=input.1 { return Err("AGENTIC_TOOL_RECEIPT_INDEX_CHANGED".into()); }
    Ok(body)
}

pub(super) fn exists(connection:&Connection,input:(&Binding,&str))->Result<bool,String> {
    Ok(sql(connection.query_row("SELECT 1 FROM protocol_agentic_tool_receipts WHERE mission_id=$1 AND operation_id=$2",
        params![input.0.mission_id,input.1],|_|Ok(())).optional())?.is_some())
}

pub(super) fn object_bytes_in(connection:&Connection,input:(&str,&str))->Result<Vec<u8>,String> {
    let bytes:Vec<u8>=sql(connection.query_row("SELECT bytes FROM protocol_gqwf_objects WHERE store_id=$1 AND hash=$2",
        params![input.0,input.1],|row|row.get(0)))?;
    if super::super::raw_hash(&bytes)!=input.1 { return Err("AGENTIC_CAS_OBJECT_CORRUPT".into()); }
    Ok(bytes)
}

pub(super) fn save_receipt(tx:&Transaction<'_>,binding:&Binding,body:&ToolBody)->Result<(),String> {
    sql(tx.execute("INSERT INTO protocol_agentic_tool_receipts VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        params![binding.mission_id,body.intent.operation_id(),body.binding_hash,body.key.agent_id,body.key.turn,body.call_index,
            body.intent.request_hash,serde_json::to_string(body).map_err(|error|error.to_string())?,body.receipt_hash]))?;
    Ok(())
}

pub(super) fn artifact(connection:&Connection,input:(&Binding,&str,&str))->Result<Option<ArtifactRecord>,String> {
    let row:Option<(String,String)>=sql(connection.query_row("SELECT artifact_json,artifact_hash FROM protocol_agentic_artifacts
        WHERE mission_id=$1 AND agent_id=$2 AND name=$3",params![input.0.mission_id,input.1,input.2],
        |row|Ok((row.get(0)?,row.get(1)?))).optional())?;
    row.map(|row|decode_artifact(input,row)).transpose()
}

fn decode_artifact(input:(&Binding,&str,&str),row:(String,String))->Result<ArtifactRecord,String> {
    let artifact:ArtifactRecord=serde_json::from_str(&row.0).map_err(|error|error.to_string())?;
    if (&artifact.mission_id,artifact.agent_id.as_str(),artifact.name.as_str())!=(&input.0.mission_id,input.1,input.2)
        || digest(&artifact)?!=row.1 { return Err("AGENTIC_ARTIFACT_INDEX_CORRUPT".into()); }
    Ok(artifact)
}

pub(super) fn save_artifact(tx:&Transaction<'_>,artifact:&ArtifactRecord)->Result<(),String> {
    sql(tx.execute("INSERT INTO protocol_agentic_artifacts VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",params![
        artifact.mission_id,artifact.agent_id,artifact.name,artifact.store_id,artifact.hash,artifact.producer_operation,
        artifact.producer_receipt_hash,serde_json::to_string(artifact).map_err(|error|error.to_string())?,digest(artifact)?]))?;
    Ok(())
}

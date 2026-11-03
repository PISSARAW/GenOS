use super::{Binding,WaveDescriptor,WaveReceipt,digest};
use rusqlite::{Connection,params};
use super::super::gqwf_store::sql;

pub(super) fn descriptor(connection:&Connection,binding:&Binding,value:&WaveDescriptor)->Result<(),String> {
    require(connection,binding,("AGENTIC_WAVE_PREPARED",value))
}

pub(super) fn receipts(connection:&Connection,binding:&Binding,values:&[WaveReceipt])->Result<(),String> {
    let mut stopped=false;
    for value in values {
        let phase=if value.is_joined() && stopped { "AGENTIC_WAVE_RECOVERED" }
            else if value.is_joined() { "AGENTIC_WAVE_JOINED" } else { "AGENTIC_WAVE_STOPPED" };
        require(connection,binding,(phase,value))?;
        stopped=value.status=="stopped";
    }
    Ok(())
}

fn require<T:serde::Serialize>(connection:&Connection,binding:&Binding,input:(&str,&T))->Result<(),String> {
    let payload=serde_json::to_value(input.1).map_err(|error|error.to_string())?;
    let expected=digest(&(binding,"OMEGA",input.0,&payload))?;
    let raw=serde_json::to_string(&payload).map_err(|error|error.to_string())?;
    let found:bool=sql(connection.query_row("SELECT EXISTS(SELECT 1 FROM rust_protocol_events
        WHERE run_id=$1 AND protocol='OMEGA' AND phase=$2 AND digest=$3 AND payload_json=$4)",
        params![binding.run_id,input.0,expected,raw],|row|row.get(0)))?;
    if !found { return Err("AGENTIC_WAVE_ORIGINAL_EVENT_REQUIRED".into()); }
    Ok(())
}

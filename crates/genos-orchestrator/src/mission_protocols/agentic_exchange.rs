//! Copies CAS adressées entre agents et publication locale atomique.
#[path="agentic_exchange_store.rs"] mod data;
#[path="agentic_exchange_publish.rs"] mod commit;
pub use super::gqwf::Head;
pub use commit::{Publication,publish,publication,result_bytes};
use super::{Binding,Event,Store,digest,raw_hash,agentic_ledger};
use rusqlite::{Connection,Transaction};
use serde::{Deserialize,Serialize};
use serde_json::json;

#[derive(Clone,Debug,Deserialize,Serialize,PartialEq,Eq)]
pub struct ReceivedArtifact { pub agent_id:String,pub name:String,pub hash:String,pub text:String,pub store_id:String }
#[derive(Clone,Debug,Deserialize,Serialize,PartialEq,Eq)]
pub struct ReceivedData {
    pub sender_id:String,pub receiver_id:String,pub result:agentic_ledger::CompletedAgent,
    pub artifacts:Vec<ReceivedArtifact>,pub payload_hash:String,pub receipt_hash:String,
}
pub type DeliveryReceipt=ReceivedData;

pub fn initialize(store:&mut Store,binding:&Binding)->Result<Head,String> {
    let head=super::gqwf::initialize(store,binding)?;
    store.transaction(binding,|tx| {
        data::ensure(tx)?;
        super::agentic_tools::ensure_in(tx)?;
        super::agentic_delegation_exchange::initialize_in(tx)?;
        if let Some(base)=data::base(tx,binding)? { return Ok(base); }
        data::save_base(tx,binding,&head)?;
        Ok(head)
    })
}

pub(crate) fn base_in(connection:&Connection,binding:&Binding)->Result<Head,String> {
    data::base(connection,binding)?.ok_or("AGENTIC_EXCHANGE_BASE_NOT_INITIALIZED".into())
}

fn namespaces(binding:&Binding,pair:(&str,&str))->Result<(String,String),String> {
    Ok((digest(&(binding,"agentic-sender",pair.0))?,digest(&(binding,"agentic-receiver",pair.0,pair.1))?))
}

pub fn receive(store:&mut Store,binding:&Binding,receiver:&str)->Result<Vec<DeliveryReceipt>,String> {
    store.transaction(binding,|tx| {
        data::ensure(tx)?;
        let spec=super::agentic_admission::admitted_in(tx,binding)?;
        let agent=spec.agent(receiver)?;
        for sender in &agent.depends_on { receive_one(tx,binding,(sender,receiver))?; }
        received_in(tx,binding,receiver)
    })
}

pub(crate) fn receive_one(tx:&Transaction<'_>,binding:&Binding,pair:(&str,&str))->Result<(),String> {
    if data::delivery(tx,binding,pair)?.is_some() { validate_delivery(tx,binding,pair)?;return Ok(()); }
    let packet=material(tx,binding,pair)?;
    let stores=namespaces(binding,pair)?;
    copy_packet(tx,(&stores.0,&stores.1),&packet)?;
    data::save_delivery(tx,binding,&packet)?;
    Store::event(tx,binding,Event { protocol:"GQWF",phase:"AGENT_DATA_RECEIVED",payload:json!(packet) })
}

fn copy_packet(tx:&Transaction<'_>,stores:(&str,&str),packet:&ReceivedData)->Result<(),String> {
    copy(tx,stores,(&packet.result.result_hash,packet.result.text.as_bytes()))?;
    for artifact in &packet.artifacts { copy(tx,stores,(&artifact.hash,artifact.text.as_bytes()))?; }
    copy(tx,stores,(&packet.payload_hash,&payload(packet)?))
}

fn copy(tx:&Transaction<'_>,stores:(&str,&str),object:(&str,&[u8]))->Result<(),String> {
    data::put(tx,(stores.0,object.0,object.1))?;
    let bytes=data::bytes(tx,(stores.0,object.0))?;
    data::put(tx,(stores.1,object.0,&bytes))
}

fn material(connection:&Connection,binding:&Binding,pair:(&str,&str))->Result<ReceivedData,String> {
    let result=agentic_ledger::completed_in(connection,binding,pair.0)?.ok_or("AGENTIC_DEPENDENCY_NOT_COMPLETED")?;
    if raw_hash(result.text.as_bytes())!=result.result_hash { return Err("AGENTIC_DEPENDENCY_RESULT_CHANGED".into()); }
    let stores=namespaces(binding,pair)?;
    let mut artifacts=Vec::new();
    for artifact in super::agentic_tools::artifact_records_in(connection,binding,pair.0)? {
        artifacts.push(received_artifact(connection,&artifact,&stores.1)?);
    }
    let mut packet=ReceivedData { sender_id:pair.0.into(),receiver_id:pair.1.into(),result,artifacts,
        payload_hash:String::new(),receipt_hash:String::new() };
    packet.payload_hash=raw_hash(&payload(&packet)?);
    packet.receipt_hash=digest(&("genos.agentic.delivery/v1",binding,&packet))?;
    Ok(packet)
}

fn received_artifact(connection:&Connection,artifact:&super::agentic_tools::ArtifactRecord,store_id:&str)->Result<ReceivedArtifact,String> {
    let bytes=super::agentic_tools::object_in(connection,(&artifact.store_id,&artifact.hash))?;
    Ok(ReceivedArtifact { agent_id:artifact.agent_id.clone(),name:artifact.name.clone(),hash:artifact.hash.clone(),
        text:String::from_utf8(bytes).map_err(|_|"AGENTIC_RECEIVED_ARTIFACT_UTF8_INVALID")?,store_id:store_id.into() })
}

fn payload(packet:&ReceivedData)->Result<Vec<u8>,String> {
    serde_json::to_vec(&("genos.agentic.packet/v1",&packet.sender_id,&packet.receiver_id,&packet.result,&packet.artifacts))
        .map_err(|error|error.to_string())
}

pub(crate) fn validate_delivery(connection:&Connection,binding:&Binding,pair:(&str,&str))->Result<ReceivedData,String> {
    let expected=material(connection,binding,pair)?;
    let stored=data::delivery(connection,binding,pair)?.ok_or("AGENTIC_DEPENDENCY_NOT_RECEIVED")?;
    if stored!=expected { return Err("AGENTIC_RECEIVED_DESCRIPTOR_CHANGED".into()); }
    physical(connection,binding,&stored)?;
    delivery_event(connection,binding,&stored)?;
    Ok(stored)
}

fn physical(connection:&Connection,binding:&Binding,packet:&ReceivedData)->Result<(),String> {
    let stores=namespaces(binding,(&packet.sender_id,&packet.receiver_id))?;
    let bytes=data::bytes(connection,(&stores.1,&packet.payload_hash))?;
    if bytes!=payload(packet)? || data::bytes(connection,(&stores.1,&packet.result.result_hash))?!=packet.result.text.as_bytes() {
        return Err("AGENTIC_RECEIVED_PACKET_CORRUPT".into());
    }
    for artifact in &packet.artifacts {
        if data::bytes(connection,(&artifact.store_id,&artifact.hash))?!=artifact.text.as_bytes() {
            return Err("AGENTIC_RECEIVED_ARTIFACT_CORRUPT".into());
        }
    }
    Ok(())
}

pub fn received_in(connection:&Connection,binding:&Binding,receiver:&str)->Result<Vec<ReceivedData>,String> {
    super::store::current_checked(connection,binding)?;
    let spec=super::agentic_admission::admitted_in(connection,binding)?;
    let agent=spec.agent(receiver)?;
    let mut packets=Vec::new();
    for sender in &agent.depends_on { packets.push(validate_delivery(connection,binding,(sender,receiver))?); }
    Ok(packets)
}

pub(crate) fn received_artifact_in(connection:&Connection,binding:&Binding,input:(&str,&str,&str))->Result<Option<ReceivedArtifact>,String> {
    let packets=received_in(connection,binding,input.0)?;
    Ok(packets.into_iter().filter(|packet|packet.sender_id==input.1).flat_map(|packet|packet.artifacts)
        .find(|artifact|artifact.agent_id==input.1 && artifact.name==input.2))
}

fn delivery_event(connection:&Connection,binding:&Binding,packet:&ReceivedData)->Result<(),String> {
    let payload=serde_json::to_value(packet).map_err(|e|e.to_string())?;
    let hash=digest(&(binding,"GQWF","AGENT_DATA_RECEIVED",&payload))?;
    let count:i64=connection.query_row("SELECT COUNT(*) FROM rust_protocol_events WHERE run_id=$1 AND protocol='GQWF'
        AND phase='AGENT_DATA_RECEIVED' AND digest=$2 AND payload_json=$3",rusqlite::params![binding.run_id,hash,
        serde_json::to_string(&payload).map_err(|e|e.to_string())?],|r|r.get(0)).map_err(|e|e.to_string())?;
    if count!=1 { return Err("AGENTIC_DELIVERY_ORIGINAL_EVENT_CHANGED".into()); }Ok(())
}

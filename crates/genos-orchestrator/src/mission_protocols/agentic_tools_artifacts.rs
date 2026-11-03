use super::{ArtifactRecord,ToolReceipt,data,dispatch};
use super::super::{Binding,digest,raw_hash};
use rusqlite::{Connection,Transaction};

pub(super) fn namespace(binding:&Binding,agent:&str)->Result<String,String> {
    digest(&("genos.agentic.artifacts/v1",binding,agent))
}

pub(super) fn load(connection:&Connection,binding:&Binding,input:(&str,&str))->Result<ArtifactRecord,String> {
    super::super::store::current_checked(connection,binding)?;
    let artifact=data::artifact(connection,(binding,input.0,input.1))?.ok_or("AGENTIC_ARTIFACT_NOT_FOUND")?;
    let receipt=super::receipt_in(connection,binding,&artifact.producer_operation)?;
    let expected=namespace(binding,input.0)?;
    let bytes=data::object_bytes_in(connection,(&artifact.store_id,&artifact.hash))?;
    if artifact.store_id!=expected || receipt.receipt_hash()!=artifact.producer_receipt_hash || bytes.len() as u64!=artifact.bytes {
        return Err("AGENTIC_ARTIFACT_PROVENANCE_CHANGED".into());
    }
    assert_created(&artifact,&receipt)?;
    Ok(artifact)
}

fn assert_created(artifact:&ArtifactRecord,receipt:&ToolReceipt)->Result<(),String> {
    let data=&receipt.core.output["data"];
    if receipt.core.name!="write_artifact" || receipt.core.output["status"]!="ok" || data["created"]!=true {
        return Err("AGENTIC_ARTIFACT_CREATION_RECEIPT_REQUIRED".into());
    }
    if data["agent_id"]!=artifact.agent_id || data["name"]!=artifact.name || data["hash"]!=artifact.hash {
        return Err("AGENTIC_ARTIFACT_RECEIPT_SUBJECT_CHANGED".into());
    }
    Ok(())
}

pub(super) fn records(connection:&Connection,binding:&Binding,agent:&str)->Result<Vec<ArtifactRecord>,String> {
    let spec=super::super::agentic_admission::admitted_in(connection,binding)?;
    let config=spec.agent(agent)?;
    let mut records=Vec::new();
    for name in &config.artifact_names {
        if data::artifact(connection,(binding,agent,name))?.is_some() { records.push(load(connection,binding,(agent,name))?); }
    }
    Ok(records)
}

pub(super) fn finish(tx:&Transaction<'_>,_binding:&Binding,input:(&dispatch::Outcome,&ToolReceipt))->Result<(),String> {
    if let Some(value)=&input.0.artifact {
        let mut artifact=value.clone();
        artifact.producer_receipt_hash=input.1.receipt_hash().into();
        artifact.producer_operation=input.1.core.intent.operation_id();
        data::save_artifact(tx,&artifact)?;
    }
    Ok(())
}

pub(super) fn create(tx:&Transaction<'_>,binding:&Binding,input:(&str,&str,&str))->Result<dispatch::Outcome,String> {
    let hash=raw_hash(input.2.as_bytes());
    if let Some(previous)=data::artifact(tx,(binding,input.0,input.1))? {
        load(tx,binding,(input.0,input.1))?;
        if previous.hash!=hash { return Ok(dispatch::denied("write_artifact","AGENTIC_ARTIFACT_IMMUTABLE_NAME_CONFLICT")); }
        return Ok(output(&previous,false,None));
    }
    let artifact=ArtifactRecord { mission_id:binding.mission_id.clone(),agent_id:input.0.into(),name:input.1.into(),
        store_id:namespace(binding,input.0)?,hash,bytes:input.2.len() as u64,producer_operation:String::new(),producer_receipt_hash:String::new() };
    data::put(tx,(&artifact.store_id,&artifact.hash,input.2.as_bytes()))?;
    Ok(output(&artifact,true,Some(artifact.clone())))
}

fn output(artifact:&ArtifactRecord,created:bool,pending:Option<ArtifactRecord>)->dispatch::Outcome {
    dispatch::Outcome { output:serde_json::json!({"status":"ok","tool":"write_artifact","data":{
        "agent_id":artifact.agent_id,"name":artifact.name,"hash":artifact.hash,"bytes":artifact.bytes,"created":created}}),
        objects:vec![super::ObjectRef { store_id:artifact.store_id.clone(),hash:artifact.hash.clone() }],artifact:pending }
}

use super::{ArtifactRecord,ObjectRef,artifacts,data};
use super::super::{Binding,agentic_ledger::ModelRecord};
use genos_api::native_inference::ToolCall;
use rusqlite::Transaction;
use serde::Deserialize;
use serde_json::{Value,json};

pub(super) struct Outcome { pub output:Value,pub objects:Vec<ObjectRef>,pub artifact:Option<ArtifactRecord> }
#[derive(Deserialize)] #[serde(deny_unknown_fields)] struct ReadSource { path:String }
#[derive(Deserialize)] #[serde(deny_unknown_fields)] struct WriteArtifact { name:String,text:String }
#[derive(Deserialize)] #[serde(deny_unknown_fields)] struct ReadArtifact { agent_id:String,name:String }
#[derive(Deserialize)] #[serde(deny_unknown_fields)] struct Empty {}

pub(super) fn denied(tool:&str,code:&str)->Outcome {
    Outcome { output:json!({"status":"denied","tool":tool,"error":{"code":code}}),objects:vec![],artifact:None }
}
fn ok(tool:&str,value:Value)->Outcome { Outcome { output:json!({"status":"ok","tool":tool,"data":value}),objects:vec![],artifact:None } }

pub(super) fn run(tx:&Transaction<'_>,binding:&Binding,input:(&ModelRecord,&ToolCall))->Result<Outcome,String> {
    let spec=super::super::agentic_admission::admitted_in(tx,binding)?;
    let agent=spec.agent(&input.0.key.agent_id)?;
    if !agent.tools.iter().any(|kind|kind.as_str()==input.1.name) { return Ok(denied(&input.1.name,"AGENTIC_TOOL_NOT_GRANTED")); }
    let outcome=match input.1.name.as_str() {
        "read_source"=>read_source(&spec,&input.1.arguments),
        "list_sources"=>list_sources(&spec,&input.1.arguments),
        "write_artifact"=>return write(tx,binding,(&input.0.key.agent_id,&input.1.arguments)),
        "read_artifact"=>return read(tx,binding,(&input.0.key,&input.1.arguments)),
        "delegate_task"=>return delegate(tx,binding,input),
        _=>denied(&input.1.name,"AGENTIC_TOOL_NOT_INSTALLED"),
    };
    Ok(outcome)
}

fn delegate(tx:&Transaction<'_>,binding:&Binding,input:(&ModelRecord,&ToolCall))->Result<Outcome,String> {
    let output=super::super::agentic_delegation::delegate_in(tx,binding,input)?;
    Ok(Outcome { output,objects:vec![],artifact:None })
}

fn read_source(spec:&super::super::agentic_spec::AgenticSpec,args:&Value)->Outcome {
    let Ok(input)=serde_json::from_value::<ReadSource>(args.clone()) else { return denied("read_source","AGENTIC_TOOL_ARGUMENTS_INVALID"); };
    if super::super::agentic_source::selected(&input.path).is_err() { return denied("read_source","AGENTIC_SOURCE_PATH_NOT_ADMITTED"); }
    match spec.source.documents.iter().find(|doc|doc.path==input.path) {
        Some(doc)=>ok("read_source",json!({"path":doc.path,"hash":doc.hash,"text":doc.text})),
        None=>denied("read_source","AGENTIC_SOURCE_PATH_NOT_ADMITTED"),
    }
}

fn list_sources(spec:&super::super::agentic_spec::AgenticSpec,args:&Value)->Outcome {
    if serde_json::from_value::<Empty>(args.clone()).is_err() { return denied("list_sources","AGENTIC_TOOL_ARGUMENTS_INVALID"); }
    let docs:Vec<Value>=spec.source.documents.iter().map(|doc|json!({"path":doc.path,"hash":doc.hash,"bytes":doc.text.len()})).collect();
    ok("list_sources",json!({"sources":docs}))
}

fn write(tx:&Transaction<'_>,binding:&Binding,input:(&str,&Value))->Result<Outcome,String> {
    let Ok(args)=serde_json::from_value::<WriteArtifact>(input.1.clone()) else { return Ok(denied("write_artifact","AGENTIC_TOOL_ARGUMENTS_INVALID")); };
    let spec=super::super::agentic_admission::admitted_in(tx,binding)?;
    let agent=spec.agent(input.0)?;
    if !super::super::agentic_spec::valid_name(&args.name) || !agent.artifact_names.contains(&args.name) || args.text.len()>65536 {
        return Ok(denied("write_artifact","AGENTIC_ARTIFACT_NOT_GRANTED_OR_OVERSIZED"));
    }
    artifacts::create(tx,binding,(input.0,&args.name,&args.text))
}

fn read(tx:&Transaction<'_>,binding:&Binding,input:(&super::super::agentic_ledger::StepKey,&Value))->Result<Outcome,String> {
    let Ok(args)=serde_json::from_value::<ReadArtifact>(input.1.clone()) else { return Ok(denied("read_artifact","AGENTIC_TOOL_ARGUMENTS_INVALID")); };
    let spec=super::super::agentic_admission::admitted_in(tx,binding)?;
    let agent=spec.agent(&input.0.agent_id)?;
    if !super::super::agentic_spec::valid_name(&args.name) { return Ok(denied("read_artifact","AGENTIC_ARTIFACT_NOT_GRANTED")); }
    if args.agent_id==input.0.agent_id { return read_own(tx,binding,(&args.agent_id,&args.name)); }
    if !agent.depends_on.contains(&args.agent_id) { return read_delegated(tx,binding,(input.0,&args)); }
    match super::super::agentic_exchange::received_artifact_in(tx,binding,(&input.0.agent_id,&args.agent_id,&args.name))? {
        Some(artifact)=>read_output("read_artifact",artifact),
        None=>Ok(denied("read_artifact","AGENTIC_ARTIFACT_NOT_FOUND")),
    }
}

fn read_delegated(tx:&Transaction<'_>,binding:&Binding,input:(&super::super::agentic_ledger::StepKey,&ReadArtifact))->Result<Outcome,String> {
    match super::super::agentic_delegation_exchange::received_artifact_in(tx,binding,(input.0,&input.1.agent_id,&input.1.name))? {
        Some(artifact)=>read_output("read_artifact",artifact),
        None=>Ok(denied("read_artifact","AGENTIC_ARTIFACT_NOT_GRANTED")),
    }
}

fn read_own(tx:&Transaction<'_>,binding:&Binding,input:(&str,&str))->Result<Outcome,String> {
    if data::artifact(tx,(binding,input.0,input.1))?.is_none() { return Ok(denied("read_artifact","AGENTIC_ARTIFACT_NOT_FOUND")); }
    let artifact=artifacts::load(tx,binding,input)?;
    let bytes=data::object_bytes(tx,(&artifact.store_id,&artifact.hash))?;
    let text=String::from_utf8(bytes).map_err(|_|"AGENTIC_ARTIFACT_UTF8_INVALID")?;
    read_output("read_artifact",super::super::agentic_exchange::ReceivedArtifact {
        agent_id:artifact.agent_id,name:artifact.name,hash:artifact.hash,text,store_id:artifact.store_id })
}

fn read_output(tool:&str,artifact:super::super::agentic_exchange::ReceivedArtifact)->Result<Outcome,String> {
    Ok(Outcome { output:json!({"status":"ok","tool":tool,"data":{"agent_id":artifact.agent_id,"name":artifact.name,"hash":artifact.hash,"text":artifact.text}}),
        objects:vec![ObjectRef { store_id:artifact.store_id,hash:artifact.hash }],artifact:None })
}

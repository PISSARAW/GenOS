use super::fixture::Pending;
use genos_orchestrator::mission_protocols::{Store,agentic_source,agentic_spec::ToolKind,agentic_ledger as ledger,agentic_context,agentic_exchange,llm_source};
use std::sync::{Arc,atomic::AtomicUsize};

pub fn prepare()->Pending {
    let mut original=super::fixture::unprepared();
    let listener=original.listener.take().unwrap();
    let env_hash=original.spec.env_hash.clone();
    let mut config=original.spec.config.clone();drop(original);
    config.agents[0].tools=vec![ToolKind::WriteArtifact];config.agents[0].artifact_names=vec!["notes".into()];
    config.agents[1].id="writer".into();config.agents[1].tools=vec![ToolKind::ListSources,ToolKind::ReadArtifact];
    config.agents[1].artifact_names.clear();
    let directory=tempfile::TempDir::new().unwrap();
    std::fs::write(directory.path().join("notes.txt"),"Actually selected source bytes.").unwrap();
    std::fs::write(directory.path().join("agentic.json"),serde_json::to_vec(&config).unwrap()).unwrap();
    let source=agentic_source::read(directory.path(),"agentic.json").unwrap();
    let spec=source.specification(llm_source::MissionIdentity { mission_id:uuid::Uuid::new_v4().to_string(),
        workspace:directory.path().into(),mission:"Transmit an actual CAS artifact between configured agents".into(),
        timeout_ms:180000,env_hash }).unwrap();
    let mut store=Store::open(&directory.path().join("ledger.sqlite")).unwrap();
    let binding=store.admit_agentic(&spec).unwrap();
    ledger::initialize(&mut store,&binding).unwrap();agentic_exchange::initialize(&mut store,&binding).unwrap();
    agentic_exchange::receive(&mut store,&binding,"reader").unwrap();
    let key=ledger::StepKey { agent_id:"reader".into(),turn:0 };
    let request=agentic_context::prepare(&mut store,&binding,&key).unwrap();
    let mut result=Pending { source,store,binding,spec,key,request,permit:None,listener:Some(listener),
        requests:Arc::new(AtomicUsize::new(0)),directory };
    result.prepare_permit();result
}

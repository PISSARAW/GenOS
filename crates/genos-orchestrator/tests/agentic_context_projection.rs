#![cfg(feature="native-llm")]
#[path="helpers/agentic_ledger_fixture.rs"] mod fixture;
#[path="helpers/agentic_tools_fixture.rs"] mod artifact_fixture;
use genos_orchestrator::mission_protocols::{agentic_context,agentic_exchange,agentic_ledger as ledger,agentic_tools,digest};
use genos_api::native_inference::{ToolMessage,tool_request_hash};
use serde_json::{Value,json};
use std::sync::atomic::Ordering;

const TEXT:&str="Sources : receipt_hash et store_id sont des mots du document, pas des champs à retirer.\nLimites : texte exact préservé.";
const ARTIFACT:&str="Artefact exact : payload_hash, receipt_hash, binding_hash. Unicode : épreuve.";

#[test]
fn model_receives_exact_dependency_text_without_receipt_fields_but_journal_keeps_the_full_packet() {
    let mut f=fixture::prepare();
    let reader=f.complete(fixture::response(TEXT)); f.finish_agent(&reader);
    let packets=agentic_exchange::receive(&mut f.store,&f.binding,"author").unwrap();
    f.prepare_step("author",0);
    assert_projection(&f,json!([{"agent_id":"reader","text":TEXT,"artifacts":[]}]),&packets);
    let expected=tool_request_hash(&f.request).unwrap();
    let observed=f.complete(fixture::response("Sources : source. Limites : bounded contract."));
    assert_eq!(observed.request_hash,expected);
    assert_eq!(f.requests.load(Ordering::SeqCst),2);
    let stored=stored_context(&f);
    let mut changed=stored.clone();
    changed["payload"]["dependencies"][0]["receipt_hash"]="changed-only-durable-provenance".into();
    assert_eq!(changed["payload"]["messages"],stored["payload"]["messages"]);
    assert_ne!(digest(&changed["payload"]).unwrap(),f.request.base.input_hash);
    let db=rusqlite::Connection::open(f.directory.path().join("ledger.sqlite")).unwrap();
    db.execute("UPDATE protocol_agentic_contexts SET context_json=?1 WHERE run_id=?2 AND agent_id='author' AND turn=0",
        rusqlite::params![serde_json::to_string(&changed).unwrap(),f.binding.run_id]).unwrap();
    assert!(ledger::model_record(&mut f.store,&f.binding,&f.key).is_err());
    assert_eq!(f.requests.load(Ordering::SeqCst),2);
}

#[test]
fn artifact_projection_uses_the_revalidated_receiver_copy_and_keeps_literal_hash_words() {
    let mut f=artifact_fixture::prepare();
    let tool=f.complete(fixture::tool("write_artifact",json!({"name":"notes","text":ARTIFACT}),"write-notes"));
    agentic_tools::execute(&mut f.store,&f.binding,&tool.key).unwrap();
    f.prepare_step("reader",1);
    let reader=f.complete(fixture::response(TEXT)); f.finish_agent(&reader);
    let packets=agentic_exchange::receive(&mut f.store,&f.binding,"writer").unwrap();
    f.prepare_step("writer",0);
    assert_projection(&f,json!([{"agent_id":"reader","text":TEXT,"artifacts":[
        {"agent_id":"reader","name":"notes","text":ARTIFACT}]}]),&packets);
    let copied=&packets[0].artifacts[0];
    let db=rusqlite::Connection::open(f.directory.path().join("ledger.sqlite")).unwrap();
    let bytes:Vec<u8>=db.query_row("SELECT bytes FROM protocol_gqwf_objects WHERE store_id=?1 AND hash=?2",
        rusqlite::params![copied.store_id,copied.hash],|row|row.get(0)).unwrap();
    assert_eq!(bytes,ARTIFACT.as_bytes());
    db.execute("UPDATE protocol_gqwf_objects SET bytes=X'00' WHERE store_id=?1 AND hash=?2",
        rusqlite::params![copied.store_id,copied.hash]).unwrap();
    assert!(agentic_context::prepare(&mut f.store,&f.binding,&f.key).is_err());
    assert_eq!(f.requests.load(Ordering::SeqCst),2);
}

fn model_data(f:&fixture::Pending) -> Value {
    f.request.messages.iter().find_map(|message| {
        let ToolMessage::User { content }=message else { return None; };
        let value:Value=serde_json::from_str(content).ok()?;
        (value["schema"]=="genos.rust-agentic-inputs/v1").then_some(value)
    }).expect("typed model inputs missing")
}

fn stored_context(f:&fixture::Pending) -> Value {
    let db=rusqlite::Connection::open(f.directory.path().join("ledger.sqlite")).unwrap();
    let raw:String=db.query_row("SELECT context_json FROM protocol_agentic_contexts WHERE run_id=?1 AND agent_id=?2 AND turn=?3",
        rusqlite::params![f.binding.run_id,f.key.agent_id,f.key.turn],|row|row.get(0)).unwrap();
    serde_json::from_str(&raw).unwrap()
}

fn assert_projection(f:&fixture::Pending, expected:Value, packets:&[agentic_exchange::ReceivedData]) {
    let data=model_data(f);
    assert_eq!(data["dependencies"],expected);
    assert_eq!(data["sources"],json!([{"path":f.spec.source.documents[0].path,"hash":f.spec.source.documents[0].hash}]));
    let stored=stored_context(f);
    assert_eq!(stored["payload"]["dependencies"],serde_json::to_value(packets).unwrap());
    assert_eq!(stored["payload"]["dependencies"][0]["receipt_hash"],packets[0].receipt_hash);
    assert!(!packets[0].receipt_hash.is_empty());
    assert!(!packets[0].result.completion_hash.is_empty());
    assert_eq!(stored["hash"],f.request.base.context_hash);
    assert_eq!(digest(&stored["payload"]).unwrap(),f.request.base.input_hash);
}

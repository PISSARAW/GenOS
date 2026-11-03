#![cfg(feature="native-llm")]
#[path="helpers/agentic_ledger_fixture.rs"] mod fixture;
#[path="helpers/agentic_tools_fixture.rs"] mod artifact_fixture;
use genos_orchestrator::mission_protocols::{agentic_ledger as ledger,agentic_tools as tools,raw_hash};
use rusqlite::Connection;
use serde_json::{Value,json};
use std::sync::atomic::Ordering;

#[test]
fn source_tools_use_the_admitted_snapshot_and_replay_without_another_charge() {
    let mut f=fixture::prepare();
    let mut response=fixture::tool("read_source",json!({"path":"notes.txt"}),"read");
    response["message"]["tool_calls"].as_array_mut().unwrap().push(
        json!({"id":"list","type":"function","function":{"name":"list_sources","arguments":{}}}));
    let model=f.complete(response);
    let first=tools::execute(&mut f.store,&f.binding,&model.key).unwrap();
    assert_eq!(first[0].output()["data"]["text"],f.spec.source.documents[0].text);
    assert_eq!(first[1].output()["data"]["sources"][0]["hash"],f.spec.source.documents[0].hash);
    let before=ledger::state(&mut f.store,&f.binding).unwrap();
    attempt_live_change(&f);
    let replay=tools::execute(&mut f.store,&f.binding,&model.key).unwrap();
    assert_eq!(serde_json::to_value(first).unwrap(),serde_json::to_value(replay).unwrap());
    assert_eq!(before,ledger::state(&mut f.store,&f.binding).unwrap());
    assert_eq!(f.requests.load(Ordering::SeqCst),1);
}

fn attempt_live_change(f:&fixture::Pending) {
    match std::fs::write(f.directory.path().join("notes.txt"),"later live text is not the snapshot") {
        Ok(())=>{},
        Err(error) if error.kind()==std::io::ErrorKind::PermissionDenied=>{},
        Err(error) if cfg!(windows) && matches!(error.raw_os_error(),Some(32|33))=>{},
        Err(error)=>panic!("unexpected source write failure: {error}"),
    }
}

#[test]
fn traversal_is_a_charged_typed_denial_without_leaking_a_file() {
    let mut f=fixture::prepare();
    std::fs::write(f.directory.path().join("private.txt"),"PRIVATE_MARKER").unwrap();
    let model=f.complete(fixture::tool("read_source",json!({"path":"../private.txt"}),"escape"));
    let receipt=tools::execute(&mut f.store,&f.binding,&model.key).unwrap().remove(0);
    assert_eq!(receipt.output()["status"],"denied");
    assert_eq!(receipt.output()["error"]["code"],"AGENTIC_SOURCE_PATH_NOT_ADMITTED");
    assert!(!serde_json::to_string(receipt.output()).unwrap().contains("PRIVATE_MARKER"));
    assert_eq!(ledger::state(&mut f.store,&f.binding).unwrap().spent.tool_calls,1);
}

fn author(f:&mut fixture::Pending) {
    let reader=f.complete(fixture::response("Sources: native snapshot. Limites: no semantic truth claim."));
    f.finish_agent(&reader);
    f.prepare_step("author",0);
}

#[test]
fn artifact_names_are_immutable_and_the_receipt_is_bound_to_actual_cas_bytes() {
    let mut f=fixture::prepare();author(&mut f);
    let model=f.complete(fixture::tool("write_artifact",json!({"name":"draft","text":"original"}),"write"));
    let first=tools::execute(&mut f.store,&f.binding,&model.key).unwrap().remove(0);
    assert_eq!(first.output()["data"]["created"],true);
    f.prepare_step("author",1);
    let model=f.complete(fixture::tool("write_artifact",json!({"name":"draft","text":"replacement"}),"overwrite"));
    let refusal=tools::execute(&mut f.store,&f.binding,&model.key).unwrap().remove(0);
    assert_eq!(refusal.output()["status"],"denied");
    let connection=Connection::open(f.directory.path().join("ledger.sqlite")).unwrap();
    let artifact=tools::artifact_in(&connection,&f.binding,("author","draft")).unwrap();
    assert_eq!(artifact.hash,raw_hash(b"original"));
    let bytes:Vec<u8>=connection.query_row("SELECT bytes FROM protocol_gqwf_objects WHERE store_id=?1 AND hash=?2",
        rusqlite::params![artifact.store_id,artifact.hash],|row|row.get(0)).unwrap();
    assert_eq!(bytes,b"original");
    assert_eq!(ledger::state(&mut f.store,&f.binding).unwrap().spent.tool_calls,2);
}

#[test]
fn forged_tool_receipt_and_corrupt_artifact_are_rejected_on_read() {
    let mut f=fixture::prepare();author(&mut f);
    let model=f.complete(fixture::tool("write_artifact",json!({"name":"draft","text":"actual"}),"write"));
    let receipt=tools::execute(&mut f.store,&f.binding,&model.key).unwrap().remove(0);
    let connection=Connection::open(f.directory.path().join("ledger.sqlite")).unwrap();
    let operation=format!("tool/author/0/{}",receipt.call_index());
    let raw:String=connection.query_row("SELECT receipt_json FROM protocol_agentic_tool_receipts WHERE operation_id=?1",
        [&operation],|row|row.get(0)).unwrap();
    let mut forged:Value=serde_json::from_str(&raw).unwrap();forged["output"]["data"]["hash"]=raw_hash(b"forged").into();
    connection.execute("UPDATE protocol_agentic_tool_receipts SET receipt_json=?1 WHERE operation_id=?2",
        rusqlite::params![serde_json::to_string(&forged).unwrap(),operation]).unwrap();
    assert!(tools::receipt_in(&connection,&f.binding,&operation).is_err());
    connection.execute("UPDATE protocol_agentic_tool_receipts SET receipt_json=?1 WHERE operation_id=?2",rusqlite::params![raw,operation]).unwrap();
    let artifact=tools::artifact_in(&connection,&f.binding,("author","draft")).unwrap();
    connection.execute("UPDATE protocol_gqwf_objects SET bytes=X'00' WHERE store_id=?1 AND hash=?2",
        rusqlite::params![artifact.store_id,artifact.hash]).unwrap();
    assert!(tools::artifact_in(&connection,&f.binding,("author","draft")).is_err());
}

#[test]
fn a_tool_receipt_failure_rolls_back_cas_intent_and_usage_together() {
    let mut f=fixture::prepare();author(&mut f);
    let model=f.complete(fixture::tool("write_artifact",json!({"name":"draft","text":"rollback"}),"write"));
    let connection=Connection::open(f.directory.path().join("ledger.sqlite")).unwrap();
    connection.execute_batch("CREATE TRIGGER test_tool_abort BEFORE INSERT ON protocol_agentic_tool_receipts
        BEGIN SELECT RAISE(ABORT,'TEST_TOOL_RECEIPT_ABORT'); END").unwrap();
    assert!(tools::execute(&mut f.store,&f.binding,&model.key).unwrap_err().contains("TEST_TOOL_RECEIPT_ABORT"));
    let count:u64=connection.query_row("SELECT count(*) FROM protocol_agentic_artifacts",[],|row|row.get(0)).unwrap();
    assert_eq!(count,0);
    let objects:u64=connection.query_row("SELECT count(*) FROM protocol_gqwf_objects WHERE hash=?1",[raw_hash(b"rollback")],|row|row.get(0)).unwrap();
    assert_eq!(objects,0);
    let state=ledger::state(&mut f.store,&f.binding).unwrap();assert_eq!(state.spent.tool_calls,0);assert_eq!(state.held.tool_calls,0);
}

#[test]
fn ambiguous_http_body_cannot_become_an_executable_tool_call() {
    let mut f=fixture::prepare();
    assert!(f.incomplete(fixture::tool("read_source",json!({"path":"notes.txt"}),"unknown")).is_err());
    assert!(tools::execute(&mut f.store,&f.binding,&f.key).is_err());
    let state=ledger::state(&mut f.store,&f.binding).unwrap();
    assert_eq!(state.spent.tool_calls,0);assert_eq!(state.unknown_operations,1);assert!(state.held.tokens>0);
}

#[test]
fn hardlinked_document_is_refused_before_it_can_become_a_tool_source() {
    let f=fixture::unprepared();let config=f.spec.config.clone();drop(f);
    let directory=tempfile::TempDir::new().unwrap();
    let document=directory.path().join("notes.txt");std::fs::write(&document,"shared inode source").unwrap();
    std::fs::hard_link(&document,directory.path().join("alias.txt")).unwrap();
    std::fs::write(directory.path().join("agentic.json"),serde_json::to_vec(&config).unwrap()).unwrap();
    assert!(genos_orchestrator::mission_protocols::agentic_source::read(directory.path(),"agentic.json").is_err());
}

#[test]
fn predecessor_artifact_copy_is_consumed_by_native_read_and_list_calls() {
    let mut f=artifact_fixture::prepare();
    let created=f.complete(fixture::tool("write_artifact",json!({"name":"notes","text":"REAL_RECEIVED_ARTIFACT"}),"store"));
    tools::execute(&mut f.store,&f.binding,&created.key).unwrap();
    f.prepare_step("reader",1);
    let reader=f.complete(fixture::response("Sources: an actual CAS artifact. Limites: generated text."));f.finish_agent(&reader);
    f.prepare_step("writer",0);
    let mut response=fixture::tool("list_sources",json!({}),"list");
    response["message"]["tool_calls"].as_array_mut().unwrap().push(json!({"id":"read","type":"function",
        "function":{"name":"read_artifact","arguments":{"agent_id":"reader","name":"notes"}}}));
    let requested=f.complete(response);
    let receipts=tools::execute(&mut f.store,&f.binding,&requested.key).unwrap();
    assert_eq!(receipts.len(),2);assert_eq!(receipts[0].output()["data"]["sources"][0]["path"],"notes.txt");
    assert_eq!(receipts[1].output()["data"]["text"],"REAL_RECEIVED_ARTIFACT");
    let connection=Connection::open(f.directory.path().join("ledger.sqlite")).unwrap();
    let origin=tools::artifact_in(&connection,&f.binding,("reader","notes")).unwrap();
    let received=genos_orchestrator::mission_protocols::agentic_exchange::received_in(&connection,&f.binding,"writer").unwrap();
    let copy=&received[0].artifacts[0];assert_ne!(origin.store_id,copy.store_id);assert_eq!(origin.hash,copy.hash);
    let bytes:Vec<u8>=connection.query_row("SELECT bytes FROM protocol_gqwf_objects WHERE store_id=?1 AND hash=?2",
        rusqlite::params![copy.store_id,copy.hash],|row|row.get(0)).unwrap();assert_eq!(bytes,b"REAL_RECEIVED_ARTIFACT");
    let before=ledger::state(&mut f.store,&f.binding).unwrap();
    tools::execute(&mut f.store,&f.binding,&requested.key).unwrap();assert_eq!(ledger::state(&mut f.store,&f.binding).unwrap(),before);
    f.prepare_step("writer",1);
    let writer=f.complete(fixture::response("Sources: REAL_RECEIVED_ARTIFACT. Limites: structural only."));f.finish_agent(&writer);
    assert_eq!(ledger::state(&mut f.store,&f.binding).unwrap().spent.tool_calls,3);
    assert_eq!(f.requests.load(Ordering::SeqCst),4);
    assert!(genos_orchestrator::mission_protocols::agentic_evidence::qualify(&mut f.store,&f.binding).unwrap().contract_satisfied());
}

#[test]
fn a_valid_receipt_cannot_be_transplanted_to_another_native_call_key() {
    let mut f=fixture::prepare();
    let mut response=fixture::tool("read_source",json!({"path":"notes.txt"}),"read");
    response["message"]["tool_calls"].as_array_mut().unwrap().push(
        json!({"id":"list","type":"function","function":{"name":"list_sources","arguments":{}}}));
    let model=f.complete(response);tools::execute(&mut f.store,&f.binding,&model.key).unwrap();
    let connection=Connection::open(f.directory.path().join("ledger.sqlite")).unwrap();
    connection.execute_batch("UPDATE protocol_agentic_tool_receipts SET
        receipt_json=(SELECT receipt_json FROM protocol_agentic_tool_receipts WHERE operation_id='tool/reader/0/1'),
        receipt_hash=(SELECT receipt_hash FROM protocol_agentic_tool_receipts WHERE operation_id='tool/reader/0/1')
        WHERE operation_id='tool/reader/0/0'").unwrap();
    assert!(tools::receipt_in(&connection,&f.binding,"tool/reader/0/0").unwrap_err().contains("INDEX_CHANGED"));
}

#[test]
fn read_artifact_cannot_expand_the_admitted_predecessor_audience() {
    let mut f=artifact_fixture::prepare();
    let reader=f.complete(fixture::response("Sources: selected. Limites: declared."));f.finish_agent(&reader);
    f.prepare_step("writer",0);
    let requested=f.complete(fixture::tool("read_artifact",json!({"agent_id":"stranger","name":"notes"}),"forbidden"));
    let receipt=tools::execute(&mut f.store,&f.binding,&requested.key).unwrap().remove(0);
    assert_eq!(receipt.output()["status"],"denied");assert_eq!(receipt.output()["error"]["code"],"AGENTIC_ARTIFACT_NOT_GRANTED");
    let state=ledger::state(&mut f.store,&f.binding).unwrap();assert_eq!(state.spent.tool_calls,1);
    assert_eq!(f.requests.load(Ordering::SeqCst),2);
}

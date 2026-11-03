#![cfg(feature="native-llm")]
#[path="helpers/agentic_ledger_fixture.rs"] mod fixture;
use genos_orchestrator::mission_protocols::{agentic_ledger as ledger,agentic_tools as tools,agentic_exchange as exchange,agentic_evidence as evidence,raw_hash};
use rusqlite::Connection;
use serde_json::json;
use std::sync::atomic::Ordering;

fn finish_graph(text:&str)->fixture::Pending {
    let mut f=fixture::prepare();
    let reader=f.complete(fixture::response("Sources: checked source. Limites: contract only."));f.finish_agent(&reader);
    f.prepare_step("author",0);
    let write=f.complete(fixture::tool("write_artifact",json!({"name":"draft","text":"immutable intermediate artifact"}),"write"));
    tools::execute(&mut f.store,&f.binding,&write.key).unwrap();
    f.prepare_step("author",1);
    let result=f.complete(fixture::response(text));f.finish_agent(&result);
    f
}

#[test]
fn dependency_context_reads_the_received_cas_copy_and_refuses_corruption() {
    let mut f=fixture::prepare();
    let reader=f.complete(fixture::response("Sources: original. Limites: declared."));f.finish_agent(&reader);
    let packets=exchange::receive(&mut f.store,&f.binding,"author").unwrap();
    assert_eq!(packets[0].result.text,reader.text);
    let connection=Connection::open(f.directory.path().join("ledger.sqlite")).unwrap();
    let count:u64=connection.query_row("SELECT count(DISTINCT store_id) FROM protocol_gqwf_objects WHERE hash=?1",
        [&reader.result_hash],|row|row.get(0)).unwrap();
    assert_eq!(count,2);
    let packet_hash=&packets[0].payload_hash;
    connection.execute("UPDATE protocol_gqwf_objects SET bytes=X'00' WHERE hash=?1",[packet_hash]).unwrap();
    assert!(exchange::received_in(&connection,&f.binding,"author").is_err());
    assert!(genos_orchestrator::mission_protocols::agentic_context::prepare(&mut f.store,&f.binding,
        &ledger::StepKey { agent_id:"author".into(),turn:0 }).is_err());
}

#[test]
fn native_contract_and_cas_publication_are_real_and_replay_without_http_or_tool_cost() {
    let mut f=finish_graph("Sources: native observed responses. Limites: structural verification only.");
    let proof=evidence::qualify(&mut f.store,&f.binding).unwrap();assert!(proof.contract_satisfied());
    let before=ledger::state(&mut f.store,&f.binding).unwrap();
    let publication=exchange::publish(&mut f.store,&f.binding,&proof).unwrap();
    assert_eq!(publication.generation,1);assert!(!publication.semantic_truth_verified);assert!(!publication.promotable);
    assert_eq!(publication.root_hash,raw_hash(proof.text().as_bytes()));
    assert_eq!(exchange::result_bytes(&mut f.store,&f.binding).unwrap(),proof.text().as_bytes());
    assert_eq!(exchange::publish(&mut f.store,&f.binding,&proof).unwrap(),publication);
    assert_eq!(exchange::publication(&mut f.store,&f.binding).unwrap(),Some(publication));
    assert_eq!(ledger::state(&mut f.store,&f.binding).unwrap(),before);
    assert_eq!(f.requests.load(Ordering::SeqCst),3);
}

#[test]
fn failed_contract_keeps_the_observed_candidate_without_publishing() {
    let mut f=finish_graph("A candidate that omits both required headings.");
    let proof=evidence::qualify(&mut f.store,&f.binding).unwrap();assert!(!proof.contract_satisfied());
    assert!(proof.verdicts().iter().all(|verdict|!verdict.passed));
    assert!(exchange::publish(&mut f.store,&f.binding,&proof).is_err());
    assert!(exchange::publication(&mut f.store,&f.binding).unwrap().is_none());
    assert!(proof.text().contains("candidate"));
}

#[test]
fn failure_after_head_cas_rolls_back_head_receipt_emit_and_run_completion() {
    let mut f=finish_graph("Sources: actual observations. Limites: no semantic guarantee.");
    let proof=evidence::qualify(&mut f.store,&f.binding).unwrap();
    let connection=Connection::open(f.directory.path().join("ledger.sqlite")).unwrap();
    connection.execute_batch("CREATE TRIGGER test_publication_abort BEFORE INSERT ON protocol_agentic_publications
        BEGIN SELECT RAISE(ABORT,'TEST_AGENTIC_PUBLICATION_ABORT'); END").unwrap();
    assert!(exchange::publish(&mut f.store,&f.binding,&proof).unwrap_err().contains("TEST_AGENTIC_PUBLICATION_ABORT"));
    let head=genos_orchestrator::mission_protocols::gqwf::head(&mut f.store,&f.binding).unwrap();assert_eq!(head.generation,0);
    let counts:(u64,u64)=connection.query_row("SELECT (SELECT count(*) FROM protocol_agentic_publications),
        (SELECT count(*) FROM rust_protocol_events WHERE phase='AGENTIC_EMIT_COMMITTED')",[],|row|Ok((row.get(0)?,row.get(1)?))).unwrap();
    assert_eq!(counts,(0,0));
    let status:String=connection.query_row("SELECT status FROM rust_protocol_runs WHERE run_id=?1",[&f.binding.run_id],|row|row.get(0)).unwrap();
    assert_ne!(status,"completed");
    connection.execute_batch("DROP TRIGGER test_publication_abort").unwrap();
    assert_eq!(exchange::publish(&mut f.store,&f.binding,&proof).unwrap().generation,1);
    assert_eq!(f.requests.load(Ordering::SeqCst),3);
}

#[test]
fn a_changed_head_blocks_the_old_base_without_leaving_an_accepted_receipt() {
    let mut f=finish_graph("Sources: observed. Limites: structural only.");
    let proof=evidence::qualify(&mut f.store,&f.binding).unwrap();
    let connection=Connection::open(f.directory.path().join("ledger.sqlite")).unwrap();
    connection.execute("UPDATE protocol_gqwf_heads SET generation=generation+1",[]).unwrap();
    assert!(exchange::publish(&mut f.store,&f.binding,&proof).unwrap_err().contains("BASE_REEVALUATION"));
    assert!(exchange::publication(&mut f.store,&f.binding).unwrap().is_none());
    let count:u64=connection.query_row("SELECT count(*) FROM protocol_agentic_evidence",[],|row|row.get(0)).unwrap();
    assert_eq!(count,0);
}

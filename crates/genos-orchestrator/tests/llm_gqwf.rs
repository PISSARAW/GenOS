#![cfg(feature="native-llm")]
#[path="helpers/llm_effect_fixture.rs"]
mod fixture;
use genos_orchestrator::mission_protocols::{llm_evidence,llm_gqwf};

fn prepare(f: &mut fixture::Pending, id: &str, observation: &genos_api::native_inference::ModelObservation) -> llm_gqwf::Candidate {
    let proof = llm_evidence::qualify(&mut f.store,&f.binding,observation).unwrap();
    llm_evidence::accept(&mut f.store,&f.binding,&proof).unwrap();
    let candidate = llm_gqwf::offer(&mut f.store,&f.binding,llm_gqwf::Offer { candidate_id:id,source_bytes:&f.source.bytes,
        observation,subject:proof.subject(),base:&f.base }).unwrap();
    llm_gqwf::receive(&mut f.store,&f.binding,id).unwrap();
    llm_gqwf::verify(&mut f.store,&f.binding,id).unwrap();
    llm_gqwf::prepare(&mut f.store,&f.binding,id).unwrap();
    candidate
}

#[test]
fn text_head_publication_rolls_back_all_receipts_after_sql_abort_and_replays_without_http() {
    let mut f = fixture::prepare(); let observation = f.complete(fixture::response());
    prepare(&mut f,"result",&observation);
    let connection = rusqlite::Connection::open(f.directory.path().join("protocols.sqlite")).unwrap();
    connection.execute_batch("CREATE TRIGGER fail_llm_publication BEFORE UPDATE OF receipt_json ON protocol_llm_gqwf_candidates
        WHEN NEW.status='published' BEGIN SELECT RAISE(ABORT,'TEST_LLM_PUBLICATION_ABORT'); END;").unwrap();
    assert!(llm_gqwf::commit(&mut f.store,&f.binding,"result").unwrap_err().contains("TEST_LLM_PUBLICATION_ABORT"));
    assert_eq!(llm_gqwf::head(&mut f.store,&f.binding).unwrap(),f.base);
    let status: String = connection.query_row("SELECT status FROM rust_protocol_runs",[],|row|row.get(0)).unwrap();
    assert_eq!(status,"admitted");
    let emit: String = connection.query_row("SELECT status FROM protocol_llm_omega_operations WHERE operation_id='emit'",[],|row|row.get(0)).unwrap();
    assert_eq!(emit,"intent");
    connection.execute_batch("DROP TRIGGER fail_llm_publication").unwrap();
    let receipt = llm_gqwf::commit(&mut f.store,&f.binding,"result").unwrap();
    assert_eq!(llm_gqwf::commit(&mut f.store,&f.binding,"result").unwrap(),receipt);
    assert!(!receipt.semantic_truth_verified); assert!(!receipt.promotable); assert!(!receipt.external_effects_authorized);
    assert_eq!(llm_gqwf::result_bytes(&mut f.store,&f.binding,"result").unwrap(),observation.output());
}

#[test]
fn two_text_candidates_prepared_on_one_generation_have_one_winner() {
    let mut f = fixture::prepare(); let observation = f.complete(fixture::response());
    prepare(&mut f,"a",&observation); prepare(&mut f,"b",&observation);
    llm_gqwf::commit(&mut f.store,&f.binding,"a").unwrap();
    assert!(llm_gqwf::commit(&mut f.store,&f.binding,"b").unwrap_err().contains("BASE_REEVALUATION"));
    assert_eq!(llm_gqwf::head(&mut f.store,&f.binding).unwrap().generation,1);
}

#[test]
fn received_raw_source_corruption_is_not_hidden_by_provider_text_success() {
    let mut f = fixture::prepare(); let observation = f.complete(fixture::response());
    let candidate = prepare(&mut f,"result",&observation);
    let connection = rusqlite::Connection::open(f.directory.path().join("protocols.sqlite")).unwrap();
    connection.execute("UPDATE protocol_gqwf_objects SET bytes=$1 WHERE store_id=$2 AND hash=$3",
        rusqlite::params![b"corrupt".as_slice(),candidate.receiver_store,candidate.subject.source_hash]).unwrap();
    assert!(llm_gqwf::commit(&mut f.store,&f.binding,"result").is_err());
    assert_eq!(llm_gqwf::head(&mut f.store,&f.binding).unwrap(),f.base);
}

#[test]
fn unknown_provider_usage_blocks_publication_even_when_structural_checks_pass() {
    let mut f = fixture::prepare(); let mut response = fixture::response();
    response.as_object_mut().unwrap().remove("eval_count");
    let observation = f.complete(response);
    let proof = llm_evidence::qualify(&mut f.store,&f.binding,&observation).unwrap();
    llm_evidence::accept(&mut f.store,&f.binding,&proof).unwrap();
    llm_gqwf::offer(&mut f.store,&f.binding,llm_gqwf::Offer { candidate_id:"result",source_bytes:&f.source.bytes,
        observation:&observation,subject:proof.subject(),base:&f.base }).unwrap();
    llm_gqwf::receive(&mut f.store,&f.binding,"result").unwrap(); llm_gqwf::verify(&mut f.store,&f.binding,"result").unwrap();
    assert!(llm_gqwf::prepare(&mut f.store,&f.binding,"result").is_err());
    assert_eq!(llm_gqwf::head(&mut f.store,&f.binding).unwrap(),f.base);
}

#[test]
fn recorded_observation_can_be_offered_after_reopen_without_new_provider_dispatch() {
    let mut f = fixture::prepare(); let observation = f.complete(fixture::response());
    let proof = llm_evidence::qualify(&mut f.store,&f.binding,&observation).unwrap();
    llm_evidence::accept(&mut f.store,&f.binding,&proof).unwrap();
    prepare(&mut f,"result",&observation);
    drop(observation);
    f.store = genos_orchestrator::mission_protocols::Store::open(&f.directory.path().join("protocols.sqlite")).unwrap();
    llm_gqwf::offer_observed(&mut f.store,&f.binding,llm_gqwf::RecordedOffer { candidate_id:"result",
        source_bytes:&f.source.bytes,evidence:&proof,base:&f.base }).unwrap();
    llm_gqwf::receive(&mut f.store,&f.binding,"result").unwrap();
    llm_gqwf::verify(&mut f.store,&f.binding,"result").unwrap();
    llm_gqwf::prepare(&mut f.store,&f.binding,"result").unwrap();
    llm_gqwf::commit(&mut f.store,&f.binding,"result").unwrap();
    let state = genos_orchestrator::mission_protocols::llm_allostasis::state(&mut f.store,&f.binding).unwrap();
    assert_eq!(state.spent.model_calls,1);
}

use crate as genos_orchestrator;
include!("../../tests/helpers/llm_evidence_fixture.rs");
use super::{accept, qualify_observed};

const TEXT: &str = "Sources : document fourni. Limites : aucun fait général certifié.";

#[test]
fn durable_observation_requalifies_after_reopen_without_another_http_request() {
    let Fixture { directory,store,binding,observation,source,requests,.. } = create(contract(),TEXT);
    assert_eq!(requests.load(Ordering::SeqCst),1);
    drop(observation);
    drop(store);
    let mut reopened=Store::open(&directory.path().join("protocols.sqlite")).unwrap();
    source.unchanged(directory.path()).unwrap();
    let proof=qualify_observed(&mut reopened,&binding).unwrap();
    assert!(proof.contract_satisfied());
    let accepted=accept(&mut reopened,&binding,&proof).unwrap();
    assert!(!accepted.semantic_truth_verified);
    assert_eq!(requests.load(Ordering::SeqCst),1);
}

#[test]
fn modified_persisted_observation_is_not_requalified_after_reopen() {
    let Fixture { directory,store,binding,observation,requests,.. } = create(contract(),TEXT);
    drop(observation);
    drop(store);
    let connection=rusqlite::Connection::open(directory.path().join("protocols.sqlite")).unwrap();
    connection.execute("UPDATE protocol_llm_omega_operations SET outcome_json='{}'
        WHERE mission_id=?1 AND operation_id='infer'",[&binding.mission_id]).unwrap();
    drop(connection);
    let mut reopened=Store::open(&directory.path().join("protocols.sqlite")).unwrap();
    assert!(qualify_observed(&mut reopened,&binding).is_err());
    assert_eq!(requests.load(Ordering::SeqCst),1);
}

#[test]
fn changed_reviewer_context_is_rejected_during_observation_recovery() {
    let Fixture { directory,mut store,binding,spec,observation,requests,.. } = create(contract(),TEXT);
    let previous=llm_synapse::read(&store,&binding,WorkerRole::VerifierA).unwrap();
    let mut input=context(&spec,WorkerRole::VerifierA,previous.payload);
    input.base_generation=1;
    input.payload["candidate"]="Sources : contenu remplacé. Limites.".into();
    llm_synapse::apply(&mut store,&binding,&input).unwrap();
    drop(observation);
    drop(store);
    let mut reopened=Store::open(&directory.path().join("protocols.sqlite")).unwrap();
    assert!(qualify_observed(&mut reopened,&binding).is_err());
    assert_eq!(requests.load(Ordering::SeqCst),1);
}

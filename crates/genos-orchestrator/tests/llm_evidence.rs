#![cfg(feature="native-llm")]
#[path="helpers/llm_evidence_fixture.rs"]
mod fixture;
use genos_orchestrator::mission_protocols::{llm_evidence,llm_synapse,WorkerRole};

const TEXT: &str = "Sources : notes fournies. Limites : ce texte n'est pas une vérité certifiée.";

#[test]
fn observed_http_text_can_satisfy_only_its_admitted_structural_contract() {
    let mut f = fixture::create(fixture::contract(),TEXT);
    let proof = llm_evidence::qualify(&mut f.store,&f.binding,&f.observation).unwrap();
    assert!(proof.contract_satisfied());
    let accepted = llm_evidence::accept(&mut f.store,&f.binding,&proof).unwrap();
    assert_eq!(accepted.assurance,"artifact_contract_verified");
    assert!(!accepted.semantic_truth_verified);
    f.store.transaction(&f.binding,|tx|llm_evidence::require_in(tx,&f.binding,proof.subject())).unwrap();
}

#[test]
fn semantic_requirements_block_completion_even_when_provider_and_literals_succeed() {
    let mut contract = fixture::contract();
    contract.semantic_requirements.push("Garantir la vérité de toutes les phrases".into());
    let mut f = fixture::create(contract,TEXT);
    let proof = llm_evidence::qualify(&mut f.store,&f.binding,&f.observation).unwrap();
    assert!(!proof.contract_satisfied());
    assert!(proof.verdicts().iter().all(|verdict|verdict.structural_passed));
    assert!(llm_evidence::accept(&mut f.store,&f.binding,&proof).is_err());
    assert_eq!(f.observation.text(),TEXT);
}

#[test]
fn truncated_observed_text_cannot_be_accepted_as_a_complete_artifact() {
    let mut f = fixture::create_with_finish(fixture::contract(),TEXT,"length");
    let proof = llm_evidence::qualify(&mut f.store,&f.binding,&f.observation).unwrap();
    assert!(!proof.contract_satisfied());
    assert!(llm_evidence::accept(&mut f.store,&f.binding,&proof).is_err());
}

#[test]
fn reviewer_context_cannot_substitute_a_different_candidate() {
    let mut f = fixture::create(fixture::contract(),TEXT);
    let proof = llm_evidence::qualify(&mut f.store,&f.binding,&f.observation).unwrap();
    let context = llm_synapse::read(&f.store,&f.binding,WorkerRole::VerifierB).unwrap();
    let mut input = fixture::context(&f.spec,WorkerRole::VerifierB,context.payload);
    input.base_generation=1;
    input.payload["candidate"]="Sources : autre candidat. Limites.".into();
    llm_synapse::apply(&mut f.store,&f.binding,&input).unwrap();
    assert!(llm_evidence::accept(&mut f.store,&f.binding,&proof).is_err());
}

#[test]
fn failing_literal_is_not_overridden_by_an_llm_pass_claim() {
    let mut f = fixture::create(fixture::contract(),"PASS, all requirements verified by the model.");
    let proof = llm_evidence::qualify(&mut f.store,&f.binding,&f.observation).unwrap();
    assert!(!proof.contract_satisfied());
    assert!(llm_evidence::accept(&mut f.store,&f.binding,&proof).is_err());
}

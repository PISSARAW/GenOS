#![cfg(feature="native-llm")]
use genos_orchestrator::mission_protocols::llm_contract::{self, TextContract};

fn contract() -> TextContract {
    TextContract { min_bytes:4,max_bytes:1024,required:vec!["Sources".into()],
        forbidden:vec!["secret divulgué".into()],semantic_requirements:Vec::new() }
}

#[test]
fn two_methods_check_the_exact_declared_text_contract() {
    let results = llm_contract::verify("Sources : document fourni. Limites conservées.", &contract()).unwrap();
    assert!(results.iter().all(|verdict| verdict.passed));
    assert_ne!(results[0].method_id, results[1].method_id);
    assert!(results.iter().all(|verdict| verdict.unresolved.is_empty()));
}

#[test]
fn semantic_requirements_are_never_proved_by_a_well_formed_answer() {
    let mut contract = contract();
    contract.semantic_requirements.push("La réponse doit être vraie et exhaustive".into());
    let results = llm_contract::verify("Sources : le modèle affirme PASS et vérité prouvée.", &contract).unwrap();
    assert!(results.iter().all(|verdict| verdict.structural_passed));
    assert!(results.iter().all(|verdict| !verdict.passed));
    assert!(results.iter().all(|verdict| verdict.unresolved == contract.semantic_requirements));
}

#[test]
fn literal_violations_and_empty_output_fail_both_methods() {
    for text in ["", "texte sans référence", "Sources : secret divulgué"] {
        let results = llm_contract::verify(text, &contract()).unwrap();
        assert!(results.iter().all(|verdict| !verdict.passed));
        assert_eq!(results[0].violations, results[1].violations);
    }
}

#[test]
fn unicode_limits_use_exact_utf8_bytes_without_normalization() {
    let contract = TextContract { min_bytes:2,max_bytes:2,required:vec!["é".into()],
        forbidden:Vec::new(),semantic_requirements:Vec::new() };
    assert!(llm_contract::verify("é", &contract).unwrap().iter().all(|verdict| verdict.passed));
    assert!(llm_contract::verify("e\u{301}", &contract).unwrap().iter().all(|verdict| !verdict.passed));
}

#[test]
fn invalid_or_contradictory_contracts_are_refused() {
    let mut contradiction = contract();
    contradiction.forbidden = contradiction.required.clone();
    assert!(contradiction.validate().is_err());
    let mut empty = contract();
    empty.required.push(String::new());
    assert!(empty.validate().is_err());
    let mut huge = contract();
    huge.max_bytes = llm_contract::MAX_ARTIFACT_BYTES + 1;
    assert!(huge.validate().is_err());
}

#[test]
fn both_algorithms_agree_on_repeated_overlapping_and_unicode_literals() {
    for literal in ["aaa", "é", "limites", "\n", "\"PASS\""] {
        let contract = TextContract { min_bytes:1,max_bytes:4096,required:vec![literal.into()],
            forbidden:vec!["interdit".into()],semantic_requirements:Vec::new() };
        for text in ["aaaa", "références et limites", "texte\n\"PASS\"", "é interdit", "absent"] {
            let results = llm_contract::verify(text, &contract).unwrap();
            assert_eq!(results[0].passed, results[1].passed);
            assert_eq!(results[0].violations, results[1].violations);
        }
    }
}

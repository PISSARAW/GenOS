use super::*;

#[test]
fn compatible_same_major() {
    assert!(is_compatible("1.2.3"));
}

#[test]
fn incompatible_other_major() {
    assert!(!is_compatible("2.0.0"));
}

#[test]
fn budget_refuses_overuse() {
    let over = BudgetClaim {
        resource: "tokens".to_string(),
        reserved: 10.0,
        consumed: 11.0,
        ceiling: 100.0,
    };
    assert!(validate_budget(&over).is_err());
}

#[test]
fn receipt_requires_proof() {
    let empty = BioReceipt {
        organism_id: "o".to_string(),
        agent_id: "a".to_string(),
        genome_id: "g".to_string(),
        episode_id: "e".to_string(),
        initial_state_hash: "h".to_string(),
        effect_id: "f".to_string(),
        proof: "".to_string(),
        effect_origin: EffectOrigin::Simulated,
        schema_version: SCHEMA_VERSION.to_string(),
    };
    assert!(validate_receipt(&empty).is_err());
}

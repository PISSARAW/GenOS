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
fn budget_rejects_non_finite_and_negative_amounts() {
    for claim in [
        BudgetClaim {
            resource: "tokens".into(),
            reserved: f64::NAN,
            consumed: 0.0,
            ceiling: 10.0,
        },
        BudgetClaim {
            resource: "tokens".into(),
            reserved: 1.0,
            consumed: f64::INFINITY,
            ceiling: 10.0,
        },
        BudgetClaim {
            resource: "tokens".into(),
            reserved: f64::INFINITY,
            consumed: 1.0,
            ceiling: f64::INFINITY,
        },
        BudgetClaim {
            resource: "tokens".into(),
            reserved: 1.0,
            consumed: -0.1,
            ceiling: 10.0,
        },
        BudgetClaim {
            resource: "tokens".into(),
            reserved: 1.0,
            consumed: 0.1,
            ceiling: -1.0,
        },
    ] {
        assert!(validate_budget(&claim).is_err(), "invalid budget claim was accepted: {claim:?}");
    }
}

#[test]
fn budget_requires_resource_name() {
    let claim = BudgetClaim {
        resource: "  ".into(),
        reserved: 1.0,
        consumed: 0.0,
        ceiling: 2.0,
    };
    assert!(validate_budget(&claim).is_err());
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

use super::*;

fn intention(action_id: &str, predicted: f64) -> Intention {
    Intention {
        action_id: action_id.to_string(),
        action: "delegate".to_string(),
        predicted_outcome: predicted,
        confidence: 0.8,
    }
}

fn observed(action_id: &str, outcome: f64, executed: bool) -> ObservedOutcome {
    ObservedOutcome {
        action_id: action_id.to_string(),
        outcome,
        action_executed: executed,
    }
}

#[test]
fn executed_action_with_matching_outcome_is_attributed_to_self() {
    let comparator = AgencyComparator::default();
    let attr = comparator.compare(&intention("a1", 0.8), &observed("a1", 0.85, true));
    assert!(attr.attributed_to_self);
    assert!(attr.causal_confidence > 0.7);
    assert!(attr.prediction_error < 0.1);
}

#[test]
fn coincidence_without_execution_is_not_attributed() {
    // Le résultat correspond à la prédiction, mais l'agent n'a PAS agi :
    // c'est une coïncidence, pas une causalité propre.
    let comparator = AgencyComparator::default();
    let attr = comparator.compare(&intention("a2", 0.8), &observed("a2", 0.8, false));
    assert!(!attr.attributed_to_self);
    assert!((attr.causal_confidence - 0.0).abs() < 1e-9);
}

#[test]
fn executed_action_with_divergent_outcome_is_not_attributed() {
    // L'agent a agi mais le monde a fait autre chose : l'événement
    // s'est produit sans être causé comme prévu.
    let comparator = AgencyComparator::default();
    let attr = comparator.compare(&intention("a3", 0.9), &observed("a3", 0.1, true));
    assert!(!attr.attributed_to_self);
    assert!(attr.prediction_error > 0.5);
}

#[test]
fn record_cycle_builds_complete_core_self_state() {
    let mut core = CoreSelf::new();
    let state = core.record_cycle(
        vec![0.5, 0.5],
        Some(Claim {
            content: "contradiction détectée".into(),
            provenance: CognitiveProvenance::EnvironmentObserved,
            owner: "world".into(),
            confidence: 0.9,
        }),
        Some(intention("a4", 0.7)),
        Some(observed("a4", 0.72, true)),
        vec![0.6, 0.4],
        vec![0.8],
    );
    assert!(state.agency_attribution.is_some());
    assert_eq!(state.ownership_attribution, Some(true));
    assert_eq!(state.predicted_effect, Some(0.7));
    assert_eq!(core.attributed, 1);
    assert_eq!(core.history.len(), 1);
}

#[test]
fn agency_calibration_is_zero_without_history() {
    let core = CoreSelf::new();
    assert!((core.agency_calibration() - 0.0).abs() < 1e-9);
}

#[test]
fn provenance_distinguishes_self_from_world() {
    let self_claim = Claim {
        content: "je planifie une délégation".into(),
        provenance: CognitiveProvenance::SelfGenerated,
        owner: "agent-1".into(),
        confidence: 0.9,
    };
    let world_claim = Claim {
        content: "test échoué dans le CI".into(),
        provenance: CognitiveProvenance::EnvironmentObserved,
        owner: "ci-runner".into(),
        confidence: 1.0,
    };
    assert!(self_claim.is_self_origin());
    assert!(!world_claim.is_self_origin());
}

#[test]
fn record_cycle_without_intention_has_no_attribution() {
    let mut core = CoreSelf::new();
    let state = core.record_cycle(
        vec![0.5],
        None,
        None,
        Some(observed("a5", 0.9, false)),
        vec![0.5],
        vec![0.9],
    );
    assert!(state.agency_attribution.is_none());
    assert_eq!(state.ownership_attribution, None);
}

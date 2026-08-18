use super::*;
use genos_core::{BranchId, ExperimentId};

#[test]
fn selects_branch_b_for_the_trivial_counterfactual_experiment() {
    let result = evaluate_answers(
        ExperimentId("largest-value".to_string()),
        [
            CounterfactualAnswer {
                branch_id: BranchId("A".to_string()),
                answer: 4,
            },
            CounterfactualAnswer {
                branch_id: BranchId("B".to_string()),
                answer: 8,
            },
            CounterfactualAnswer {
                branch_id: BranchId("C".to_string()),
                answer: 6,
            },
        ],
    );
    assert_eq!(result.winner, Some(BranchId("B".to_string())));
    assert_eq!(result.ranking[0].score, 8.0);
}

#[test]
fn selecting_b_changes_active_branch_without_merging_or_deleting_siblings() {
    let result = EvaluationResult {
        experiment_id: ExperimentId("winner-takes-branch-v0".to_string()),
        ranking: vec![
            BranchScore {
                branch_id: BranchId("B".to_string()),
                score: 0.9,
            },
            BranchScore {
                branch_id: BranchId("C".to_string()),
                score: 0.7,
            },
            BranchScore {
                branch_id: BranchId("A".to_string()),
                score: 0.4,
            },
        ],
        winner: Some(BranchId("B".to_string())),
    };
    let selection = select_winner(&result).expect("winner must be selectable");
    assert_eq!(selection.active_branch, BranchId("B".to_string()));
    assert_eq!(selection.inspectable_branches.len(), 3);
    assert!(selection
        .inspectable_branches
        .iter()
        .any(|branch| branch.branch_id == BranchId("A".to_string())));
    assert!(selection
        .inspectable_branches
        .iter()
        .any(|branch| branch.branch_id == BranchId("C".to_string())));
}

#[test]
fn a_losing_branch_can_be_resumed_later() {
    let result = evaluate_answers(
        ExperimentId("exploration-retroactive".to_string()),
        [
            CounterfactualAnswer {
                branch_id: BranchId("A".to_string()),
                answer: 4,
            },
            CounterfactualAnswer {
                branch_id: BranchId("B".to_string()),
                answer: 8,
            },
            CounterfactualAnswer {
                branch_id: BranchId("C".to_string()),
                answer: 6,
            },
        ],
    );
    let mut selection = select_winner(&result).expect("winner must be selectable");
    assert_eq!(selection.active_branch, BranchId("B".to_string()));
    assert_eq!(
        selection.resume(&BranchId("C".to_string())),
        Some(BranchId("C".to_string()))
    );
    assert_eq!(selection.active_branch, BranchId("C".to_string()));
    assert_eq!(selection.inspectable_branches.len(), 3);
}

#[test]
fn multi_objective_evaluation_retains_tradeoffs_without_selecting_a_winner() {
    let evaluation = record_multi_objective_evaluation(
        ExperimentId("pareto-preparation".to_string()),
        [
            MultiObjectiveBranchScore {
                branch_id: BranchId("A".to_string()),
                objectives: vec![
                    ObjectiveScore {
                        objective: "correctness".to_string(),
                        score: 0.9,
                    },
                    ObjectiveScore {
                        objective: "speed".to_string(),
                        score: 0.6,
                    },
                    ObjectiveScore {
                        objective: "cost".to_string(),
                        score: 0.8,
                    },
                ],
            },
            MultiObjectiveBranchScore {
                branch_id: BranchId("B".to_string()),
                objectives: vec![
                    ObjectiveScore {
                        objective: "correctness".to_string(),
                        score: 0.8,
                    },
                    ObjectiveScore {
                        objective: "speed".to_string(),
                        score: 0.95,
                    },
                    ObjectiveScore {
                        objective: "cost".to_string(),
                        score: 0.5,
                    },
                ],
            },
        ],
    );

    assert_eq!(evaluation.branches.len(), 2);
    assert_eq!(evaluation.branches[0].objectives.len(), 3);
    assert_eq!(evaluation.branches[1].objectives[1].score, 0.95);
}

#[test]
fn pareto_selection_marks_tradeoff_branches_as_non_dominated() {
    let branches = vec![
        MultiObjectiveBranchScore {
            branch_id: BranchId("A".to_string()),
            objectives: vec![
                ObjectiveScore {
                    objective: "speed".to_string(),
                    score: 0.9,
                },
                ObjectiveScore {
                    objective: "cost".to_string(),
                    score: 0.9,
                },
            ],
        },
        MultiObjectiveBranchScore {
            branch_id: BranchId("B".to_string()),
            objectives: vec![
                ObjectiveScore {
                    objective: "speed".to_string(),
                    score: 0.2,
                },
                ObjectiveScore {
                    objective: "cost".to_string(),
                    score: 0.2,
                },
            ],
        },
        MultiObjectiveBranchScore {
            branch_id: BranchId("C".to_string()),
            objectives: vec![
                ObjectiveScore {
                    objective: "speed".to_string(),
                    score: 0.5,
                },
                ObjectiveScore {
                    objective: "cost".to_string(),
                    score: 0.5,
                },
            ],
        },
    ];
    let assessment = pareto_select(
        &branches,
        &[
            ParetoObjective {
                objective: "speed".to_string(),
                direction: ObjectiveDirection::Maximize,
            },
            ParetoObjective {
                objective: "cost".to_string(),
                direction: ObjectiveDirection::Minimize,
            },
        ],
    );

    assert!(assessment
        .iter()
        .all(|entry| entry.status == ParetoStatus::NonDominated));
}

#[test]
fn breeding_target_uses_measured_parental_phenotypes() {
    let alice = TraitEstimate {
        trait_name: "precision".to_string(),
        mean: 0.50,
        standard_error: 0.03,
        sample_size: 100,
        evaluation_suite: "traits-v1".to_string(),
    };
    let bob = TraitEstimate {
        trait_name: "precision".to_string(),
        mean: 0.95,
        standard_error: 0.02,
        sample_size: 100,
        evaluation_suite: "traits-v1".to_string(),
    };
    let target = recombine_measured_trait(alice, bob, 1.0 / 3.0).unwrap();
    assert!((target.target - 0.80).abs() < 1e-9);
}

#[test]
fn breeding_rejects_incomparable_parent_measurements() {
    let estimate = |suite: &str| TraitEstimate {
        trait_name: "creativity".to_string(),
        mean: 0.7,
        standard_error: 0.05,
        sample_size: 50,
        evaluation_suite: suite.to_string(),
    };
    assert!(recombine_measured_trait(estimate("suite-a"), estimate("suite-b"), 0.5).is_err());
}

#[test]
fn functional_reproducibility_uses_confidence_bounds_not_point_scores() {
    let report = assess_functional_reproducibility(vec![FunctionalSimilarityMetric {
        metric: "planning_similarity".to_string(),
        similarity: 0.91,
        confidence_interval_lower: 0.84,
        confidence_interval_upper: 0.96,
        equivalence_threshold: 0.90,
        paired_trials: 40,
        critical: true,
    }]);
    assert_eq!(report.verdict, ReproducibilityVerdict::Inconclusive);
    assert_eq!(report.inconclusive_metrics, vec!["planning_similarity"]);
}

#[test]
fn critical_behavior_below_equivalence_rejects_reproduction() {
    let report = assess_functional_reproducibility(vec![FunctionalSimilarityMetric {
        metric: "belief_consistency".to_string(),
        similarity: 0.72,
        confidence_interval_lower: 0.68,
        confidence_interval_upper: 0.76,
        equivalence_threshold: 0.95,
        paired_trials: 100,
        critical: true,
    }]);
    assert_eq!(report.verdict, ReproducibilityVerdict::NotEquivalent);
    assert_eq!(report.failing_metrics, vec!["belief_consistency"]);
}

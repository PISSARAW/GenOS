use genos_core::{BranchId, ExperimentId};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BranchScore {
    pub branch_id: BranchId,
    pub score: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct EvaluationResult {
    pub experiment_id: ExperimentId,
    pub ranking: Vec<BranchScore>,
    pub winner: Option<BranchId>,
}

/// Deterministic result used by the first counterfactual experiment: the
/// evaluator's score is simply the branch answer.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CounterfactualAnswer {
    pub branch_id: BranchId,
    pub answer: i64,
}

/// Scores independently measured for one branch. No scalarisation or winner
/// selection is implied: callers retain the full trade-off surface.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct MultiObjectiveBranchScore {
    pub branch_id: BranchId,
    pub objectives: Vec<ObjectiveScore>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ObjectiveScore {
    pub objective: String,
    pub score: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct MultiObjectiveEvaluation {
    pub experiment_id: ExperimentId,
    pub branches: Vec<MultiObjectiveBranchScore>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ObjectiveDirection {
    Maximize,
    Minimize,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ParetoObjective {
    pub objective: String,
    pub direction: ObjectiveDirection,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ParetoStatus {
    NonDominated,
    Dominated,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ParetoAssessment {
    pub branch_id: BranchId,
    pub status: ParetoStatus,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HypothesisOutcome {
    Supported,
    Rejected,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ReusableDiscovery {
    pub branch_id: BranchId,
    pub finding: String,
    pub evidence: String,
    pub reusable: bool,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct RefactorBranchEvaluation {
    pub branch_id: BranchId,
    pub hypothesis: String,
    pub outcome: HypothesisOutcome,
    pub outcome_reason: String,
    pub metrics: Vec<ObjectiveScore>,
    pub discoveries: Vec<ReusableDiscovery>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ObjectiveWeight {
    pub objective: String,
    pub weight: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct CognitiveMergeResult {
    pub selected_branch: BranchId,
    pub selected_score: f64,
    pub rejected_hypotheses: Vec<String>,
    pub reused_discoveries: Vec<ReusableDiscovery>,
    pub explanation: String,
}

/// Select a branch with an explicit weighted policy, while retaining reusable
/// findings from every lineage. This merges knowledge, never workspace state.
pub fn synthesize_refactor_experiment(
    evaluations: &[RefactorBranchEvaluation],
    weights: &[ObjectiveWeight],
) -> Option<CognitiveMergeResult> {
    let weighted_score = |evaluation: &RefactorBranchEvaluation| {
        weights
            .iter()
            .map(|weight| {
                evaluation
                    .metrics
                    .iter()
                    .find(|metric| metric.objective == weight.objective)
                    .map_or(0.0, |metric| metric.score * weight.weight)
            })
            .sum::<f64>()
    };
    let (winner, score) = evaluations
        .iter()
        .map(|evaluation| (evaluation, weighted_score(evaluation)))
        .max_by(|(left_eval, left_score), (right_eval, right_score)| {
            left_score
                .total_cmp(right_score)
                .then_with(|| right_eval.branch_id.0.cmp(&left_eval.branch_id.0))
        })?;
    let rejected_hypotheses = evaluations
        .iter()
        .filter(|evaluation| evaluation.outcome == HypothesisOutcome::Rejected)
        .map(|evaluation| format!("{}: {}", evaluation.hypothesis, evaluation.outcome_reason))
        .collect::<Vec<_>>();
    let reused_discoveries = evaluations
        .iter()
        .flat_map(|evaluation| evaluation.discoveries.iter())
        .filter(|discovery| discovery.reusable)
        .cloned()
        .collect::<Vec<_>>();
    Some(CognitiveMergeResult {
        selected_branch: winner.branch_id.clone(),
        selected_score: score,
        rejected_hypotheses,
        explanation: format!(
            "selected {} with weighted score {:.3}; retained {} reusable discoveries",
            winner.branch_id,
            score,
            reused_discoveries.len()
        ),
        reused_discoveries,
    })
}

/// Mark branches on the Pareto frontier. A branch dominates another only when
/// it is no worse on every objective and strictly better on at least one.
pub fn pareto_select(
    branches: &[MultiObjectiveBranchScore],
    objectives: &[ParetoObjective],
) -> Vec<ParetoAssessment> {
    branches
        .iter()
        .map(|candidate| ParetoAssessment {
            branch_id: candidate.branch_id.clone(),
            status: if branches.iter().any(|other| {
                other.branch_id != candidate.branch_id && dominates(other, candidate, objectives)
            }) {
                ParetoStatus::Dominated
            } else {
                ParetoStatus::NonDominated
            },
        })
        .collect()
}

fn dominates(
    left: &MultiObjectiveBranchScore,
    right: &MultiObjectiveBranchScore,
    objectives: &[ParetoObjective],
) -> bool {
    let mut strictly_better = false;
    for objective in objectives {
        let Some(left_score) = left
            .objectives
            .iter()
            .find(|score| score.objective == objective.objective)
        else {
            return false;
        };
        let Some(right_score) = right
            .objectives
            .iter()
            .find(|score| score.objective == objective.objective)
        else {
            return false;
        };
        let ordering = left_score.score.total_cmp(&right_score.score);
        let no_worse = match objective.direction {
            ObjectiveDirection::Maximize => ordering.is_ge(),
            ObjectiveDirection::Minimize => ordering.is_le(),
        };
        let better = match objective.direction {
            ObjectiveDirection::Maximize => ordering.is_gt(),
            ObjectiveDirection::Minimize => ordering.is_lt(),
        };
        if !no_worse {
            return false;
        }
        strictly_better |= better;
    }
    strictly_better
}

pub fn record_multi_objective_evaluation(
    experiment_id: ExperimentId,
    branches: impl IntoIterator<Item = MultiObjectiveBranchScore>,
) -> MultiObjectiveEvaluation {
    MultiObjectiveEvaluation {
        experiment_id,
        branches: branches.into_iter().collect(),
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BranchSelection {
    pub active_branch: BranchId,
    /// All evaluated branches remain available for inspection; selection does
    /// not merge or delete the non-winning branches.
    pub inspectable_branches: Vec<BranchScore>,
}

impl BranchSelection {
    /// Resume any retained branch, including a branch that previously lost.
    /// No branch is deleted or merged as a side effect.
    pub fn resume(&mut self, branch_id: &BranchId) -> Option<BranchId> {
        if self
            .inspectable_branches
            .iter()
            .any(|branch| &branch.branch_id == branch_id)
        {
            self.active_branch = branch_id.clone();
            Some(self.active_branch.clone())
        } else {
            None
        }
    }
}

pub fn select_winner(result: &EvaluationResult) -> Option<BranchSelection> {
    result.winner.clone().map(|active_branch| BranchSelection {
        active_branch,
        inspectable_branches: result.ranking.clone(),
    })
}

pub fn evaluate_answers(
    experiment_id: ExperimentId,
    answers: impl IntoIterator<Item = CounterfactualAnswer>,
) -> EvaluationResult {
    let mut ranking: Vec<_> = answers
        .into_iter()
        .map(|answer| BranchScore {
            branch_id: answer.branch_id,
            score: answer.answer as f64,
        })
        .collect();
    ranking.sort_by(|a, b| b.score.total_cmp(&a.score));
    let winner = ranking.first().map(|entry| entry.branch_id.clone());
    EvaluationResult {
        experiment_id,
        ranking,
        winner,
    }
}

/// Experimentally estimated expression of a trait. The estimate is evidence,
/// not a field copied from the genome.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct TraitEstimate {
    pub trait_name: String,
    pub mean: f64,
    pub standard_error: f64,
    pub sample_size: usize,
    pub evaluation_suite: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct RecombinedTraitTarget {
    pub trait_name: String,
    pub target: f64,
    pub parent_a_estimate: TraitEstimate,
    pub parent_b_estimate: TraitEstimate,
    pub parent_a_weight: f64,
}

/// Produce a breeding target from measured parental phenotypes. This does not
/// claim that the child expresses the target; a later evaluation must estimate
/// the child's phenotype independently.
pub fn recombine_measured_trait(
    parent_a: TraitEstimate,
    parent_b: TraitEstimate,
    parent_a_weight: f64,
) -> Result<RecombinedTraitTarget, String> {
    if parent_a.trait_name != parent_b.trait_name {
        return Err("parent estimates describe different traits".to_string());
    }
    if parent_a.evaluation_suite != parent_b.evaluation_suite {
        return Err("parent estimates were produced by different evaluation suites".to_string());
    }
    if !(0.0..=1.0).contains(&parent_a_weight) {
        return Err("parent_a_weight must be between 0 and 1".to_string());
    }
    let target = parent_a.mean * parent_a_weight + parent_b.mean * (1.0 - parent_a_weight);
    Ok(RecombinedTraitTarget {
        trait_name: parent_a.trait_name.clone(),
        target,
        parent_a_estimate: parent_a,
        parent_b_estimate: parent_b,
        parent_a_weight,
    })
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct FunctionalSimilarityMetric {
    pub metric: String,
    pub similarity: f64,
    pub confidence_interval_lower: f64,
    pub confidence_interval_upper: f64,
    pub equivalence_threshold: f64,
    pub paired_trials: usize,
    pub critical: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ReproducibilityVerdict {
    Equivalent,
    NotEquivalent,
    Inconclusive,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct FunctionalReproducibilityReport {
    pub metrics: Vec<FunctionalSimilarityMetric>,
    pub verdict: ReproducibilityVerdict,
    pub failing_metrics: Vec<String>,
    pub inconclusive_metrics: Vec<String>,
}

/// Assess behavioral equivalence conservatively. A metric passes only when its
/// confidence interval is entirely above the configured threshold. Critical
/// failures reject equivalence; intervals crossing a threshold are
/// inconclusive rather than silently accepted.
pub fn assess_functional_reproducibility(
    metrics: Vec<FunctionalSimilarityMetric>,
) -> FunctionalReproducibilityReport {
    let failing_metrics = metrics
        .iter()
        .filter(|metric| {
            metric.critical && metric.confidence_interval_upper < metric.equivalence_threshold
        })
        .map(|metric| metric.metric.clone())
        .collect::<Vec<_>>();
    let inconclusive_metrics = metrics
        .iter()
        .filter(|metric| {
            metric.critical
                && metric.confidence_interval_lower < metric.equivalence_threshold
                && metric.confidence_interval_upper >= metric.equivalence_threshold
        })
        .map(|metric| metric.metric.clone())
        .collect::<Vec<_>>();
    let verdict = if !failing_metrics.is_empty() {
        ReproducibilityVerdict::NotEquivalent
    } else if !inconclusive_metrics.is_empty() {
        ReproducibilityVerdict::Inconclusive
    } else {
        ReproducibilityVerdict::Equivalent
    };
    FunctionalReproducibilityReport {
        metrics,
        verdict,
        failing_metrics,
        inconclusive_metrics,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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
}

use super::*;
use genos_core::BranchId;

fn branch(
    id: &str,
    parent: Option<&str>,
    score: f64,
    children: &[&str],
) -> EvolutionBranchSpec {
    EvolutionBranchSpec {
        branch_id: BranchId(id.to_string()),
        parent_branch_id: parent.map(|value| BranchId(value.to_string())),
        score,
        children: children
            .iter()
            .map(|value| BranchId((*value).to_string()))
            .collect(),
    }
}

fn scenario() -> Vec<EvolutionBranchSpec> {
    vec![
        branch("A", None, 0.82, &["A1", "A2", "A3"]),
        branch("B", None, 0.21, &[]),
        branch("C", None, 0.77, &["C1", "C2"]),
        branch("D", None, 0.05, &[]),
        branch("E", None, 0.69, &[]),
        branch("A1", Some("A"), 0.64, &[]),
        branch("A2", Some("A"), 0.91, &["A2.1", "A2.2"]),
        branch("A3", Some("A"), 0.48, &[]),
        branch("A2.1", Some("A2"), 0.88, &[]),
        branch("A2.2", Some("A2"), 0.73, &[]),
        branch("C1", Some("C"), 0.81, &[]),
        branch("C2", Some("C"), 0.42, &[]),
    ]
}

fn config() -> BranchEvolutionConfig {
    BranchEvolutionConfig {
        total_compute_units: 1_000,
        minimum_evaluation_units: 10,
        survival_threshold: 0.6,
        max_depth: 2,
        max_children_per_branch: 3,
        max_survivors_per_generation: 0,
    }
}

#[test]
fn weak_branches_die_and_only_survivors_divide() {
    let report = run_branch_evolution(&scenario(), &config()).unwrap();
    assert!(report.dead_branches.contains(&BranchId("B".to_string())));
    assert!(report.dead_branches.contains(&BranchId("D".to_string())));
    assert_eq!(report.generations[0].spawned.len(), 5);
    assert!(report
        .branches
        .iter()
        .find(|record| record.branch_id.0 == "A")
        .unwrap()
        .children_spawned
        .contains(&BranchId("A2".to_string())));
    assert!(report
        .branches
        .iter()
        .any(|record| record.branch_id.0 == "A2.1"));
}

#[test]
fn compute_is_bounded_and_favors_stronger_living_leaves() {
    let report = run_branch_evolution(&scenario(), &config()).unwrap();
    assert_eq!(report.compute_used, 1_000);
    assert_eq!(report.compute_remaining, 0);
    let compute = |id: &str| {
        report
            .branches
            .iter()
            .find(|record| record.branch_id.0 == id)
            .unwrap()
            .total_compute()
    };
    assert!(compute("A2.1") > compute("A2.2"));
}

#[test]
fn low_capacity_prunes_valid_but_lower_ranked_survivors() {
    let mut constrained = config();
    constrained.max_survivors_per_generation = 2;
    let report = run_branch_evolution(&scenario(), &constrained).unwrap();
    assert_eq!(
        report
            .branches
            .iter()
            .find(|record| record.branch_id.0 == "E")
            .unwrap()
            .state,
        EvolutionBranchState::CapacityPruned
    );
}

#[test]
fn descendants_stop_cleanly_when_the_budget_cannot_fund_a_generation() {
    let specs = vec![
        branch("A", None, 0.9, &["A1", "A2"]),
        branch("A1", Some("A"), 0.8, &[]),
        branch("A2", Some("A"), 0.7, &[]),
    ];
    let report = run_branch_evolution(
        &specs,
        &BranchEvolutionConfig {
            total_compute_units: 20,
            minimum_evaluation_units: 10,
            survival_threshold: 0.6,
            max_depth: 1,
            max_children_per_branch: 2,
            max_survivors_per_generation: 0,
        },
    )
    .unwrap();
    assert_eq!(report.compute_used, 10);
    assert_eq!(report.compute_remaining, 10);
    assert_eq!(
        report
            .branches
            .iter()
            .filter(|record| record.state == EvolutionBranchState::BudgetExhausted)
            .count(),
        2
    );
}

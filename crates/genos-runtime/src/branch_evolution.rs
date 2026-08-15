use genos_core::BranchId;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct BranchEvolutionConfig {
    pub total_compute_units: u64,
    pub minimum_evaluation_units: u64,
    pub survival_threshold: f64,
    pub max_depth: usize,
    pub max_children_per_branch: usize,
    #[serde(default)]
    pub max_survivors_per_generation: usize,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct EvolutionBranchSpec {
    pub branch_id: BranchId,
    pub parent_branch_id: Option<BranchId>,
    pub score: f64,
    #[serde(default)]
    pub children: Vec<BranchId>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EvolutionBranchState {
    Eliminated,
    CapacityPruned,
    Expanded,
    Survived,
    BudgetExhausted,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct EvolutionBranchRecord {
    pub branch_id: BranchId,
    pub parent_branch_id: Option<BranchId>,
    pub depth: usize,
    pub score: Option<f64>,
    pub evaluation_compute: u64,
    pub exploitation_compute: u64,
    pub state: EvolutionBranchState,
    pub children_spawned: Vec<BranchId>,
    pub reason: String,
}

impl EvolutionBranchRecord {
    pub fn total_compute(&self) -> u64 {
        self.evaluation_compute + self.exploitation_compute
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct EvolutionGeneration {
    pub depth: usize,
    pub evaluated: Vec<BranchId>,
    pub eliminated: Vec<BranchId>,
    pub survivors: Vec<BranchId>,
    pub spawned: Vec<BranchId>,
    pub compute_used: u64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct BranchEvolutionReport {
    pub config: BranchEvolutionConfig,
    pub branches: Vec<EvolutionBranchRecord>,
    pub generations: Vec<EvolutionGeneration>,
    pub living_leaves: Vec<BranchId>,
    pub dead_branches: Vec<BranchId>,
    pub not_spawned: Vec<BranchId>,
    pub compute_used: u64,
    pub compute_remaining: u64,
}

#[derive(Clone)]
struct ActiveBranch {
    id: BranchId,
    depth: usize,
    inherited_score: f64,
}

/// Run a deterministic, budget-bounded temporary evolution of reasoning.
/// Scores are supplied by the caller's evaluator; this scheduler decides which
/// branches die, which split, and how compute is allocated.
pub fn run_branch_evolution(
    specs: &[EvolutionBranchSpec],
    config: &BranchEvolutionConfig,
) -> Result<BranchEvolutionReport, String> {
    validate(specs, config)?;
    let by_id = specs
        .iter()
        .map(|spec| (spec.branch_id.0.clone(), spec))
        .collect::<HashMap<_, _>>();
    let mut active = specs
        .iter()
        .filter(|spec| spec.parent_branch_id.is_none())
        .map(|spec| ActiveBranch {
            id: spec.branch_id.clone(),
            depth: 0,
            inherited_score: 1.0,
        })
        .collect::<Vec<_>>();
    active.sort_by(|left, right| left.id.0.cmp(&right.id.0));

    let mut remaining = config.total_compute_units;
    let mut records = Vec::new();
    let mut generations = Vec::new();

    while !active.is_empty() {
        let depth = active[0].depth;
        let minimum_required = config.minimum_evaluation_units * active.len() as u64;
        if remaining < minimum_required {
            for branch in active.drain(..) {
                records.push(EvolutionBranchRecord {
                    parent_branch_id: by_id[&branch.id.0].parent_branch_id.clone(),
                    branch_id: branch.id,
                    depth,
                    score: None,
                    evaluation_compute: 0,
                    exploitation_compute: 0,
                    state: EvolutionBranchState::BudgetExhausted,
                    children_spawned: vec![],
                    reason: "global budget cannot fund minimum evaluation".to_string(),
                });
            }
            break;
        }

        let levels_remaining = config.max_depth.saturating_sub(depth) + 1;
        let round_pool = if depth == config.max_depth {
            // Keep the final surplus for score-proportional exploitation after
            // every leaf has received a fair minimum evaluation.
            minimum_required
        } else {
            (remaining / levels_remaining as u64).max(minimum_required)
        };
        let allocations = weighted_allocations(
            round_pool.min(remaining),
            config.minimum_evaluation_units,
            &active,
        );
        let compute_used = allocations.iter().sum::<u64>();
        remaining -= compute_used;

        let mut ranked_survivors = active
            .iter()
            .filter_map(|branch| {
                let spec = by_id[&branch.id.0];
                (spec.score >= config.survival_threshold).then_some((branch, spec))
            })
            .collect::<Vec<_>>();
        ranked_survivors.sort_by(|(left_branch, left_spec), (right_branch, right_spec)| {
            right_spec
                .score
                .total_cmp(&left_spec.score)
                .then_with(|| left_branch.id.0.cmp(&right_branch.id.0))
        });
        let capacity = if config.max_survivors_per_generation == 0 {
            ranked_survivors.len()
        } else {
            config
                .max_survivors_per_generation
                .min(ranked_survivors.len())
        };
        let selected = ranked_survivors
            .iter()
            .take(capacity)
            .map(|(branch, _)| branch.id.0.clone())
            .collect::<HashSet<_>>();

        let mut generation = EvolutionGeneration {
            depth,
            evaluated: active.iter().map(|branch| branch.id.clone()).collect(),
            eliminated: vec![],
            survivors: vec![],
            spawned: vec![],
            compute_used,
        };
        let mut next = Vec::new();
        for (index, branch) in active.drain(..).enumerate() {
            let spec = by_id[&branch.id.0];
            let allocation = allocations[index];
            if spec.score < config.survival_threshold {
                generation.eliminated.push(branch.id.clone());
                records.push(record(
                    &branch,
                    spec,
                    allocation,
                    EvolutionBranchState::Eliminated,
                    vec![],
                    format!(
                        "score {:.3} below survival threshold {:.3}",
                        spec.score, config.survival_threshold
                    ),
                ));
                continue;
            }
            if !selected.contains(&branch.id.0) {
                generation.eliminated.push(branch.id.clone());
                records.push(record(
                    &branch,
                    spec,
                    allocation,
                    EvolutionBranchState::CapacityPruned,
                    vec![],
                    "survival capacity assigned to higher-scoring branches".to_string(),
                ));
                continue;
            }

            generation.survivors.push(branch.id.clone());
            if depth < config.max_depth && !spec.children.is_empty() {
                let children = spec
                    .children
                    .iter()
                    .take(config.max_children_per_branch)
                    .cloned()
                    .collect::<Vec<_>>();
                for child in &children {
                    generation.spawned.push(child.clone());
                    next.push(ActiveBranch {
                        id: child.clone(),
                        depth: depth + 1,
                        inherited_score: spec.score,
                    });
                }
                records.push(record(
                    &branch,
                    spec,
                    allocation,
                    EvolutionBranchState::Expanded,
                    children,
                    "survived and divided into descendant branches".to_string(),
                ));
            } else {
                records.push(record(
                    &branch,
                    spec,
                    allocation,
                    EvolutionBranchState::Survived,
                    vec![],
                    if depth == config.max_depth {
                        "survived at maximum depth".to_string()
                    } else {
                        "survived as a terminal branch".to_string()
                    },
                ));
            }
        }
        next.sort_by(|left, right| left.id.0.cmp(&right.id.0));
        generations.push(generation);
        active = next;
    }

    let living = records
        .iter()
        .enumerate()
        .filter(|(_, record)| record.state == EvolutionBranchState::Survived)
        .map(|(index, record)| (index, record.score.unwrap_or(0.0)))
        .collect::<Vec<_>>();
    if !living.is_empty() && remaining > 0 {
        let bonuses = proportional_bonus(remaining, &living);
        for ((record_index, _), bonus) in living.iter().zip(bonuses) {
            records[*record_index].exploitation_compute += bonus;
        }
        remaining = 0;
    }

    records.sort_by(|left, right| {
        left.depth
            .cmp(&right.depth)
            .then_with(|| left.branch_id.0.cmp(&right.branch_id.0))
    });
    let recorded = records
        .iter()
        .map(|record| record.branch_id.0.clone())
        .collect::<HashSet<_>>();
    let mut not_spawned = specs
        .iter()
        .filter(|spec| !recorded.contains(&spec.branch_id.0))
        .map(|spec| spec.branch_id.clone())
        .collect::<Vec<_>>();
    not_spawned.sort_by(|left, right| left.0.cmp(&right.0));
    let mut living_leaves = records
        .iter()
        .filter(|record| record.state == EvolutionBranchState::Survived)
        .map(|record| record.branch_id.clone())
        .collect::<Vec<_>>();
    living_leaves.sort_by(|left, right| left.0.cmp(&right.0));
    let mut dead_branches = records
        .iter()
        .filter(|record| {
            matches!(
                record.state,
                EvolutionBranchState::Eliminated | EvolutionBranchState::CapacityPruned
            )
        })
        .map(|record| record.branch_id.clone())
        .collect::<Vec<_>>();
    dead_branches.sort_by(|left, right| left.0.cmp(&right.0));
    let compute_used = records
        .iter()
        .map(EvolutionBranchRecord::total_compute)
        .sum();
    Ok(BranchEvolutionReport {
        config: config.clone(),
        branches: records,
        generations,
        living_leaves,
        dead_branches,
        not_spawned,
        compute_used,
        compute_remaining: remaining,
    })
}

fn record(
    branch: &ActiveBranch,
    spec: &EvolutionBranchSpec,
    evaluation_compute: u64,
    state: EvolutionBranchState,
    children_spawned: Vec<BranchId>,
    reason: String,
) -> EvolutionBranchRecord {
    EvolutionBranchRecord {
        branch_id: branch.id.clone(),
        parent_branch_id: spec.parent_branch_id.clone(),
        depth: branch.depth,
        score: Some(spec.score),
        evaluation_compute,
        exploitation_compute: 0,
        state,
        children_spawned,
        reason,
    }
}

fn weighted_allocations(total: u64, minimum: u64, active: &[ActiveBranch]) -> Vec<u64> {
    let baseline = minimum * active.len() as u64;
    let weighted = active
        .iter()
        .enumerate()
        .map(|(index, branch)| (index, branch.inherited_score.max(0.000_001)))
        .collect::<Vec<_>>();
    proportional_bonus(total.saturating_sub(baseline), &weighted)
        .into_iter()
        .map(|bonus| minimum + bonus)
        .collect()
}

fn proportional_bonus(total: u64, weighted: &[(usize, f64)]) -> Vec<u64> {
    if weighted.is_empty() {
        return vec![];
    }
    let weight_sum = weighted.iter().map(|(_, weight)| *weight).sum::<f64>();
    if weight_sum <= f64::EPSILON {
        let base = total / weighted.len() as u64;
        let remainder = total % weighted.len() as u64;
        return (0..weighted.len())
            .map(|index| base + u64::from(index < remainder as usize))
            .collect();
    }
    let mut result = weighted
        .iter()
        .map(|(_, weight)| ((total as f64 * *weight / weight_sum).floor()) as u64)
        .collect::<Vec<_>>();
    let assigned = result.iter().sum::<u64>();
    let mut order = weighted.iter().enumerate().collect::<Vec<_>>();
    order.sort_by(|(left_pos, (_, left)), (right_pos, (_, right))| {
        right.total_cmp(left).then_with(|| left_pos.cmp(right_pos))
    });
    for (position, _) in order.into_iter().cycle().take((total - assigned) as usize) {
        result[position] += 1;
    }
    result
}

fn validate(specs: &[EvolutionBranchSpec], config: &BranchEvolutionConfig) -> Result<(), String> {
    if specs.is_empty()
        || config.total_compute_units == 0
        || config.minimum_evaluation_units == 0
        || !(0.0..=1.0).contains(&config.survival_threshold)
        || config.max_children_per_branch == 0
    {
        return Err("invalid branch evolution configuration".to_string());
    }
    let mut ids = HashSet::new();
    for spec in specs {
        if !ids.insert(spec.branch_id.0.clone()) || !(0.0..=1.0).contains(&spec.score) {
            return Err("branch ids must be unique and scores bounded".to_string());
        }
    }
    let roots = specs
        .iter()
        .filter(|spec| spec.parent_branch_id.is_none())
        .count();
    if roots == 0 || config.total_compute_units < config.minimum_evaluation_units * roots as u64 {
        return Err("budget cannot fund the root generation".to_string());
    }
    let by_id = specs
        .iter()
        .map(|spec| (spec.branch_id.0.as_str(), spec))
        .collect::<HashMap<_, _>>();
    for spec in specs {
        if let Some(parent) = &spec.parent_branch_id {
            let Some(parent_spec) = by_id.get(parent.0.as_str()) else {
                return Err(format!("unknown parent {}", parent.0));
            };
            if !parent_spec.children.contains(&spec.branch_id) {
                return Err(format!(
                    "parent {} does not declare child {}",
                    parent.0, spec.branch_id.0
                ));
            }
        }
        for child in &spec.children {
            let Some(child_spec) = by_id.get(child.0.as_str()) else {
                return Err(format!("unknown child {}", child.0));
            };
            if child_spec.parent_branch_id.as_ref() != Some(&spec.branch_id) {
                return Err(format!("child {} has inconsistent parent", child.0));
            }
        }
    }
    let mut reachable = HashSet::new();
    let mut stack = specs
        .iter()
        .filter(|spec| spec.parent_branch_id.is_none())
        .map(|spec| spec.branch_id.clone())
        .collect::<Vec<_>>();
    while let Some(branch) = stack.pop() {
        if !reachable.insert(branch.0.clone()) {
            return Err(format!(
                "cycle or duplicate path reaches branch {}",
                branch.0
            ));
        }
        stack.extend(by_id[branch.0.as_str()].children.iter().cloned());
    }
    if reachable.len() != specs.len() {
        return Err("every declared branch must descend from a root".to_string());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

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
}

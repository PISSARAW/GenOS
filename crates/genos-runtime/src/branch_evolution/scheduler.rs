use std::collections::{HashMap, HashSet};

use super::allocation::{proportional_bonus, weighted_allocations};
use super::types::{
    ActiveBranch, BranchEvolutionConfig, BranchEvolutionReport, BranchRecordDetail,
    EvolutionBranchRecord, EvolutionBranchSpec, EvolutionBranchState, EvolutionGeneration,
};
use super::validation::validate;

pub fn run_branch_evolution(
    specs: &[EvolutionBranchSpec],
    config: &BranchEvolutionConfig,
) -> Result<BranchEvolutionReport, String> {
    validate(specs, config)?;
    let by_id = specs
        .iter()
        .map(|spec| (spec.branch_id.0.clone(), spec))
        .collect::<HashMap<_, _>>();
    let mut active = initial_active_branches(specs);

    let mut remaining = config.total_compute_units;
    let mut records = Vec::new();
    let mut generations = Vec::new();

    while !active.is_empty() {
        let depth = active[0].depth;
        let minimum_required = config.minimum_evaluation_units * active.len() as u64;
        if remaining < minimum_required {
            exhaust_active_budget(&active, &by_id, depth, &mut records);
            break;
        }

        let round_pool = calculate_round_pool(config, depth, remaining, minimum_required);
        let allocations = weighted_allocations(
            round_pool.min(remaining),
            config.minimum_evaluation_units,
            &active,
        );
        let compute_used = allocations.iter().sum::<u64>();
        remaining -= compute_used;

        let selected = select_survivors(&active, &by_id, config);
        let mut generation = EvolutionGeneration {
            depth,
            evaluated: active.iter().map(|branch| branch.id.clone()).collect(),
            eliminated: vec![],
            survivors: vec![],
            spawned: vec![],
            compute_used,
        };
        let next = process_active_generation(
            &mut active,
            GenerationContext {
                by_id: &by_id,
                config,
                allocations: &allocations,
                selected: &selected,
                depth,
            },
            &mut generation,
            &mut records,
        );
        generations.push(generation);
        active = next;
    }

    apply_terminal_bonus(&mut records, &mut remaining);
    Ok(build_report(config, specs, records, generations, remaining))
}

struct GenerationContext<'a> {
    by_id: &'a HashMap<String, &'a EvolutionBranchSpec>,
    config: &'a BranchEvolutionConfig,
    allocations: &'a [u64],
    selected: &'a HashSet<String>,
    depth: usize,
}

fn initial_active_branches(specs: &[EvolutionBranchSpec]) -> Vec<ActiveBranch> {
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
    active
}

fn exhaust_active_budget(
    active: &[ActiveBranch],
    by_id: &HashMap<String, &EvolutionBranchSpec>,
    depth: usize,
    records: &mut Vec<EvolutionBranchRecord>,
) {
    for branch in active {
        records.push(EvolutionBranchRecord {
            parent_branch_id: by_id[&branch.id.0].parent_branch_id.clone(),
            branch_id: branch.id.clone(),
            depth,
            score: None,
            evaluation_compute: 0,
            exploitation_compute: 0,
            state: EvolutionBranchState::BudgetExhausted,
            children_spawned: vec![],
            reason: "global budget cannot fund minimum evaluation".to_string(),
        });
    }
}

fn calculate_round_pool(
    config: &BranchEvolutionConfig,
    depth: usize,
    remaining: u64,
    minimum_required: u64,
) -> u64 {
    if depth == config.max_depth {
        minimum_required
    } else {
        let levels_remaining = config.max_depth.saturating_sub(depth) + 1;
        (remaining / levels_remaining as u64).max(minimum_required)
    }
}

fn select_survivors(
    active: &[ActiveBranch],
    by_id: &HashMap<String, &EvolutionBranchSpec>,
    config: &BranchEvolutionConfig,
) -> HashSet<String> {
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
    ranked_survivors
        .iter()
        .take(capacity)
        .map(|(branch, _)| branch.id.0.clone())
        .collect()
}

fn process_active_generation(
    active: &mut Vec<ActiveBranch>,
    ctx: GenerationContext,
    generation: &mut EvolutionGeneration,
    records: &mut Vec<EvolutionBranchRecord>,
) -> Vec<ActiveBranch> {
    let mut next = Vec::new();
    for (index, branch) in active.drain(..).enumerate() {
        let spec = ctx.by_id[&branch.id.0];
        let allocation = ctx.allocations[index];

        if spec.score < ctx.config.survival_threshold {
            generation.eliminated.push(branch.id.clone());
            records.push(record(
                &branch,
                spec,
                BranchRecordDetail {
                    evaluation_compute: allocation,
                    state: EvolutionBranchState::Eliminated,
                    children_spawned: vec![],
                    reason: format!(
                        "score {:.3} below survival threshold {:.3}",
                        spec.score, ctx.config.survival_threshold
                    ),
                },
            ));
            continue;
        }

        if !ctx.selected.contains(&branch.id.0) {
            generation.eliminated.push(branch.id.clone());
            records.push(record(
                &branch,
                spec,
                BranchRecordDetail {
                    evaluation_compute: allocation,
                    state: EvolutionBranchState::CapacityPruned,
                    children_spawned: vec![],
                    reason: "survival capacity assigned to higher-scoring branches".to_string(),
                },
            ));
            continue;
        }

        generation.survivors.push(branch.id.clone());
        if ctx.depth < ctx.config.max_depth && !spec.children.is_empty() {
            let children = spec
                .children
                .iter()
                .take(ctx.config.max_children_per_branch)
                .cloned()
                .collect::<Vec<_>>();
            for child in &children {
                generation.spawned.push(child.clone());
                next.push(ActiveBranch {
                    id: child.clone(),
                    depth: ctx.depth + 1,
                    inherited_score: spec.score,
                });
            }
            records.push(record(
                &branch,
                spec,
                BranchRecordDetail {
                    evaluation_compute: allocation,
                    state: EvolutionBranchState::Expanded,
                    children_spawned: children,
                    reason: "survived and divided into descendant branches".to_string(),
                },
            ));
        } else {
            records.push(record(
                &branch,
                spec,
                BranchRecordDetail {
                    evaluation_compute: allocation,
                    state: EvolutionBranchState::Survived,
                    children_spawned: vec![],
                    reason: if ctx.depth == ctx.config.max_depth {
                        "survived at maximum depth".to_string()
                    } else {
                        "survived as a terminal branch".to_string()
                    },
                },
            ));
        }
    }
    next.sort_by(|left, right| left.id.0.cmp(&right.id.0));
    next
}

fn apply_terminal_bonus(records: &mut [EvolutionBranchRecord], remaining: &mut u64) {
    let living = records
        .iter()
        .enumerate()
        .filter(|(_, record)| record.state == EvolutionBranchState::Survived)
        .map(|(index, record)| (index, record.score.unwrap_or(0.0)))
        .collect::<Vec<_>>();
    if !living.is_empty() && *remaining > 0 {
        let bonuses = proportional_bonus(*remaining, &living);
        for ((record_index, _), bonus) in living.iter().zip(bonuses) {
            records[*record_index].exploitation_compute += bonus;
        }
        *remaining = 0;
    }
}

fn build_report(
    config: &BranchEvolutionConfig,
    specs: &[EvolutionBranchSpec],
    mut records: Vec<EvolutionBranchRecord>,
    generations: Vec<EvolutionGeneration>,
    remaining: u64,
) -> BranchEvolutionReport {
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
    BranchEvolutionReport {
        config: config.clone(),
        branches: records,
        generations,
        living_leaves,
        dead_branches,
        not_spawned,
        compute_used,
        compute_remaining: remaining,
    }
}

fn record(
    branch: &ActiveBranch,
    spec: &EvolutionBranchSpec,
    detail: BranchRecordDetail,
) -> EvolutionBranchRecord {
    EvolutionBranchRecord {
        branch_id: branch.id.clone(),
        parent_branch_id: spec.parent_branch_id.clone(),
        depth: branch.depth,
        score: Some(spec.score),
        evaluation_compute: detail.evaluation_compute,
        exploitation_compute: 0,
        state: detail.state,
        children_spawned: detail.children_spawned,
        reason: detail.reason,
    }
}

use std::collections::{HashMap, HashSet};
use super::types::{BranchEvolutionConfig, EvolutionBranchSpec};

pub(crate) fn validate(
    specs: &[EvolutionBranchSpec],
    config: &BranchEvolutionConfig,
) -> Result<(), String> {
    validate_config_bounds(specs, config)?;
    validate_uniqueness_and_scores(specs)?;
    validate_root_budget(specs, config)?;
    validate_parent_child_consistency(specs)?;
    validate_reachability(specs)?;
    Ok(())
}

fn validate_config_bounds(
    specs: &[EvolutionBranchSpec],
    config: &BranchEvolutionConfig,
) -> Result<(), String> {
    if specs.is_empty()
        || config.total_compute_units == 0
        || config.minimum_evaluation_units == 0
        || !(0.0..=1.0).contains(&config.survival_threshold)
        || config.max_children_per_branch == 0
    {
        return Err("invalid branch evolution configuration".to_string());
    }
    Ok(())
}

fn validate_uniqueness_and_scores(specs: &[EvolutionBranchSpec]) -> Result<(), String> {
    let mut ids = HashSet::new();
    for spec in specs {
        if !ids.insert(spec.branch_id.0.clone()) || !(0.0..=1.0).contains(&spec.score) {
            return Err("branch ids must be unique and scores bounded".to_string());
        }
    }
    Ok(())
}

fn validate_root_budget(
    specs: &[EvolutionBranchSpec],
    config: &BranchEvolutionConfig,
) -> Result<(), String> {
    let roots = specs
        .iter()
        .filter(|spec| spec.parent_branch_id.is_none())
        .count();
    if roots == 0 || config.total_compute_units < config.minimum_evaluation_units * roots as u64 {
        return Err("budget cannot fund the root generation".to_string());
    }
    Ok(())
}

fn validate_parent_child_consistency(specs: &[EvolutionBranchSpec]) -> Result<(), String> {
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
    Ok(())
}

fn validate_reachability(specs: &[EvolutionBranchSpec]) -> Result<(), String> {
    let by_id = specs
        .iter()
        .map(|spec| (spec.branch_id.0.as_str(), spec))
        .collect::<HashMap<_, _>>();

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

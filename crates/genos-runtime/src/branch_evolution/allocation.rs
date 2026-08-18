use super::types::ActiveBranch;

pub(crate) fn weighted_allocations(
    total: u64,
    minimum: u64,
    active: &[ActiveBranch],
) -> Vec<u64> {
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

pub(crate) fn proportional_bonus(total: u64, weighted: &[(usize, f64)]) -> Vec<u64> {
    if weighted.is_empty() {
        return vec![];
    }
    let weight_sum = weighted.iter().map(|(_, weight)| *weight).sum::<f64>();
    if weight_sum <= f64::EPSILON {
        return distribute_even_bonus(total, weighted.len());
    }
    let mut result = weighted
        .iter()
        .map(|(_, weight)| ((total as f64 * *weight / weight_sum).floor()) as u64)
        .collect::<Vec<_>>();
    let assigned = result.iter().sum::<u64>();
    distribute_remainder(total - assigned, weighted, &mut result);
    result
}

fn distribute_even_bonus(total: u64, count: usize) -> Vec<u64> {
    let base = total / count as u64;
    let remainder = total % count as u64;
    (0..count)
        .map(|index| base + u64::from(index < remainder as usize))
        .collect()
}

fn distribute_remainder(
    remainder: u64,
    weighted: &[(usize, f64)],
    result: &mut [u64],
) {
    let mut order = weighted.iter().enumerate().collect::<Vec<_>>();
    order.sort_by(|(left_pos, (_, left)), (right_pos, (_, right))| {
        right.total_cmp(left).then_with(|| left_pos.cmp(right_pos))
    });
    for (position, _) in order.into_iter().cycle().take(remainder as usize) {
        result[position] += 1;
    }
}

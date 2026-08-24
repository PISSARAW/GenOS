//! Partition into exactly `groups` contiguous blocks minimizing the sum of
//! squared block sums.
//!
//! Recurrence: dp[g][j] = min_{i<j} dp[g-1][i] + (P[j] - P[i])^2.
//! The cost w(i, j) = (P[j] - P[i])^2 satisfies the concave Monge condition
//! (for a <= c <= b <= d: (d-a)^2 + (b-c)^2 <= (b-a)^2 + (d-c)^2 reduces to
//! (a-c)(d-b) >= 0), so the argmin of each row is non-decreasing and the
//! divide-and-conquer optimization evaluates each layer in O(n log n).
//! Total: O(groups * n log n) time, O(n) extra space. All block costs fit in
//! u128 because sum <= 8e10 and its square <= 6.4e21 > u64::MAX.

pub fn min_squared_partition_cost(values: &[u64], groups: usize) -> u128 {
    assert!(!values.is_empty());
    assert!((1..=values.len()).contains(&groups));

    let n = values.len();
    if groups == 1 || groups == n {
        let total: u128 = values.iter().map(|&value| value as u128).sum();
        return if groups == 1 { total * total } else { values.iter().map(|&v| v as u128 * v as u128).sum() };
    }

    let mut prefix = vec![0u128; n + 1];
    for (index, &value) in values.iter().enumerate() {
        prefix[index + 1] = prefix[index] + value as u128;
    }

    let mut previous = vec![u128::MAX; n + 1];
    previous[0] = 0;

    for layer in 1..=groups {
        let mut current = vec![u128::MAX; n + 1];
        conquer(
            &previous, &prefix, &mut current,
            layer, n, layer - 1, n - 1,
        );
        previous = current;
    }

    previous[n]
}

/// Fills `current[lo..=hi]` knowing every row argmin lies in
/// `[opt_lo..=opt_hi]` (monotonicity from the Monge property).
/// `layer` is the 1-based group index being computed.
fn conquer(
    previous: &[u128],
    prefix: &[u128],
    current: &mut [u128],
    lo: usize,
    hi: usize,
    opt_lo: usize,
    opt_hi: usize,
) {
    if lo > hi {
        return;
    }
    let mid = (lo + hi) / 2;
    let mut best_cost = u128::MAX;
    let mut best_split = opt_lo;
    for split in opt_lo..=opt_hi.min(mid - 1) {
        let prior = previous[split];
        if prior == u128::MAX {
            continue;
        }
        let sum = prefix[mid] - prefix[split];
        let cost = prior + sum * sum;
        if cost < best_cost {
            best_cost = cost;
            best_split = split;
        }
    }
    if best_cost != u128::MAX {
        current[mid] = best_cost;
    }
    if mid == 0 {
        return;
    }
    conquer(previous, prefix, current, lo, mid - 1, opt_lo, best_split);
    conquer(previous, prefix, current, mid + 1, hi, best_split, opt_hi);
}

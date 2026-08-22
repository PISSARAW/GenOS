//! Partition a non-negative sequence into exactly `groups` contiguous blocks.
//!
//! The dynamic program is optimized with a monotone convex hull.  Both the
//! candidate centers and the query points are prefix sums, so they arrive in
//! non-decreasing order.

use std::collections::VecDeque;

#[derive(Clone, Copy)]
struct Candidate {
    /// Prefix sum at the end of the preceding block.
    prefix: u128,
    /// Cost of partitioning that preceding prefix.
    cost: u128,
    /// First integer query where this candidate is no worse than its
    /// predecessor in the hull.
    starts_at: u128,
}

fn square(value: u128) -> u128 {
    value
        .checked_mul(value)
        .expect("partition cost does not fit in u128")
}

fn ceil_div(numerator: u128, denominator: u128) -> u128 {
    let quotient = numerator / denominator;
    quotient + u128::from(numerator % denominator != 0)
}

/// Return the first integer `x` for which `new` is no more expensive than
/// `old`.  Their costs are
///
/// `cost + (x - prefix)^2`.
///
/// `new.prefix > old.prefix`, so after expansion the new candidate remains
/// better for every subsequent query.
fn first_better(old: Candidate, new_prefix: u128, new_cost: u128) -> u128 {
    let old_intercept = old
        .cost
        .checked_add(square(old.prefix))
        .expect("partition intermediate does not fit in u128");
    let new_intercept = new_cost
        .checked_add(square(new_prefix))
        .expect("partition intermediate does not fit in u128");

    if new_intercept <= old_intercept {
        return 0;
    }

    let prefix_delta = new_prefix - old.prefix;
    let denominator = prefix_delta
        .checked_mul(2)
        .expect("partition intermediate does not fit in u128");
    ceil_div(new_intercept - old_intercept, denominator)
}

fn insert_candidate(hull: &mut VecDeque<Candidate>, prefix: u128, cost: u128) {
    loop {
        let Some(&last) = hull.back() else {
            hull.push_back(Candidate {
                prefix,
                cost,
                starts_at: 0,
            });
            return;
        };

        // Equal prefix sums give equal slopes.  Only the lower-cost one can
        // ever be useful; this is essential for runs of zero values.
        if last.prefix == prefix {
            if last.cost <= cost {
                return;
            }
            hull.pop_back();
            continue;
        }

        let starts_at = first_better(last, prefix, cost);
        if starts_at <= last.starts_at {
            hull.pop_back();
            continue;
        }

        hull.push_back(Candidate {
            prefix,
            cost,
            starts_at,
        });
        return;
    }
}

fn query(hull: &mut VecDeque<Candidate>, prefix: u128) -> u128 {
    while hull.len() >= 2 && hull[1].starts_at <= prefix {
        hull.pop_front();
    }

    let best = hull.front().expect("the DP hull is non-empty");
    let block_sum = prefix - best.prefix;
    best.cost
        .checked_add(square(block_sum))
        .expect("partition cost does not fit in u128")
}

/// Return the minimum sum of squared block sums over exactly `groups`
/// non-empty contiguous blocks.
///
/// Runs in `O(groups * values.len())` time and `O(values.len())` memory.
pub fn min_squared_partition_cost(values: &[u64], groups: usize) -> u128 {
    assert!(!values.is_empty());
    assert!((1..=values.len()).contains(&groups));

    let n = values.len();
    let mut prefix = Vec::with_capacity(n + 1);
    prefix.push(0u128);
    for &value in values {
        let next = prefix
            .last()
            .copied()
            .unwrap()
            .checked_add(value as u128)
            .expect("prefix sum does not fit in u128");
        prefix.push(next);
    }

    let mut previous = vec![u128::MAX; n + 1];
    previous[0] = 0;

    for group in 1..=groups {
        let mut current = vec![u128::MAX; n + 1];
        let mut hull = VecDeque::with_capacity(n - group + 1);

        for end in group..=n {
            let split = end - 1;
            if previous[split] != u128::MAX {
                insert_candidate(&mut hull, prefix[split], previous[split]);
            }
            current[end] = query(&mut hull, prefix[end]);
        }

        previous = current;
    }

    previous[n]
}

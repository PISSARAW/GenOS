//! Partition a non-negative sequence into exactly `groups` contiguous blocks.
//!
//! A DP transition can be viewed as a minimum query over affine functions.
//! Non-negative input makes both the slopes and the query points monotone, so
//! the lower envelope can be maintained in a deque in amortized constant time.

use std::collections::VecDeque;

#[derive(Clone, Copy)]
struct Line {
    /// The prefix sum at this split point.
    prefix: u128,
    /// `previous_cost + prefix * prefix`, the affine intercept.
    intercept: u128,
    /// The previous-layer cost, retained for overflow-safe evaluation.
    previous_cost: u128,
    /// First integer query coordinate for which this line is optimal.
    start: u128,
}

fn ceil_div(numerator: u128, denominator: u128) -> u128 {
    numerator / denominator + u128::from(numerator % denominator != 0)
}

fn add_line(hull: &mut VecDeque<Line>, prefix: u128, previous_cost: u128) {
    let intercept = previous_cost + prefix * prefix;

    loop {
        let Some(last) = hull.back() else {
            hull.push_back(Line {
                prefix,
                intercept,
                previous_cost,
                start: 0,
            });
            return;
        };

        // Equal prefix sums give equal slopes. Keep only the lower intercept;
        // this is essential when the input contains zeroes.
        if last.prefix == prefix {
            if last.intercept <= intercept {
                return;
            }
            hull.pop_back();
            continue;
        }

        debug_assert!(last.prefix < prefix);
        let start = if intercept <= last.intercept {
            0
        } else {
            // The new line is no worse once
            // 2 * (prefix - last.prefix) * x >= intercept - last.intercept.
            let denominator = 2 * (prefix - last.prefix);
            ceil_div(intercept - last.intercept, denominator)
        };

        if start <= last.start {
            hull.pop_back();
            continue;
        }

        hull.push_back(Line {
            prefix,
            intercept,
            previous_cost,
            start,
        });
        return;
    }
}

fn query(hull: &mut VecDeque<Line>, prefix: u128) -> u128 {
    while hull.len() >= 2 && hull[1].start <= prefix {
        hull.pop_front();
    }

    let best = hull.front().expect("at least one valid split point");
    debug_assert!(best.prefix <= prefix);
    let block_sum = prefix - best.prefix;
    best.previous_cost + block_sum * block_sum
}

/// Returns the minimum total squared block-sum cost for exactly `groups`
/// non-empty contiguous blocks.
pub fn min_squared_partition_cost(values: &[u64], groups: usize) -> u128 {
    assert!(!values.is_empty());
    assert!((1..=values.len()).contains(&groups));

    let n = values.len();
    let mut prefix = Vec::with_capacity(n + 1);
    prefix.push(0u128);
    for &value in values {
        prefix.push(prefix.last().copied().unwrap() + value as u128);
    }

    if groups == 1 {
        return prefix[n] * prefix[n];
    }
    if groups == n {
        return values
            .iter()
            .map(|&value| (value as u128) * (value as u128))
            .sum();
    }

    let mut previous = vec![u128::MAX; n + 1];
    previous[0] = 0;

    for group in 1..=groups {
        let mut current = vec![u128::MAX; n + 1];
        let mut hull = VecDeque::with_capacity(n - group + 1);

        for end in group..=n {
            let split = end - 1;
            if previous[split] != u128::MAX {
                add_line(&mut hull, prefix[split], previous[split]);
            }
            current[end] = query(&mut hull, prefix[end]);
        }

        previous = current;
    }

    previous[n]
}

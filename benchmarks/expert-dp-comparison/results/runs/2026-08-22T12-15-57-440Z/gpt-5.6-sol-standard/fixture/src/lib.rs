//! Partition a non-negative sequence into exactly `groups` contiguous blocks.

use std::collections::VecDeque;

#[derive(Clone, Copy)]
struct Line {
    // This line represents
    //   dp + (x - prefix)^2
    // = x^2 + (intercept - 2 * prefix * x).
    prefix: u128,
    dp: u128,
    intercept: u128,

    // First integral x for which this line is no worse than its predecessor.
    start: u128,
}

fn first_better_x(older: Line, newer: Line) -> u128 {
    debug_assert!(older.prefix < newer.prefix);

    // The newer line is no worse when
    //   2*x*(newer.prefix - older.prefix)
    //       >= newer.intercept - older.intercept.
    // Avoid a signed subtraction and the usual cross-products between
    // intersections.  The quotient/remainder form of ceil(a / b) also avoids
    // overflowing in `a + b - 1`.
    if newer.intercept <= older.intercept {
        return 0;
    }

    let numerator = newer.intercept - older.intercept;
    let denominator = 2 * (newer.prefix - older.prefix);
    numerator / denominator + u128::from(numerator % denominator != 0)
}

fn insert_line(hull: &mut VecDeque<Line>, mut newer: Line) {
    loop {
        let Some(&last) = hull.back() else {
            newer.start = 0;
            hull.push_back(newer);
            return;
        };

        // Equal prefix sums produce equal slopes.  Retain only the smaller
        // intercept; this is essential for runs of zero-valued elements.
        if last.prefix == newer.prefix {
            if last.intercept <= newer.intercept {
                return;
            }
            hull.pop_back();
            continue;
        }

        let start = first_better_x(last, newer);
        if start <= last.start {
            hull.pop_back();
            continue;
        }

        newer.start = start;
        hull.push_back(newer);
        return;
    }
}

fn query_hull(hull: &mut VecDeque<Line>, x: u128) -> u128 {
    while hull.len() >= 2 && hull[1].start <= x {
        hull.pop_front();
    }

    let best = hull.front().expect("a reachable split was inserted");
    let block_sum = x - best.prefix;
    best.dp + block_sum * block_sum
}

/// Return the minimum sum of squared block sums for exactly `groups` blocks.
///
/// Runs in `O(groups * values.len())` time and `O(values.len())` memory.
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
            .map(|&value| {
                let value = value as u128;
                value * value
            })
            .sum();
    }

    // Base layer: there is only one way to make one non-empty block.
    let mut previous = vec![u128::MAX; n + 1];
    for end in 1..=n {
        previous[end] = prefix[end] * prefix[end];
    }

    for group in 2..=groups {
        let mut current = vec![u128::MAX; n + 1];
        let mut hull = VecDeque::new();

        for end in group..=n {
            // Inserting end - 1 immediately before the query enforces a
            // non-empty final block while admitting every legal split.
            let split = end - 1;
            let split_prefix = prefix[split];
            let split_dp = previous[split];
            debug_assert_ne!(split_dp, u128::MAX);
            insert_line(
                &mut hull,
                Line {
                    prefix: split_prefix,
                    dp: split_dp,
                    intercept: split_dp + split_prefix * split_prefix,
                    start: 0,
                },
            );

            current[end] = query_hull(&mut hull, prefix[end]);
        }

        previous = current;
    }

    previous[n]
}

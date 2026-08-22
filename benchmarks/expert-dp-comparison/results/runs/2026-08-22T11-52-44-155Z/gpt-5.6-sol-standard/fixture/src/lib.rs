//! Partition a non-negative sequence into exactly `groups` contiguous blocks.
//!
//! The cost of a block is the square of its sum.

use std::collections::VecDeque;

/// A candidate split in the convex hull.
///
/// Ignoring the part common to every candidate at query prefix `x`, the line
/// represented here is
///
/// `dp + prefix^2 - 2 * prefix * x`.
///
/// `start` is the first integer query coordinate at which this line is no
/// worse than the preceding line in the hull.
#[derive(Clone, Copy)]
struct Line {
    prefix: u128,
    dp: u128,
    intercept: u128,
    start: u128,
}

impl Line {
    fn new(prefix: u128, dp: u128) -> Self {
        Self {
            prefix,
            dp,
            intercept: dp + prefix * prefix,
            start: 0,
        }
    }

    /// Evaluate the complete partition candidate without signed arithmetic.
    fn cost_at(self, query: u128) -> u128 {
        let block_sum = query - self.prefix;
        self.dp + block_sum * block_sum
    }
}

/// Hull for lines whose `prefix` values are inserted in non-decreasing order
/// and whose query coordinates are also non-decreasing.
struct MonotoneHull {
    lines: VecDeque<Line>,
}

impl MonotoneHull {
    fn new() -> Self {
        Self {
            lines: VecDeque::new(),
        }
    }

    fn insert(&mut self, mut new_line: Line) {
        loop {
            let Some(last) = self.lines.back().copied() else {
                new_line.start = 0;
                self.lines.push_back(new_line);
                return;
            };

            if new_line.prefix == last.prefix {
                // Equal prefix sums produce equal slopes. Keep only the line
                // with the smaller intercept (equivalently, the smaller DP).
                if new_line.intercept >= last.intercept {
                    return;
                }
                self.lines.pop_back();
                continue;
            }

            let prefix_delta = new_line.prefix - last.prefix;
            let first_better = if new_line.intercept <= last.intercept {
                0
            } else {
                // Smallest integer x satisfying
                // 2*x*prefix_delta >= new_intercept-last_intercept.
                // Quotient/remainder form avoids overflow from `a + b - 1`.
                let numerator = new_line.intercept - last.intercept;
                let denominator = 2 * prefix_delta;
                numerator / denominator + u128::from(numerator % denominator != 0)
            };

            if first_better <= last.start {
                // The last line has no integer coordinate at which it is
                // strictly preferable to both its neighbours.
                self.lines.pop_back();
            } else {
                new_line.start = first_better;
                self.lines.push_back(new_line);
                return;
            }
        }
    }

    fn query(&mut self, coordinate: u128) -> u128 {
        while self.lines.len() >= 2 && self.lines[1].start <= coordinate {
            self.lines.pop_front();
        }
        self.lines
            .front()
            .expect("the hull has a candidate before every query")
            .cost_at(coordinate)
    }
}

/// Return the minimum total squared block-sum cost for exactly `groups`
/// non-empty contiguous blocks.
///
/// Runs in `O(values.len() * groups)` time and `O(values.len())` space.
pub fn min_squared_partition_cost(values: &[u64], groups: usize) -> u128 {
    assert!(!values.is_empty());
    assert!((1..=values.len()).contains(&groups));

    let n = values.len();
    let mut prefix = Vec::with_capacity(n + 1);
    prefix.push(0u128);
    for &value in values {
        prefix.push(prefix.last().copied().unwrap() + value as u128);
    }

    let mut previous = vec![u128::MAX; n + 1];
    previous[0] = 0;

    for group in 1..=groups {
        let mut current = vec![u128::MAX; n + 1];
        let mut hull = MonotoneHull::new();

        for end in group..=n {
            let split = end - 1;
            if previous[split] != u128::MAX {
                hull.insert(Line::new(prefix[split], previous[split]));
            }
            current[end] = hull.query(prefix[end]);
        }

        previous = current;
    }

    previous[n]
}

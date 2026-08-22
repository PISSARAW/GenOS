//! Partition a non-negative sequence into exactly `groups` contiguous blocks.

use std::collections::VecDeque;

#[derive(Clone, Copy)]
struct Line {
    /// Prefix sum at the split point.
    prefix: u128,
    /// DP value at the split point.
    cost: u128,
    /// `cost + prefix^2`, the intercept of the corresponding affine function.
    intercept: u128,
    /// First integral query coordinate where this line is no worse than the
    /// preceding line in the hull.
    start: u128,
}

#[derive(Default)]
struct MonotoneHull {
    lines: VecDeque<Line>,
}

impl MonotoneHull {
    fn add(&mut self, prefix: u128, cost: u128) {
        let intercept = cost
            .checked_add(prefix.checked_mul(prefix).expect("cost exceeds u128"))
            .expect("cost exceeds u128");

        loop {
            let Some(last) = self.lines.back() else {
                self.lines.push_back(Line {
                    prefix,
                    cost,
                    intercept,
                    start: 0,
                });
                return;
            };

            debug_assert!(last.prefix <= prefix);

            // Equal prefix sums produce equal slopes (notably across zero
            // values), so only their lowest intercept can ever be useful.
            if last.prefix == prefix {
                if last.intercept <= intercept {
                    return;
                }
                self.lines.pop_back();
                continue;
            }

            // The affine parts are
            //
            //     intercept - 2 * prefix * x.
            //
            // Compute ceil((new_intercept - old_intercept) /
            //              (2 * (new_prefix - old_prefix))) without forming
            // either a cross-product or `2 * delta_prefix`.
            let start = if intercept <= last.intercept {
                0
            } else {
                ceil_div_by_twice(intercept - last.intercept, prefix - last.prefix)
            };

            if start <= last.start {
                self.lines.pop_back();
                continue;
            }

            self.lines.push_back(Line {
                prefix,
                cost,
                intercept,
                start,
            });
            return;
        }
    }

    fn query(&mut self, prefix: u128) -> u128 {
        while self.lines.len() >= 2 && self.lines[1].start <= prefix {
            self.lines.pop_front();
        }

        let line = self.lines.front().expect("the hull has a candidate");
        debug_assert!(line.prefix <= prefix);
        let block_sum = prefix - line.prefix;
        line.cost
            .checked_add(block_sum.checked_mul(block_sum).expect("cost exceeds u128"))
            .expect("cost exceeds u128")
    }
}

/// Returns `ceil(numerator / (2 * denominator))` without doubling the
/// denominator, which keeps the calculation valid across the full `u128`
/// range.
fn ceil_div_by_twice(numerator: u128, denominator: u128) -> u128 {
    debug_assert!(denominator > 0);
    let quotient = numerator / denominator;
    let remainder = numerator % denominator;
    quotient / 2
        + if quotient % 2 != 0 || remainder != 0 {
            1
        } else {
            0
        }
}

/// Return the minimum sum of squared block sums among all partitions of
/// `values` into exactly `groups` non-empty contiguous blocks.
///
/// Prefix sums and DP costs use `u128`. For each DP layer, split candidates
/// form lines with monotone slopes and queries arrive at monotone coordinates,
/// allowing a deque-based convex hull. The running time is
/// `O(groups * values.len())` and auxiliary memory is `O(values.len())`.
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
            .expect("prefix sum exceeds u128");
        prefix.push(next);
    }

    let mut previous = vec![u128::MAX; n + 1];
    for end in 1..=n {
        previous[end] = prefix[end]
            .checked_mul(prefix[end])
            .expect("cost exceeds u128");
    }

    for group in 2..=groups {
        let mut current = vec![u128::MAX; n + 1];
        let mut hull = MonotoneHull::default();

        for end in group..=n {
            // Insert immediately before querying so every represented split is
            // strictly before `end`, while `end - 1` is already available.
            let split = end - 1;
            hull.add(prefix[split], previous[split]);
            current[end] = hull.query(prefix[end]);
        }

        previous = current;
    }

    previous[n]
}

//! Partition a non-negative sequence into exactly `groups` contiguous blocks.
//!
//! The cost of a block is the square of its sum.

use std::collections::VecDeque;

/// A line of the lower envelope used by the DP transition.
///
/// The task bounds keep all values used here within `i128`: prefix sums are at
/// most 80_000 * 1_000_000, while costs and cross-products are consequently
/// far below `i128::MAX`.  Keeping the affine expression signed avoids an
/// underflow when its negative slope is evaluated.
#[derive(Clone, Copy)]
struct Line {
    slope: i128,
    intercept: i128,
}

impl Line {
    fn value_at(self, x: i128) -> i128 {
        self.slope * x + self.intercept
    }
}

/// Returns whether `middle` can never be the minimum after `last` is added.
/// Slopes are strictly decreasing, so both denominator differences below are
/// positive and cross multiplication is safe under the stated input bounds.
fn is_redundant(first: Line, middle: Line, last: Line) -> bool {
    (middle.intercept - first.intercept) * (middle.slope - last.slope)
        >= (last.intercept - middle.intercept) * (first.slope - middle.slope)
}

pub fn min_squared_partition_cost(values: &[u64], groups: usize) -> u128 {
    assert!(!values.is_empty());
    assert!((1..=values.len()).contains(&groups));

    let n = values.len();
    let mut prefix = vec![0u128; n + 1];
    for (index, &value) in values.iter().enumerate() {
        prefix[index + 1] = prefix[index] + value as u128;
    }

    // One group has no choice of split.
    let mut previous: Vec<u128> = prefix.iter().map(|&sum| sum * sum).collect();

    for group in 2..=groups {
        let mut current = vec![0u128; n + 1];
        let mut hull: VecDeque<Line> = VecDeque::new();

        // Insert the first admissible split (group - 1).  Every subsequently
        // inserted split is also admissible for all later endpoints.
        for split in (group - 1)..n {
            let split_sum =
                i128::try_from(prefix[split]).expect("task-constrained prefix sum fits in i128");
            let line = Line {
                slope: -2 * split_sum,
                intercept: i128::try_from(previous[split] + prefix[split] * prefix[split])
                    .expect("task-constrained DP value fits in i128"),
            };

            // Equal prefix sums produce equal slopes.  Only the lowest
            // intercept can appear on the lower envelope.
            let dominated_by_equal_slope = if let Some(&tail) = hull.back() {
                if tail.slope == line.slope {
                    if tail.intercept <= line.intercept {
                        true
                    } else {
                        hull.pop_back();
                        false
                    }
                } else {
                    false
                }
            } else {
                false
            };
            if !dominated_by_equal_slope {
                while hull.len() >= 2
                    && is_redundant(hull[hull.len() - 2], hull[hull.len() - 1], line)
                {
                    hull.pop_back();
                }
                hull.push_back(line);
            }

            let end = split + 1;
            if end < group {
                continue;
            }
            let end_sum =
                i128::try_from(prefix[end]).expect("task-constrained prefix sum fits in i128");
            while hull.len() >= 2 && hull[0].value_at(end_sum) >= hull[1].value_at(end_sum) {
                hull.pop_front();
            }
            let best_affine = hull[0].value_at(end_sum);
            current[end] = (end_sum * end_sum + best_affine) as u128;
        }

        previous = current;
    }

    previous[n]
}

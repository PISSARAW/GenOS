//! Partition a non-negative sequence into exactly `groups` contiguous blocks.
//!
//! The cost of a block is the square of its sum.

use std::collections::VecDeque;

#[derive(Clone, Copy)]
struct Line {
    /// The prefix sum at the split point.  The actual slope is `-2 * split`.
    split: i128,
    intercept: i128,
}

impl Line {
    fn value_at(self, prefix: i128) -> i128 {
        self.intercept - 2 * self.split * prefix
    }
}

/// Whether the middle line can never be optimal after adding `last`.
///
/// Lines have strictly decreasing slopes here, so this is the usual
/// intersection-order test with division replaced by cross multiplication.
fn is_redundant(first: Line, middle: Line, last: Line) -> bool {
    (middle.intercept - first.intercept) * (last.split - middle.split)
        >= (last.intercept - middle.intercept) * (middle.split - first.split)
}

pub fn min_squared_partition_cost(values: &[u64], groups: usize) -> u128 {
    assert!(!values.is_empty());
    assert!((1..=values.len()).contains(&groups));

    let n = values.len();
    let mut prefix = vec![0i128; n + 1];
    for (index, &value) in values.iter().enumerate() {
        prefix[index + 1] = prefix[index] + value as i128;
    }

    // `previous[split]` is the best cost for the first `split` elements.
    // All representable results under the input constraints fit in i128; using
    // it also permits the negative affine values produced by the hull.
    let unreachable = i128::MAX;
    let mut previous = vec![unreachable; n + 1];
    previous[0] = 0;

    for group in 1..=groups {
        let mut current = vec![unreachable; n + 1];
        let mut hull = VecDeque::with_capacity(n - group + 1);

        // A line for split j represents:
        // previous[j] + prefix[j]^2 - 2 * prefix[j] * prefix[end].
        hull.push_back(Line {
            split: prefix[group - 1],
            intercept: previous[group - 1] + prefix[group - 1] * prefix[group - 1],
        });

        for end in group..=n {
            while hull.len() >= 2 && hull[1].value_at(prefix[end]) <= hull[0].value_at(prefix[end])
            {
                hull.pop_front();
            }
            current[end] = prefix[end] * prefix[end] + hull[0].value_at(prefix[end]);

            if end == n {
                continue;
            }
            if previous[end] == unreachable {
                continue;
            }

            let candidate = Line {
                split: prefix[end],
                intercept: previous[end] + prefix[end] * prefix[end],
            };

            // Equal prefix sums yield equal slopes.  Keep only the lower
            // intercept, which is the only line that can be optimal.
            if hull
                .back()
                .is_some_and(|last| last.split == candidate.split)
            {
                if hull.back().unwrap().intercept <= candidate.intercept {
                    continue;
                }
                hull.pop_back();
            }

            while hull.len() >= 2
                && is_redundant(hull[hull.len() - 2], hull[hull.len() - 1], candidate)
            {
                hull.pop_back();
            }
            hull.push_back(candidate);
        }

        previous = current;
    }

    previous[n] as u128
}

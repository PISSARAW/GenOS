//! Partition a non-negative sequence into exactly `groups` contiguous blocks.
//!
//! Each DP layer is optimized with a monotone convex hull.  Prefix sums, query
//! points, and inserted slopes are all monotone because the input is
//! non-negative, so a layer takes linear time.

use std::collections::VecDeque;

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

/// Returns whether `middle` is never the best line after `first`, `middle`,
/// and `last` (whose slopes are strictly decreasing) have been inserted.
fn is_redundant(first: Line, middle: Line, last: Line) -> bool {
    // The intersection(first, middle) is to the right of (or equal to)
    // intersection(middle, last).  Cross multiplication avoids division.
    (middle.intercept - first.intercept) * (middle.slope - last.slope)
        >= (last.intercept - middle.intercept) * (first.slope - middle.slope)
}

pub fn min_squared_partition_cost(values: &[u64], groups: usize) -> u128 {
    assert!(!values.is_empty());
    assert!((1..=values.len()).contains(&groups));

    let n = values.len();
    let mut prefix = vec![0_i128; n + 1];
    for (index, &value) in values.iter().enumerate() {
        prefix[index + 1] = prefix[index] + value as i128;
    }

    // dp[i] is the cost of partitioning the first i values into the current
    // number of groups.  The initial layer represents one group.
    let mut previous: Vec<i128> = prefix.iter().map(|&sum| sum * sum).collect();

    for group in 2..=groups {
        let mut current = vec![i128::MAX; n + 1];
        let mut hull = VecDeque::new();

        let add_line = |index: usize, hull: &mut VecDeque<Line>| {
            let sum = prefix[index];
            let candidate = Line {
                slope: -2 * sum,
                intercept: previous[index] + sum * sum,
            };

            // Equal slopes arise from repeated prefix sums.  Only the lower
            // intercept can contribute to a minimum.
            while let Some(&last) = hull.back() {
                if last.slope != candidate.slope {
                    break;
                }
                if last.intercept <= candidate.intercept {
                    return;
                }
                hull.pop_back();
            }

            while hull.len() >= 2 {
                let length = hull.len();
                if !is_redundant(hull[length - 2], hull[length - 1], candidate) {
                    break;
                }
                hull.pop_back();
            }
            hull.push_back(candidate);
        };

        add_line(group - 1, &mut hull);
        for end in group..=n {
            let sum = prefix[end];
            while hull.len() >= 2
                && hull[0].value_at(sum) >= hull[1].value_at(sum)
            {
                hull.pop_front();
            }
            current[end] = sum * sum + hull[0].value_at(sum);
            add_line(end, &mut hull);
        }
        previous = current;
    }

    previous[n] as u128
}

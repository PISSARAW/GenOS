//! Partition a non-negative sequence into exactly `groups` contiguous blocks.
//!
//! Each DP layer is optimized with a monotone convex hull.  Prefix sums are
//! non-decreasing, so both inserted slopes and query positions are monotone.

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

/// Returns whether `middle` is never the minimum after `first` and before
/// `last`.  Slopes must be strictly decreasing.
fn is_redundant(first: Line, middle: Line, last: Line) -> bool {
    // intersection(first, middle) >= intersection(middle, last)
    (middle.intercept - first.intercept) * (middle.slope - last.slope)
        >= (last.intercept - middle.intercept) * (first.slope - middle.slope)
}

fn add_line(hull: &mut VecDeque<Line>, candidate: Line) {
    // Zeros can yield equal prefix sums and hence equal slopes.  Only the
    // lowest intercept can ever be useful.
    if let Some(last) = hull.back() {
        if last.slope == candidate.slope {
            if last.intercept <= candidate.intercept {
                return;
            }
            hull.pop_back();
        }
    }
    while hull.len() >= 2
        && is_redundant(hull[hull.len() - 2], hull[hull.len() - 1], candidate)
    {
        hull.pop_back();
    }
    hull.push_back(candidate);
}

pub fn min_squared_partition_cost(values: &[u64], groups: usize) -> u128 {
    assert!(!values.is_empty());
    assert!((1..=values.len()).contains(&groups));

    let n = values.len();
    let mut prefix = vec![0_i128; n + 1];
    for (index, &value) in values.iter().enumerate() {
        prefix[index + 1] = prefix[index] + value as i128;
    }

    // dp[j] is the optimum for the first j values using the previous number
    // of groups.  `i128` safely contains every product in the stated bounds.
    let infinity = i128::MAX;
    let mut previous = vec![infinity; n + 1];
    previous[0] = 0;

    for group in 1..=groups {
        let mut current = vec![infinity; n + 1];
        let mut hull = VecDeque::with_capacity(n - group + 1);
        let line_for = |index: usize| {
            let sum = prefix[index];
            Line {
                slope: -2 * sum,
                intercept: previous[index] + sum * sum,
            }
        };

        add_line(&mut hull, line_for(group - 1));
        for end in group..=n {
            let sum = prefix[end];
            while hull.len() >= 2
                && hull[0].value_at(sum) >= hull[1].value_at(sum)
            {
                hull.pop_front();
            }
            current[end] = sum * sum + hull[0].value_at(sum);

            if end < n && previous[end] != infinity {
                add_line(&mut hull, line_for(end));
            }
        }
        previous = current;
    }

    previous[n] as u128
}

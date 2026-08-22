//! Partition a non-negative sequence into exactly `groups` contiguous blocks.
//!
//! For a prefix sum `s[i]`, the usual partition recurrence is
//! `dp[k][i] = min_j(dp[k - 1][j] + (s[i] - s[j])^2)`.  Expanding the square
//! turns each candidate `j` into a line in `s[i]`.  Since the input values are
//! non-negative, both inserted slopes and queried prefix sums are monotone, so
//! a deque-based convex hull evaluates every DP layer in linear time.

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

// Lines are inserted with strictly decreasing slopes.  The middle line is
// redundant when its intersection with the first is no earlier than its
// intersection with the third.
fn is_redundant(first: Line, middle: Line, last: Line) -> bool {
    (middle.intercept - first.intercept) * (middle.slope - last.slope)
        >= (last.intercept - middle.intercept) * (first.slope - middle.slope)
}

pub fn min_squared_partition_cost(values: &[u64], groups: usize) -> u128 {
    assert!(!values.is_empty());
    assert!((1..=values.len()).contains(&groups));

    let n = values.len();
    let mut sums = Vec::with_capacity(n + 1);
    sums.push(0_i128);
    for &value in values {
        sums.push(sums.last().copied().unwrap() + value as i128);
    }

    // One non-empty block covering a prefix has no choice of cut.
    let mut previous: Vec<i128> = sums.iter().map(|&sum| sum * sum).collect();

    for block_count in 2..=groups {
        let mut current = vec![0_i128; n + 1];
        let mut hull = VecDeque::new();

        // The first feasible cut gives `block_count - 1` non-empty blocks on
        // the left.  Candidates are then appended as `i` advances.
        let first_cut = block_count - 1;
        hull.push_back(Line {
            slope: -2 * sums[first_cut],
            intercept: previous[first_cut] + sums[first_cut] * sums[first_cut],
        });

        for i in block_count..=n {
            let x = sums[i];
            while hull.len() >= 2 && hull[0].value_at(x) >= hull[1].value_at(x) {
                hull.pop_front();
            }
            current[i] = x * x + hull[0].value_at(x);

            let candidate = Line {
                slope: -2 * sums[i],
                intercept: previous[i] + sums[i] * sums[i],
            };

            // Equal prefix sums create equal slopes.  Only the smaller
            // intercept can ever be useful.
            loop {
                match hull.back().copied() {
                    Some(last) if last.slope == candidate.slope => {
                        if last.intercept <= candidate.intercept {
                            break;
                        }
                        hull.pop_back();
                    }
                    _ => {
                        while hull.len() >= 2
                            && is_redundant(hull[hull.len() - 2], hull[hull.len() - 1], candidate)
                        {
                            hull.pop_back();
                        }
                        hull.push_back(candidate);
                        break;
                    }
                }
            }
        }

        previous = current;
    }

    previous[n] as u128
}

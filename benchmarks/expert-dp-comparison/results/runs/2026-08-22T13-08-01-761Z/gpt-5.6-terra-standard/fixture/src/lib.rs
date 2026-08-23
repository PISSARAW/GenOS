//! Partition a non-negative sequence into exactly `groups` contiguous blocks.
//!
//! The cost of a block is the square of its sum.

use std::collections::VecDeque;

#[derive(Clone, Copy)]
struct Line {
    // The values in this problem fit comfortably in i128 (the result itself
    // is a u128), while a signed type lets us represent the negative slopes.
    slope: i128,
    intercept: i128,
}

impl Line {
    fn value_at(self, x: i128) -> i128 {
        self.slope * x + self.intercept
    }
}

// Slopes are strictly decreasing here.  The middle line is unnecessary when
// its intersection with `first` is not to the left of its intersection with
// `last`.
fn is_redundant(first: Line, middle: Line, last: Line) -> bool {
    (middle.intercept - first.intercept) * (middle.slope - last.slope)
        >= (last.intercept - middle.intercept) * (first.slope - middle.slope)
}

fn add_line(hull: &mut VecDeque<Line>, line: Line) {
    // Repeated prefix sums produce equal slopes.  Only the lower intercept
    // can ever win; handling this explicitly is essential for zero values.
    if let Some(&last) = hull.back() {
        if last.slope == line.slope {
            if last.intercept <= line.intercept {
                return;
            }
            hull.pop_back();
        }
    }

    while hull.len() >= 2 {
        let last = *hull.back().expect("length checked");
        let before_last = hull[hull.len() - 2];
        if !is_redundant(before_last, last, line) {
            break;
        }
        hull.pop_back();
    }
    hull.push_back(line);
}

/// Return the least total squared block-sum cost for exactly `groups` blocks.
///
/// Let `prefix[i]` be the sum of the first `i` values.  The usual recurrence
/// is
///
/// `dp[k][i] = min_j dp[k - 1][j] + (prefix[i] - prefix[j])²`.
///
/// Expanding the square turns every eligible `j` into a line with slope
/// `-2 * prefix[j]`.  Both the query coordinates and these slopes are
/// monotone, so a deque-based convex hull answers all queries in one DP layer
/// in linear time.
pub fn min_squared_partition_cost(values: &[u64], groups: usize) -> u128 {
    assert!(!values.is_empty());
    assert!((1..=values.len()).contains(&groups));

    let n = values.len();
    let mut prefix = Vec::with_capacity(n + 1);
    prefix.push(0_i128);
    for &value in values {
        prefix.push(prefix.last().expect("non-empty").checked_add(value as i128).expect("input exceeds supported sum"));
    }

    // One block: its cost is prefix[i]^2.  `i128` avoids the u64-sized
    // intermediate overflow that this task is designed to expose.
    let mut previous: Vec<i128> = prefix.iter().map(|&sum| sum * sum).collect();

    for block_count in 2..=groups {
        let mut current = vec![0_i128; n + 1];
        let mut hull = VecDeque::new();

        // For i == block_count, j == block_count - 1 is the first allowed
        // previous cut.  After each query, add the line for the next j.
        let first_cut = block_count - 1;
        add_line(
            &mut hull,
            Line {
                slope: -2 * prefix[first_cut],
                intercept: previous[first_cut] + prefix[first_cut] * prefix[first_cut],
            },
        );

        for i in block_count..=n {
            let x = prefix[i];
            while hull.len() >= 2 && hull[0].value_at(x) >= hull[1].value_at(x) {
                hull.pop_front();
            }
            current[i] = x * x + hull.front().expect("there is an eligible cut").value_at(x);

            if i < n {
                add_line(
                    &mut hull,
                    Line {
                        slope: -2 * prefix[i],
                        intercept: previous[i] + prefix[i] * prefix[i],
                    },
                );
            }
        }

        previous = current;
    }

    previous[n] as u128
}

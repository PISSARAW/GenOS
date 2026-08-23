//! Partition a non-negative sequence into exactly `groups` contiguous blocks.
//!
//! The cost of a block is the square of its sum.

#[derive(Clone, Copy)]
struct Line {
    // The values allowed by the problem fit comfortably in i128, including
    // the products used to compare intersections of two lines.
    slope: i128,
    intercept: i128,
}

impl Line {
    fn value_at(self, x: i128) -> i128 {
        self.slope * x + self.intercept
    }
}

// Return whether `middle` is never strictly best after lines are inserted in
// descending-slope order.  The factors below are positive slope differences,
// so this comparison does not need division (and is also valid for negative
// intersection positions).
fn is_redundant(first: Line, middle: Line, last: Line) -> bool {
    (middle.intercept - first.intercept) * (middle.slope - last.slope)
        >= (last.intercept - middle.intercept) * (first.slope - middle.slope)
}

/// Return the minimum sum of squared block sums for exactly `groups` blocks.
///
/// With `prefix[i]` denoting the sum of the first `i` values, the transition is
///
/// `dp[g][i] = prefix[i]^2 + min_j(dp[g - 1][j] + prefix[j]^2
///                                  - 2 * prefix[j] * prefix[i])`.
///
/// Thus each valid `j` is an affine line.  Prefix sums only increase, and the
/// corresponding line slopes only decrease, allowing a monotone convex hull
/// trick with amortized constant-time insertion and query per DP state.
pub fn min_squared_partition_cost(values: &[u64], groups: usize) -> u128 {
    assert!(!values.is_empty());
    assert!((1..=values.len()).contains(&groups));

    let n = values.len();
    let mut prefix = Vec::with_capacity(n + 1);
    prefix.push(0_i128);
    for &value in values {
        prefix.push(prefix.last().copied().unwrap() + value as i128);
    }

    // Base layer: one non-empty block covers every non-empty prefix.
    let mut previous = vec![0_i128; n + 1];
    for i in 1..=n {
        previous[i] = prefix[i] * prefix[i];
    }

    for group in 2..=groups {
        let mut current = vec![0_i128; n + 1];
        let mut hull: Vec<Line> = Vec::with_capacity(n - group + 2);
        let mut head = 0_usize;

        // Add a transition point to the hull.  Equal prefix sums produce equal
        // slopes; retaining only the smaller intercept is essential for zero
        // values in the input.
        let add_line = |index: usize, hull: &mut Vec<Line>| {
            let candidate = Line {
                slope: -2 * prefix[index],
                intercept: previous[index] + prefix[index] * prefix[index],
            };

            while let Some(&last) = hull.last() {
                if last.slope != candidate.slope {
                    break;
                }
                if last.intercept <= candidate.intercept {
                    return;
                }
                hull.pop();
            }
            while hull.len() >= 2
                && is_redundant(hull[hull.len() - 2], hull[hull.len() - 1], candidate)
            {
                hull.pop();
            }
            hull.push(candidate);
        };

        add_line(group - 1, &mut hull);
        for end in group..=n {
            let x = prefix[end];
            while head + 1 < hull.len() && hull[head + 1].value_at(x) <= hull[head].value_at(x) {
                head += 1;
            }
            current[end] = x * x + hull[head].value_at(x);
            add_line(end, &mut hull);
        }
        previous = current;
    }

    previous[n] as u128
}

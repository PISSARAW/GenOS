//! Partition a non-negative sequence into exactly `groups` contiguous blocks.
//!
//! The DP recurrence can be written as a minimum over lines, which lets each
//! layer be evaluated in linear time with a monotone convex hull.

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

/// Returns whether `middle` is never the minimum of the three lines.
///
/// Lines are inserted with strictly decreasing slopes.  Comparing the two
/// intersection points by cross multiplication avoids division and therefore
/// handles equal prefix sums exactly.
fn is_redundant(first: Line, middle: Line, last: Line) -> bool {
    (middle.intercept - first.intercept) * (middle.slope - last.slope)
        >= (last.intercept - middle.intercept) * (first.slope - middle.slope)
}

/// Minimum sum of squared block sums over exactly `groups` non-empty blocks.
pub fn min_squared_partition_cost(values: &[u64], groups: usize) -> u128 {
    assert!(!values.is_empty());
    assert!((1..=values.len()).contains(&groups));

    let n = values.len();
    let mut prefix = Vec::with_capacity(n + 1);
    prefix.push(0_i128);
    for &value in values {
        prefix.push(prefix.last().unwrap() + value as i128);
    }

    // One block is the base layer.  All quantities fit in i128 under the
    // stated bounds; using it also makes affine-line comparisons signed.
    let mut previous = vec![0_i128; n + 1];
    for i in 1..=n {
        previous[i] = prefix[i] * prefix[i];
    }

    for block_count in 2..=groups {
        let mut current = vec![0_i128; n + 1];
        let mut hull = Vec::<Line>::with_capacity(n - block_count + 2);
        let mut head = 0usize;

        for end in block_count..=n {
            // Add the only newly eligible split point before querying `end`.
            let split = end - 1;
            let candidate = Line {
                slope: -2 * prefix[split],
                intercept: previous[split] + prefix[split] * prefix[split],
            };

            // Prefix sums may repeat, producing equal slopes.  Retain only
            // the line with the smaller intercept.
            if hull
                .last()
                .is_some_and(|last| last.slope == candidate.slope)
            {
                if hull.last().unwrap().intercept <= candidate.intercept {
                    // The existing line dominates this one.
                } else {
                    hull.pop();
                    while hull.len() >= 2
                        && is_redundant(hull[hull.len() - 2], hull[hull.len() - 1], candidate)
                    {
                        hull.pop();
                    }
                    hull.push(candidate);
                }
            } else {
                while hull.len() >= 2
                    && is_redundant(hull[hull.len() - 2], hull[hull.len() - 1], candidate)
                {
                    hull.pop();
                }
                hull.push(candidate);
            }

            let x = prefix[end];
            while head + 1 < hull.len() && hull[head].value_at(x) >= hull[head + 1].value_at(x) {
                head += 1;
            }
            current[end] = x * x + hull[head].value_at(x);
        }

        previous = current;
    }

    previous[n] as u128
}

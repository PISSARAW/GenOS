//! Partition a non-negative sequence into exactly `groups` contiguous blocks.
//!
//! A DP layer is accelerated with a monotone convex hull.  Both the inserted
//! prefix sums and the queried prefix sums are non-decreasing.

#[derive(Clone, Copy)]
struct Line {
    /// Prefix sum at the split point.  The affine slope is `-2 * prefix`.
    prefix: u128,
    /// Cost of the preceding groups at the split point.
    cost: u128,
}

impl Line {
    fn intercept(self) -> u128 {
        self.cost + self.prefix * self.prefix
    }

    fn partition_cost(self, end_prefix: u128) -> u128 {
        let block_sum = end_prefix - self.prefix;
        self.cost + block_sum * block_sum
    }
}

/// Whether the middle of three lines can never be strictly optimal.
///
/// For `p1 < p2 < p3`, consecutive intersection abscissas are ordered by
/// comparing
///
/// `(b2 - b1) / (p2 - p1)` and `(b3 - b2) / (p3 - p2)`.
///
/// The factor two in the actual slopes cancels.  Cross multiplication avoids
/// division and therefore keeps the test exact.
fn middle_is_redundant(first: Line, middle: Line, last: Line) -> bool {
    let first_intercept = first.intercept();
    let middle_intercept = middle.intercept();
    let last_intercept = last.intercept();

    (middle_intercept - first_intercept) * (last.prefix - middle.prefix)
        >= (last_intercept - middle_intercept) * (middle.prefix - first.prefix)
}

fn insert_line(hull: &mut Vec<Line>, head: usize, line: Line) {
    // Equal prefix sums produce equal slopes.  Only the smaller intercept can
    // ever be useful; this is essential when the input contains zeroes.
    if let Some(previous) = hull.last() {
        if previous.prefix == line.prefix {
            if previous.intercept() <= line.intercept() {
                return;
            }
            hull.pop();
        }
    }

    while hull.len() >= head + 2
        && middle_is_redundant(hull[hull.len() - 2], hull[hull.len() - 1], line)
    {
        hull.pop();
    }
    hull.push(line);
}

pub fn min_squared_partition_cost(values: &[u64], groups: usize) -> u128 {
    assert!(!values.is_empty());
    assert!((1..=values.len()).contains(&groups));

    let n = values.len();
    let mut prefix = Vec::with_capacity(n + 1);
    prefix.push(0u128);
    for &value in values {
        prefix.push(prefix.last().copied().unwrap() + value as u128);
    }

    // `previous[end]` is the optimum for the first `end` values using the
    // preceding number of groups.  Only its finite suffix is read per layer.
    let mut previous = vec![u128::MAX; n + 1];
    previous[0] = 0;

    for group in 1..=groups {
        let mut current = vec![u128::MAX; n + 1];
        let mut hull = Vec::with_capacity(n - group + 2);
        let mut head = 0usize;

        for end in group..=n {
            let split = end - 1;
            if previous[split] != u128::MAX {
                insert_line(
                    &mut hull,
                    head,
                    Line {
                        prefix: prefix[split],
                        cost: previous[split],
                    },
                );
            }

            let end_prefix = prefix[end];
            while head + 1 < hull.len()
                && hull[head + 1].partition_cost(end_prefix)
                    <= hull[head].partition_cost(end_prefix)
            {
                head += 1;
            }
            current[end] = hull[head].partition_cost(end_prefix);
        }

        previous = current;
    }

    previous[n]
}

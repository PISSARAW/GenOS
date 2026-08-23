//! Partition a non-negative sequence into exactly `groups` contiguous blocks.
//!
//! The cost of a block is the square of its sum.

#[derive(Clone, Copy)]
struct Line {
    prefix: u128,
    cost: u128,
    intercept: u128,
}

impl Line {
    fn new(prefix: u128, cost: u128) -> Self {
        Self {
            prefix,
            cost,
            intercept: cost + prefix * prefix,
        }
    }

    /// The complete DP candidate at `x`, evaluated without signed arithmetic.
    fn value_at(self, x: u128) -> u128 {
        let difference = x - self.prefix;
        self.cost + difference * difference
    }
}

/// An affine lower hull whose line slopes and query positions are monotone.
///
/// A line represented by `(prefix, cost)` is
/// `cost + prefix^2 - 2 * prefix * x`.  Queries use `Line::value_at`, which
/// adds the common `x^2` term and therefore never needs a negative integer.
struct MonotoneHull {
    lines: Vec<Line>,
    first: usize,
}

impl MonotoneHull {
    fn with_capacity(capacity: usize) -> Self {
        Self {
            lines: Vec::with_capacity(capacity),
            first: 0,
        }
    }

    fn add(&mut self, line: Line) {
        // Equal prefix sums produce equal slopes.  Only the smaller intercept
        // can ever be optimal.  This is essential for runs of zero values.
        while self.lines.len() > self.first && self.lines.last().unwrap().prefix == line.prefix {
            if self.lines.last().unwrap().intercept <= line.intercept {
                return;
            }
            self.lines.pop();
        }

        while self.lines.len() >= self.first + 2 {
            let a = self.lines[self.lines.len() - 2];
            let b = self.lines[self.lines.len() - 1];

            // b is unnecessary when intersection(a, b) is not before
            // intersection(b, line).  Factors of two cancel out.
            let left = (b.intercept - a.intercept) * (line.prefix - b.prefix);
            let right = (line.intercept - b.intercept) * (b.prefix - a.prefix);
            if left < right {
                break;
            }
            self.lines.pop();
        }

        self.lines.push(line);
    }

    fn minimum(&mut self, x: u128) -> u128 {
        while self.first + 1 < self.lines.len()
            && self.lines[self.first + 1].value_at(x) <= self.lines[self.first].value_at(x)
        {
            self.first += 1;
        }
        self.lines[self.first].value_at(x)
    }
}

/// Return the minimum total squared-block-sum cost of an exact partition.
///
/// Runs in `O(values.len() * groups)` time and `O(values.len())` memory.
pub fn min_squared_partition_cost(values: &[u64], groups: usize) -> u128 {
    assert!(!values.is_empty());
    assert!((1..=values.len()).contains(&groups));

    let n = values.len();
    let mut prefix = Vec::with_capacity(n + 1);
    prefix.push(0u128);
    for &value in values {
        prefix.push(prefix.last().unwrap() + value as u128);
    }

    // For zero groups, only the empty prefix is feasible.
    let mut previous = vec![u128::MAX; n + 1];
    previous[0] = 0;

    for group in 1..=groups {
        let mut current = vec![u128::MAX; n + 1];
        let mut hull = MonotoneHull::with_capacity(n - group + 2);
        hull.add(Line::new(prefix[group - 1], previous[group - 1]));

        for end in group..=n {
            current[end] = hull.minimum(prefix[end]);

            // This split is inserted only after querying, so the final block
            // is always non-empty.
            if previous[end] != u128::MAX {
                hull.add(Line::new(prefix[end], previous[end]));
            }
        }

        previous = current;
    }

    previous[n]
}

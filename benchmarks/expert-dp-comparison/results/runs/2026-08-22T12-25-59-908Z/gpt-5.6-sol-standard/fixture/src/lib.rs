//! Partition a non-negative sequence into exactly `groups` contiguous blocks.

use std::collections::VecDeque;

#[derive(Clone, Copy)]
struct Line {
    slope: i128,
    intercept: i128,
}

impl Line {
    fn at(self, x: i128) -> i128 {
        self.slope * x + self.intercept
    }
}

/// A lower hull for lines inserted with non-increasing slopes and queried at
/// non-decreasing coordinates.
struct MonotoneHull {
    lines: VecDeque<Line>,
}

impl MonotoneHull {
    fn new() -> Self {
        Self {
            lines: VecDeque::new(),
        }
    }

    fn add(&mut self, line: Line) {
        // Equal prefix sums produce equal slopes.  Only the lower of two
        // parallel lines can ever be useful.
        if let Some(&last) = self.lines.back() {
            if last.slope == line.slope {
                if last.intercept <= line.intercept {
                    return;
                }
                self.lines.pop_back();
            }
        }

        while self.lines.len() >= 2 {
            let first = self.lines[self.lines.len() - 2];
            let second = self.lines[self.lines.len() - 1];

            // The intersection of (first, second) must lie strictly before
            // that of (second, line).  Cross multiplication keeps the test
            // exact; under the stated bounds its largest values fit in i128.
            let left = (second.intercept - first.intercept) * (second.slope - line.slope);
            let right = (line.intercept - second.intercept) * (first.slope - second.slope);
            if left < right {
                break;
            }
            self.lines.pop_back();
        }

        self.lines.push_back(line);
    }

    fn minimum_at(&mut self, x: i128) -> i128 {
        while self.lines.len() >= 2 && self.lines[0].at(x) >= self.lines[1].at(x) {
            self.lines.pop_front();
        }
        self.lines[0].at(x)
    }
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

    if groups == 1 {
        return prefix[n] * prefix[n];
    }
    if groups == n {
        return values
            .iter()
            .map(|&value| (value as u128) * (value as u128))
            .sum();
    }

    // Cost for one block, [0, end).
    let mut previous: Vec<u128> = prefix.iter().map(|&sum| sum * sum).collect();

    // dp[g][end] = prefix[end]^2 + min_split(
    //     dp[g-1][split] + prefix[split]^2
    //     - 2 * prefix[split] * prefix[end])
    // Each split is therefore a line queried at prefix[end].
    for group in 2..=groups {
        let mut current = vec![u128::MAX; n + 1];
        let mut hull = MonotoneHull::new();

        for end in group..=n {
            let split = end - 1;
            let split_prefix = i128::try_from(prefix[split])
                .expect("prefix sums exceed the supported u128 cost range");
            let split_cost = i128::try_from(previous[split])
                .expect("partition cost exceeds the supported u128 range");
            hull.add(Line {
                slope: -2 * split_prefix,
                intercept: split_cost + split_prefix * split_prefix,
            });

            let end_prefix = i128::try_from(prefix[end])
                .expect("prefix sums exceed the supported u128 cost range");
            let best = end_prefix * end_prefix + hull.minimum_at(end_prefix);
            current[end] = u128::try_from(best).expect("partition cost cannot be negative");
        }

        previous = current;
    }

    previous[n]
}

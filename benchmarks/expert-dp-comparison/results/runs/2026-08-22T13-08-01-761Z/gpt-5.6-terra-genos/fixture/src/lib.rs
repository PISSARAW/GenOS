//! Partition a non-negative sequence into exactly `groups` contiguous blocks.
//!
//! The recurrence is optimized with a discrete Li Chao tree.  For a split at
//! prefix sum `p`,
//! `dp[k - 1][j] + (x - p)^2` differs from every other candidate by an affine
//! function of `x`, so the tree can keep its lower envelope.  Its domain is
//! the (sorted, possibly repeated) prefix sums themselves.

#[derive(Clone, Copy)]
struct Candidate {
    prefix: u128,
    cost: u128,
}

impl Candidate {
    fn value_at(self, x: u128) -> u128 {
        let distance = self.prefix.abs_diff(x);
        self.cost + distance * distance
    }
}

struct LiChao<'a> {
    points: &'a [u128],
    nodes: Vec<Option<Candidate>>,
}

impl<'a> LiChao<'a> {
    fn new(points: &'a [u128]) -> Self {
        Self {
            points,
            nodes: vec![None; points.len() * 4],
        }
    }

    fn insert(&mut self, candidate: Candidate) {
        self.insert_at(1, 0, self.points.len() - 1, candidate);
    }

    fn insert_at(&mut self, node: usize, left: usize, right: usize, mut candidate: Candidate) {
        let Some(mut stored) = self.nodes[node] else {
            self.nodes[node] = Some(candidate);
            return;
        };

        let middle = (left + right) / 2;
        if candidate.value_at(self.points[middle]) < stored.value_at(self.points[middle]) {
            std::mem::swap(&mut candidate, &mut stored);
        }
        self.nodes[node] = Some(stored);

        if left == right {
            return;
        }
        if candidate.value_at(self.points[left]) < stored.value_at(self.points[left]) {
            self.insert_at(node * 2, left, middle, candidate);
        } else if candidate.value_at(self.points[right]) < stored.value_at(self.points[right]) {
            self.insert_at(node * 2 + 1, middle + 1, right, candidate);
        }
    }

    fn query(&self, index: usize) -> u128 {
        self.query_at(1, 0, self.points.len() - 1, index, u128::MAX)
    }

    fn query_at(&self, node: usize, left: usize, right: usize, index: usize, best: u128) -> u128 {
        let best = match self.nodes[node] {
            Some(candidate) => best.min(candidate.value_at(self.points[index])),
            None => best,
        };
        if left == right {
            return best;
        }

        let middle = (left + right) / 2;
        if index <= middle {
            self.query_at(node * 2, left, middle, index, best)
        } else {
            self.query_at(node * 2 + 1, middle + 1, right, index, best)
        }
    }
}

pub fn min_squared_partition_cost(values: &[u64], groups: usize) -> u128 {
    assert!(!values.is_empty());
    assert!((1..=values.len()).contains(&groups));

    let n = values.len();
    let mut prefix = Vec::with_capacity(n + 1);
    prefix.push(0);
    for &value in values {
        prefix.push(prefix.last().unwrap() + value as u128);
    }

    let mut previous = vec![u128::MAX; n + 1];
    previous[0] = 0;

    for group in 1..=groups {
        let mut current = vec![u128::MAX; n + 1];
        let mut hull = LiChao::new(&prefix);
        hull.insert(Candidate {
            prefix: prefix[group - 1],
            cost: previous[group - 1],
        });

        for end in group..=n {
            current[end] = hull.query(end);
            if end < n && previous[end] != u128::MAX {
                hull.insert(Candidate {
                    prefix: prefix[end],
                    cost: previous[end],
                });
            }
        }
        previous = current;
    }

    previous[n]
}

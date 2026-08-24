//! Partition DP: exact quadratic-layer solution with prefix sums.

pub fn min_squared_partition_cost(values: &[u64], groups: usize) -> u128 {
    assert!(!values.is_empty());
    assert!((1..=values.len()).contains(&groups));

    let n = values.len();
    let mut prefix = vec![0u128; n + 1];
    for (index, &value) in values.iter().enumerate() {
        prefix[index + 1] = prefix[index] + value as u128;
    }

    const INF: u128 = u128::MAX;
    let mut previous = vec![INF; n + 1];
    previous[0] = 0;

    for _layer in 1..=groups {
        let mut current = vec![INF; n + 1];
        for end in 1..=n {
            for split in 0..end {
                if previous[split] == INF {
                    continue;
                }
                let sum = prefix[end] - prefix[split];
                let cost = previous[split] + sum * sum;
                if cost < current[end] {
                    current[end] = cost;
                }
            }
        }
        previous = current;
    }

    previous[n]
}

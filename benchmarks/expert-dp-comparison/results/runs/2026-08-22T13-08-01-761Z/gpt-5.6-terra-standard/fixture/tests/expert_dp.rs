use expert_dp_fixture::min_squared_partition_cost;

fn oracle(values: &[u64], groups: usize) -> u128 {
    let n = values.len();
    let mut prefix = vec![0u128; n + 1];
    for (index, &value) in values.iter().enumerate() {
        prefix[index + 1] = prefix[index] + value as u128;
    }
    let mut previous = vec![u128::MAX; n + 1];
    previous[0] = 0;
    for group in 1..=groups {
        let mut current = vec![u128::MAX; n + 1];
        for end in group..=n {
            for split in (group - 1)..end {
                if previous[split] == u128::MAX { continue; }
                let sum = prefix[end] - prefix[split];
                current[end] = current[end].min(previous[split] + sum * sum);
            }
        }
        previous = current;
    }
    previous[n]
}

#[test]
fn examples_and_boundaries() {
    assert_eq!(min_squared_partition_cost(&[5], 1), 25);
    assert_eq!(min_squared_partition_cost(&[1, 2, 3, 4], 2), 52);
    assert_eq!(min_squared_partition_cost(&[1, 2, 3, 4], 4), 30);
    assert_eq!(min_squared_partition_cost(&[0, 0, 0, 0], 3), 0);
    assert_eq!(min_squared_partition_cost(&[7, 0, 0, 7], 3), 98);
}

#[test]
fn agrees_with_exact_oracle_on_dense_small_cases() {
    for seed in 0..96u64 {
        let length = 2 + (seed as usize % 10);
        let values: Vec<u64> = (0..length)
            .map(|index| (seed.wrapping_mul(17).wrapping_add(index as u64 * 13) % 8))
            .collect();
        for groups in 1..=length {
            assert_eq!(min_squared_partition_cost(&values, groups), oracle(&values, groups),
                "seed={seed}, groups={groups}, values={values:?}");
        }
    }
}

#[test]
fn handles_large_values_without_overflow() {
    let values = vec![1_000_000; 40];
    assert_eq!(min_squared_partition_cost(&values, 7), oracle(&values, 7));
}

#[test]
fn large_instance_requires_optimized_dp() {
    let values: Vec<u64> = (0..80_000).map(|index| ((index * 37) % 31) as u64).collect();
    let result = min_squared_partition_cost(&values, 80);
    assert!(result > 0);
    assert!(result < u128::MAX);
}

//! Partition a non-negative sequence into exactly `groups` contiguous blocks.
//!
//! The cost of a block is the square of its sum.  This placeholder is correct
//! only for the trivial one-block case and must be replaced by an algorithm
//! that meets the contract in `TASK.md`.

pub fn min_squared_partition_cost(values: &[u64], groups: usize) -> u128 {
    assert!(!values.is_empty());
    assert!((1..=values.len()).contains(&groups));

    if groups == 1 {
        let sum: u128 = values.iter().map(|&value| value as u128).sum();
        return sum * sum;
    }

    u128::MAX
}

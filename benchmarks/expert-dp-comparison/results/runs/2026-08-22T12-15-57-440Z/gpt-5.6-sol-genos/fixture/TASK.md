# Expert dynamic-programming task

Implement `min_squared_partition_cost` in `src/lib.rs`.

Given `n` non-negative `u64` values and `1 <= groups <= n`, split the sequence
into exactly `groups` **non-empty contiguous** blocks.  The cost of a block is
the square of the sum of its values. Return the minimum total cost as `u128`.

## Constraints

- `n` can be 80,000 and `groups` can be 80.
- Values can be up to 1,000,000; intermediate arithmetic must not overflow.
- The supplied large test is a correctness *and* asymptotic test: quadratic
  work per DP layer is not acceptable.
- Do not add dependencies and do not change the public signature.
- Modify only `src/lib.rs`.

The tests include a small exact oracle and adversarial cases with repeated
prefix sums. A suitable solution derives the partition DP recurrence and uses
a data structure/optimization for its affine minimum queries.

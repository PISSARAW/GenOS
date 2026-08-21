# GenOS Comprehensive Testing Strategy

This document outlines the multi-tiered verification architecture of GenOS, designed to guarantee absolute reproducibility, strict worktree isolation, deterministic replayability, and mathematical correctness across counterfactual simulations.

---

## 1. Testing Pyramid Overview

```text
               / \
              /   \      Adversarial & Chaos Benchmarks (fault injection, fuzzing)
             / ----\
            /       \     Causal Replay & Counterfactual Branching Tests
           / --------\
          /           \    Deterministic Event Replay & State Hash Verification
         / ------------\
        /               \   Git Worktree & Process Isolation Proofs
       / ----------------\
      /                   \  Property-Based Invariant Tests (proptest)
     / --------------------\
    /                       \ Co-located Unit & Integration Tests (cargo test)
   +-------------------------+
```

---

## 2. Tier 1: Co-located Unit & Integration Testing

Every module contains co-located unit tests (`#[cfg(test)] mod tests`) or sibling integration test suites in `tests/`.

### Key Principles
- **Behavior-Driven Assertions**: Test observable domain outcomes and state transitions rather than private implementation details.
- **Deterministic Clocks**: Mock time providers (`MockClock`) instead of relying on `SystemTime::now()` or real sleep timers.
- **Hermetic Mocks**: Stub all external network calls and LLM provider endpoints with deterministic fixtures.

```bash
# Execute workspace unit tests
cargo test --workspace

# Execute a single crate test suite with stdout output
cargo test -p genos-core -- --nocapture
```

---

## 3. Tier 2: Property-Based Invariant Testing (`proptest`)

Property-based testing validates that core algebraic invariants hold over millions of pseudo-randomly generated states.

### Key Algebraic Invariants

1. **Snapshot Serialization Bijectivity**:
   $$\forall S \in \text{Snapshot}, \quad \text{deserialize}(\text{serialize}(S)) \equiv S$$

2. **Content Addressable Storage (CAS) Identity**:
   $$\forall A, B \in \text{Blobs}, \quad A = B \iff \text{Hash}(A) = \text{Hash}(B)$$

3. **Lineage DAG Acyclicity**:
   No sequence of fork or merge operations can create a cycle in the capsule lineage graph.

### Example Property Test
```rust
use proptest::prelude::*;
use genos_core::{AgentGenome, TraitMap};

proptest! {
    #[test]
    fn genome_serialization_roundtrip(genome in any::<AgentGenome>()) {
        let serialized = serde_json::to_string(&genome).expect("Serialization must succeed");
        let deserialized: AgentGenome = serde_json::from_str(&serialized)
            .expect("Deserialization must succeed");
        prop_assert_eq!(genome, deserialized);
    }

    #[test]
    fn cas_hash_collision_resistance(data_a in any::<Vec<u8>>(), data_b in any::<Vec<u8>>()) {
        let hash_a = genos_store::hash_blob(&data_a);
        let hash_b = genos_store::hash_blob(&data_b);
        if data_a != data_b {
            prop_assert_ne!(hash_a, hash_b);
        } else {
            prop_assert_eq!(hash_a, hash_b);
        }
    }
}
```

---

## 4. Tier 3: Git Worktree & World Isolation Proofs

GenOS capsules execute within isolated filesystem workspaces managed via Git worktrees. Isolation test suites formally verify non-interference between concurrent branches.

### Formal Isolation Test Protocol
1. **Root State ($W_0$)**: Seed initial repository containing file `anchor.txt` ($C_0$).
2. **Branching ($W_1, W_2$)**: Provision two isolated worktrees concurrently from $W_0$.
3. **Concurrent Mutation**:
   - In $W_1$, modify `anchor.txt` to $C_1$, create `module_a.rs`, and delete `stale.txt`.
   - In $W_2$, append content $C_2$ to `anchor.txt` and create `module_b.rs`.
4. **Verification Assertions**:
   - $W_0$ remains strictly identical to $C_0$.
   - $W_1$ contains only its own modifications with zero leakage into $W_0$ or $W_2$.
   - $W_2$ contains only its own modifications with zero cross-contamination.
   - Deleting or crashing $W_1$ leaves $W_0$ and $W_2$ fully uncorrupted.

```bash
cargo test -p genos-world --test worktree_isolation_proofs
```

---

## 5. Tier 4: Deterministic Replay Tests

The event-sourcing runtime records all cognitive state transitions into an append-only event log. Replaying an identical event sequence must produce the exact bit-for-bit state hash.

```rust
#[tokio::test]
async fn replay_reproduces_exact_state_hash() {
    let mut runtime = TestRuntime::new();
    let events = runtime.record_multi_step_trajectory(50).await;

    let original_state = runtime.current_state();
    let replayed_state = runtime.replay_from_events(&events)
        .await
        .expect("Replay must succeed without divergence");

    assert_eq!(
        original_state.state_hash(),
        replayed_state.state_hash(),
        "State hash must match bit-for-bit across replay runs"
    );
}
```

---

## 6. Tier 5: Causal Replay & Counterfactual Tests

Causal replay evaluates how specific perturbations or alternative decisions alter downstream execution trajectories.

### Verification Flow
1. Record a baseline trajectory $T = [e_1, e_2, \dots, e_n]$.
2. Identify a decision point $e_k$ ($1 \le k < n$).
3. Inject a counterfactual event $e'_k \ne e_k$.
4. Replay downstream execution $T'$ from $k$ to $n$.
5. Verify causal divergence metrics:
   - Lineage graph records a fork node at sequence $k$.
   - Divergent state hashes are registered for all steps $> k$.
   - Common ancestor states $\le k$ remain invariant.

```rust
#[tokio::test]
async fn causal_perturbation_divergence_check() {
    let harness = CausalTestHarness::new();
    let baseline = harness.record_baseline_events(30).await;

    let counterfactual_event = harness.create_alternative_decision(15);
    let branch = harness.fork_and_perturb(&baseline, 15, counterfactual_event).await;

    assert_eq!(branch.ancestor_hash(14), baseline.state_hash(14));
    assert_ne!(branch.current_state_hash(), baseline.current_state_hash());
}
```

---

## 7. Tier 6: Adversarial Benchmarks & Chaos Testing

Adversarial testing guarantees resilience under system stress, data corruption, and resource starvation.

### Fuzz Testing (`cargo-fuzz`)
Continuous fuzzing tests protocol parsers, AST deserializers, and genome mutation engines:
```bash
# Run protocol packet deserialization fuzzer
cargo fuzz run fuzz_protocol_deserialize -- -max_total_time=300
```

### Chaos Fault Injection
The chaos harness injects simulated system faults:
- **Disk I/O Latency & Failures**: Intermittent write failures to the CAS backend during snapshot creation.
- **Process Termination (SIGKILL)**: Abrupt termination of agent processes during live worktree operations to verify lock recovery.
- **Memory Pressure**: Restricting worker cgroup memory to verify graceful circuit breaker tripping and apoptosis triggers.

```rust
#[tokio::test]
async fn resilience_under_cas_write_failure() {
    let mut store = ChaosStore::new(StoreConfig::default());
    store.inject_fault(FaultType::WriteTimeout, 3);

    let result = store.write_snapshot_with_retry(vec![1, 2, 3]).await;
    assert!(result.is_ok(), "Store must recover and succeed after retry");
}
```

---

## 8. Continuous Integration & Quality Gates

Every code change must pass all tiers prior to merging:

| Gate | Scope | Command | SLA |
|---|---|---|---|
| **Tier 1** | Unit & Integration | `cargo test --workspace` | $< 2$ min |
| **Tier 2** | Property Tests | `cargo test --workspace -- --ignored proptest` | $< 5$ min |
| **Tier 3** | Worktree Isolation | `cargo test -p genos-world --test worktree` | $< 3$ min |
| **Tier 4** | Replay Determinism | `cargo test -p genos-runtime --test replay` | $< 4$ min |
| **Tier 5** | Causal Replay | `cargo test -p genos-eval --test causal` | $< 5$ min |
| **Tier 6** | Fuzz & Benchmarks | `cargo bench --no-run` | $< 3$ min |

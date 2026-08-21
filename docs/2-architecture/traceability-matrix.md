# GenOS Architecture & Domain Traceability Matrix

This document establishes the end-to-end traceability between system requirements, domain invariants, Architectural Decision Records (ADRs 0001–0021), Rust crate implementations, and validation test suites across the GenOS platform.

---

## 1. Complete ADR Traceability Matrix (ADR-0001 through ADR-0021)

| ADR ID & Title | Problem Statement | Architectural Solution & Decision | Crates & Modules | Core Types & Invariants | Validation Test Suite |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **ADR-0001**<br>Genome-State Separation | Conflating agent identity with mutable runtime thoughts causes unpredictable mutation drift and breaks replayability. | Strict mathematical separation: immutable genotype $\mathcal{G}$ defining traits vs ephemeral state $\mathcal{S}$ capturing thoughts. | `genos-core`<br>`crates/genos-core/src/genome.rs`<br>`crates/genos-core/src/state.rs` | `AgentGenome`<br>`AgentState`<br>`INV-001` (Genome Immutability) | `crates/genos-core/src/snapshot/tests.rs`<br>`crates/genos-core/src/snapshot_checkpoint_tests.rs` |
| **ADR-0002**<br>Event Sourcing for Truth | In-place state overwrites destroy historical causal provenance and make auditability impossible. | Adopt append-only event sourcing where $\mathcal{S}_t = \text{foldl}(\text{apply}, \mathcal{S}_0, [E_1..E_t])$ with monotonically increasing sequence IDs. | `genos-core`, `genos-store`<br>`crates/genos-core/src/events.rs`<br>`crates/genos-store/src/event.rs` | `AgentEvent`<br>`LocalEventStore`<br>`INV-002` (Monotonic Sequence) | `crates/genos-store/tests/store_tests.rs`<br>`crates/genos-store/tests/replay_tests.rs` |
| **ADR-0003**<br>World Separation | Coupling agent reasoning directly to the host OS creates side-effect pollution and security risks. | Abstract external execution environment into sandboxed `WorldProvider` supporting path validation and isolation. | `genos-world`<br>`crates/genos-world/src/lib.rs`<br>`crates/genos-world/src/utils.rs` | `WorldProvider`<br>`DirectoryWorldProvider`<br>`INV-003` (Path Containment) | `crates/genos-world/tests/directory.rs`<br>`crates/genos-world/tests/path_safety.rs` |
| **ADR-0004**<br>Fork Isolation Semantics | Parallel exploratory hypotheses collide when sharing mutable filesystem or memory spaces. | Implement instantaneous copy-on-write Git worktree sandboxing ensuring zero cross-branch leakage. | `genos-core`, `genos-world`<br>`crates/genos-world/src/git.rs`<br>`crates/genos-core/src/causality.rs` | `GitWorktreeWorldProvider`<br>`CausalBoundary`<br>`INV-004` (Non-Interference) | `crates/genos-world/tests/file_isolation.rs`<br>`crates/genos-world/tests/git_worktree.rs` |
| **ADR-0005**<br>State vs Execution Replay | Re-executing LLM prompts during replay introduces non-determinism, latency, and monetary cost. | Separate pure deterministic state replay (re-folding event log) from active execution replay (re-invoking tools). | `genos-store`, `genos-runtime`<br>`crates/genos-store/src/replay.rs`<br>`crates/genos-runtime/src/causal_replay/` | `ReplayEngine`<br>`CausalReplay`<br>`INV-006` (Deterministic Replay) | `crates/genos-store/tests/replay_tests.rs`<br>`crates/genos-runtime/tests/temporal_causal_simulation.rs` |
| **ADR-0006**<br>Provider Neutrality | Tying cognitive agent schemas to proprietary LLM formats causes vendor lock-in. | Provide a provider-agnostic `ModelPolicy` abstraction that normalizes prompt formatting, tool calling, and token limits. | `genos-model`, `genos-core`<br>`crates/genos-model/src/`<br>`crates/genos-core/src/genome.rs` | `ModelPolicy`<br>`ModelProvider`<br>`INV-004` (Provider Independence) | `crates/genos-core/src/genome.rs`<br>`crates/genos-runtime/tests/agent_genome_lifecycle.rs` |
| **ADR-0007**<br>Cognitive Merge Deferred | Naive line-based text merges corrupt cognitive belief graphs and working memory structures. | Defer unvalidated state merging in V0; require explicit typed knowledge synthesis manifests. | `genos-runtime`, `genos-eval`<br>`crates/genos-runtime/src/cognitive_merge/`<br>`crates/genos-eval/src/cognitive_merge.rs` | `CognitiveMergeEngine`<br>`MergeManifest`<br>`INV-007` (Lineage DAG) | `crates/genos-eval/src/tests.rs`<br>`crates/genos-runtime/src/cognitive_merge/tests.rs` |
| **ADR-0008**<br>Genotype, Phenotype, State | Declared agent parameters often diverge from actual observed runtime behaviors under real models. | Formally distinguish genotype $\mathcal{G}$, empirical phenotype $\mathcal{P}$, and dynamic state $\mathcal{S}$ with quantitative drift metrics. | `genos-core`, `genos-eval`<br>`crates/genos-core/src/phenotype.rs`<br>`crates/genos-eval/src/qtl.rs` | `PhenotypeObservation`<br>`TraitDivergence`<br>`INV-008` (Mutation Provenance) | `crates/genos-eval/src/tests.rs`<br>`crates/genos-core/src/divergence.rs` |
| **ADR-0009**<br>Heredity Experiments | Inability to distinguish whether agent performance stems from genomic priors or environment prompts. | Execute controlled $2 \times 2$ factorial cohort experiments isolating genomic main effects from environmental interactions. | `genos-eval`, `genos-runtime`<br>`crates/genos-eval/src/ecosystem.rs`<br>`crates/genos-runtime/src/experiment.rs` | `run_heredity_experiment`<br>`SiblingCohort`<br>`INV-001` (Genome Immutability) | `crates/genos-eval/src/tests.rs`<br>`crates/genos-runtime/tests/scientific_research.rs` |
| **ADR-0010**<br>Artificial Selection | Greedy selection discards valuable specialized agents in multi-objective tasks. | Maintain diverse agent populations across Pareto fitness frontiers balancing accuracy, cost, and latency. | `genos-eval`, `genos-runtime`<br>`crates/genos-eval/src/pareto.rs`<br>`crates/genos-eval/src/population.rs` | `ParetoFrontier`<br>`PopulationManager`<br>`INV-001` (Genomic Invariance) | `crates/genos-eval/src/tests.rs`<br>`crates/genos-runtime/tests/speciation_thresholds.rs` |
| **ADR-0011**<br>Evidence-Based Breeding | Uncontrolled crossover creates non-viable franken-agents with invalid drive configurations. | Perform biological recombination constrained by measured phenotypic fitness evidence and chromosomal locus rules. | `genos-runtime`, `genos-core`<br>`crates/genos-runtime/src/evolution/`<br>`crates/genos-core/src/epigenetics.rs` | `breed_genomes`<br>`RecombinationStrategy`<br>`INV-008` (Lineage Auditability) | `crates/genos-runtime/src/evolution/breeding_tests.rs`<br>`crates/genos-runtime/src/evolution/recombination_tests.rs` |
| **ADR-0012**<br>Inferred Genomic Traits | Ad-hoc promotion of observed behaviors contaminates validated baseline genotypes. | Store empirical trait discoveries as `InferredGenomeTraitClaim` records requiring replication thresholds before promotion. | `genos-core`, `genos-cli`<br>`crates/genos-core/src/phenotype.rs`<br>`crates/genos-cli/src/output/divergence.rs` | `InferredGenomeTraitClaim`<br>`promote_inferred_trait`<br>`INV-001` (Genome Promotion Gate) | `crates/genos-core/src/phenotype.rs`<br>`crates/genos-cli/src/cmd_agent.rs` |
| **ADR-0013**<br>Functional Reproducibility | Stochastic LLM outputs cause flaky benchmarks and unrepeatable test evaluations. | Define functional reproducibility gates via paired execution, trajectory similarity scoring, and variance bounds. | `genos-eval`, `genos-runtime`<br>`crates/genos-eval/src/reproducibility.rs`<br>`crates/genos-runtime/src/reproducibility.rs` | `assert_reproducibility`<br>`VarianceMetric`<br>`INV-006` (Reproducibility Bounds) | `crates/genos-eval/src/tests.rs`<br>`crates/genos-runtime/tests/calculator_experiment.rs` |
| **ADR-0014**<br>Counterfactual OS Execution | Agents get stuck down dead-end reasoning paths with no mechanism to explore counterfactual alternatives. | Execute parallel counterfactual branches as isolated sub-agents guided by Process Reward Models and MCTS. | `genos-eval`, `genos-runtime`<br>`crates/genos-eval/src/mcts.rs`<br>`crates/genos-eval/src/prm.rs` | `MctsSearchTree`<br>`ProcessRewardModel`<br>`INV-004` (Branch Isolation) | `crates/genos-eval/src/tests.rs`<br>`crates/genos-runtime/tests/adaptive_incident_search.rs` |
| **ADR-0015**<br>Agent-World Capsules | Disjoint storage of agent thoughts, world files, and event logs leads to state desynchronization. | Unify agent snapshot, world snapshot ID, event stream, and resource budgets into a sealed `AgentWorldCapsule`. | `genos-core`, `genos-store`<br>`crates/genos-core/src/capsule.rs`<br>`crates/genos-store/src/capsule.rs` | `AgentWorldCapsule`<br>`LocalCapsuleStore`<br>`INV-003` (Capsule Integrity) | `crates/genos-core/src/snapshot_checkpoint_tests.rs`<br>`crates/genos-runtime/src/capsules/tests.rs` |
| **ADR-0016**<br>Cognitive Merge Engine | Blindly merging file diffs misses semantic contradictions in agent working memories and beliefs. | Implement a 3-way cognitive merge engine that resolves belief graph conflicts and synthesizes validated experiences. | `genos-runtime`, `genos-eval`<br>`crates/genos-runtime/src/cognitive_merge/`<br>`crates/genos-core/src/beliefs/` | `reconcile_beliefs`<br>`merge_working_memories`<br>`INV-007` (Lineage Merge Integrity) | `crates/genos-runtime/src/cognitive_merge/tests.rs`<br>`crates/genos-core/src/beliefs/contradiction_tests.rs` |
| **ADR-0017**<br>Budgeted Branch Evolution | Speculative multi-branch exploration risks unbounded resource and API cost consumption. | Enforce strictly budgeted branch evolution with score-weighted resource allocation and pruning of low-scoring branches. | `genos-runtime`<br>`crates/genos-runtime/src/branch_evolution/`<br>`crates/genos-core/src/capsule.rs` | `BudgetedEvolution`<br>`CapsuleBudget`<br>`INV-005` (Monotonic Budget Decrement) | `crates/genos-runtime/src/branch_evolution/tests.rs`<br>`crates/genos-runtime/tests/extreme_refactor_experiment.rs` |
| **ADR-0018**<br>Personal Causal Replay | Debugging complex agent failures requires isolating which specific decision triggered the fault. | Implement causal checkpoint replay allowing counterfactual decision intervention and side-by-side trajectory comparison. | `genos-runtime`, `genos-core`<br>`crates/genos-runtime/src/causal_replay/`<br>`crates/genos-core/src/causality.rs` | `CausalReplayEngine`<br>`CausalBoundary`<br>`INV-009` (Causal Taint Tracking) | `crates/genos-runtime/src/causal_replay/tests.rs`<br>`crates/genos-core/src/causality.rs` |
| **ADR-0019**<br>Agent Genome Cycle | Lack of unified orchestration connecting genome mutation, counterfactual branches, and synthesis. | Implement the complete $S_0 \to \text{Forks} \to \text{Experiences} \to \text{Merge} \to S_1$ lifecycle kernel. | `genos-core`, `genos-runtime`<br>`crates/genos-runtime/src/genome_os/`<br>`crates/genos-core/src/resilience/` | `GenomeOS`<br>`ApoptosisTrigger`<br>`INV-001` (Continuous Genome Cycle) | `crates/genos-runtime/src/genome_os/tests.rs`<br>`crates/genos-runtime/tests/agent_genome_lifecycle.rs` |
| **ADR-0020**<br>Canonical Agent Primitives | Inconsistent command-line and API interfaces create fragmentation across tooling. | Standardize the 10 atomic canonical primitives (`init`, `snapshot`, `restore`, `fork`, `mutate`, `run`, `diff`, `merge`, `lineage`, `replay`). | `genos-cli`, `genos-runtime`<br>`crates/genos-cli/src/cmd_agent.rs`<br>`crates/genos-runtime/src/agent_primitives.rs` | `agent_primitives::*`<br>`cmd_agent_*`<br>`INV-001`..`INV-010` | `crates/genos-runtime/tests/workspace_primitive_trace.rs`<br>`crates/genos-cli/src/main.rs` |
| **ADR-0021**<br>Protocol Interoperability | External tools and IDEs (MCP, Codex, Claude Code) cannot natively discover GenOS capabilities. | Expose universal JSON-RPC 2.0 and MCP interfaces with auto-generated schema validation and transport adapters. | `genos-protocol`, `genos-api`<br>`crates/genos-protocol/src/`<br>`crates/genos-api/src/lib.rs` | `ToolSpec`<br>`plan_tool_call`<br>`INV-004` (Protocol Neutrality) | `crates/genos-protocol/tests/protocol_tests.rs`<br>`crates/genos-protocol/src/schema.rs` |

---

## 2. Core Domain Invariants Matrix

```text
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                               GenOS Domain Invariants Engine                             │
├─────────┬──────────────────────────────────┬─────────────────────────────┬───────────────┤
│ Inv ID  │ Formal Invariant Definition      │ Enforcement Point           │ Crate Origin  │
├─────────┼──────────────────────────────────┼─────────────────────────────┼───────────────┤
│ INV-001 │ Immutability of AgentGenome      │ Rust Type System / CAS Hash │ genos-core    │
│ INV-002 │ Monotonic Event Sequence Numbers │ LocalEventStore::append     │ genos-store   │
│ INV-003 │ World Path Containment           │ resolve_world_relative_path │ genos-world   │
│ INV-004 │ Non-Interference of Forked State │ GitWorktree CoW Isolation   │ genos-world   │
│ INV-005 │ Budget Decrement Monotonicity    │ AgentRuntime::step Loop     │ genos-runtime │
│ INV-006 │ Deterministic Replay Identity    │ Pure Fold over Event Stream │ genos-store   │
│ INV-007 │ Directed Acyclic Lineage Graph   │ SnapshotId Parent Chaining  │ genos-core    │
│ INV-008 │ Explicit Mutation Lineage        │ mutate_cognition Provenance │ genos-core    │
│ INV-009 │ Safest Revert Taint Propagation  │ ActionDependencyGraph (DAG) │ genos-core    │
│ INV-010 │ Circuit Breaker Non-Bypass       │ CognitiveLoop CircuitBreaker│ genos-core    │
└─────────┴──────────────────────────────────┴─────────────────────────────┴───────────────┘
```

### Invariant Validation Rules:
1. **INV-001 (Genome Immutability)**: Once a genome is registered and assigned a `GenomeId`, its chromosomes and loci cannot be modified in place. Any update generates a child genome with an incremented version and parent link.
2. **INV-002 (Event Monotonicity)**: For any `(agent_id, branch_id)`, the event sequence must satisfy $seq(E_{k+1}) = seq(E_k) + 1$. Out-of-order writes or sequence gaps are rejected by `LocalEventStore`.
3. **INV-003 (Path Safety)**: Every filesystem operation within a world substrate must resolve strictly within the designated sandbox root. Traversal attacks (`..`, symlink escapes) trigger immediate `WorldError::InvalidWorldPath`.
4. **INV-004 (Branch Non-Interference)**: Parallel branches $B_A$ and $B_B$ operate in isolated Git worktrees. File mutations in $B_A$ have zero observable side-effects on $B_B$.
5. **INV-005 (Monotonic Budget Decrement)**: Every runtime execution step decrements `steps_remaining` by 1. When budget reaches 0, execution halts with `BudgetExhausted`.
6. **INV-006 (Deterministic Replay State)**: Folding the recorded event sequence over $\mathcal{S}_0$ yields an identical bitwise `AgentState` across any host platform without invoking external LLMs.
7. **INV-007 (DAG Acyclicity)**: Lineage links form a strict Directed Acyclic Graph: $\forall \sigma, \sigma \notin \text{Descendants}(\sigma)$.
8. **INV-008 (Mutation Provenance)**: Every mutation records timestamp, author, justification, and explicit delta vectors.
9. **INV-009 (Taint Propagation)**: Rollback analysis traces read-write dependencies backwards through the action DAG, transitively tainting all causally affected entities.
10. **INV-010 (Loop Circuit Breakers)**: Real-time monitoring halts execution upon 3 identical consecutive tool signatures, 5 stagnant state iterations, or semantic thought similarity $\ge 0.95$.

---

## 3. Formal Verification Proofs & Attestation Strategies

```text
               ┌────────────────────────────────────────────────────────┐
               │             GenOS Formal Attestation Suite             │
               └───────────────────────────┬────────────────────────────┘
                                           │
                 ┌─────────────────────────┼─────────────────────────┐
                 ▼                         ▼                         ▼
        ┌──────────────────┐      ┌──────────────────┐      ┌──────────────────┐
        │ Property-Based   │      │ Cryptographic    │      │ Invariant        │
        │ Tests (proptest) │      │ Merkle Proofs    │      │ Assertion Gates  │
        │ - DAG Acyclicity │      │ - CAS Integrity  │      │ - Path Escape    │
        │ - Replay Fold    │      │ - Event Chaining │      │ - Budget Bounds  │
        └──────────────────┘      └──────────────────┘      └──────────────────┘
```

1. **Replay Invariant Proof**:
   $$\forall \mathcal{S}_0, \mathcal{H}, \quad \text{replay}(\mathcal{S}_0, \mathcal{H}) \equiv \text{foldl}(\text{apply}, \mathcal{S}_0, \mathcal{H})$$
   Verified in `crates/genos-store/tests/replay_tests.rs` with randomized permutations.

2. **Path Containment Proof**:
   $$\forall p \in \text{Paths}, \quad \text{resolve\_world\_relative\_path}(\text{root}, p) \subseteq \text{root}$$
   Enforced in `crates/genos-world/src/utils.rs` and validated in `crates/genos-world/tests/path_safety.rs`.

3. **Causal Non-Interference Proof**:
   $$\mathcal{W}_A \cap \mathcal{W}_B = \emptyset \implies \frac{\partial \mathcal{S}_A}{\partial \mathcal{W}_B} = 0 \quad \text{and} \quad I(\mathcal{W}_A; \mathcal{W}_B \mid \mathcal{W}_0) = 0$$
   Verified in `crates/genos-world/tests/file_isolation.rs` across concurrent multi-threaded execution workers.

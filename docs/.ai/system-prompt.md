# GenOS AI Agent System Directive & Operational Guardrails

Welcome, AI Agent. When operating within the GenOS codebase, you are acting as an autonomous engineering node within a counterfactual, biologically-inspired operating system. You must adhere to the following mandatory engineering protocols, architectural axioms, and coding rules.

---

## 1. System Identity & The Core Triad Axiom

GenOS models autonomous AI agents through the principles of evolutionary biology, event sourcing, and counterfactual branch execution. Every agent instance is governed by the state equation:

$$\text{Agent} = \text{Genome}(\mathcal{G}) + \text{State}(\mathcal{S}) + \text{World}(\mathcal{W}) + \text{Event History}(\mathcal{H})$$

- **Genome ($\mathcal{G}$)**: Immutable, declarative, and versioned specification of traits, chromosomal loci, prompt templates, tool permissions, and cognitive drive priors.
- **State ($\mathcal{S}$)**: Ephemeral working memory, active belief graphs, goal stacks, and checkpointed state vectors.
- **World ($\mathcal{W}$)**: Isolated filesystem capsule, Git worktree sandbox, compiler toolchains, and external environment boundaries.
- **Event History ($\mathcal{H}$)**: Immutable, append-only, monotonically sequenced audit log of sensory perceptions, tool executions, and state transitions.

**Cardinal Rule**: Never mutate shared state directly in-place. All exploratory hypotheses and workspace modifications must execute inside isolated capsules or dedicated Git worktrees.

---

## 2. Mandatory Coding Constraints (GenOS Rule Triad)

Every line of code written or modified in GenOS must strictly enforce the 3 GenOS Coding Rules:

### Rule 1: File Length Ceiling ($\le 400$ Lines)
- No source code file (`.rs`, `.py`, `.ts`) or documentation file (`.md`) may exceed **400 lines**.
- When logic expands beyond this threshold, decompose into modular sub-modules (e.g., `cmd_dev/analysis.rs`, `cmd_dev/diagnostics.rs`) or cohesive sub-packages.
- Monolithic structures, mega-files, and bloated test suites must be partitioned immediately.

### Rule 2: Maximum 3 Function Parameters ($\le 3$)
- No function or method signature may accept more than **3 parameters**.
- Group related parameters, options, and contextual dependencies into dedicated configuration structs:
  ```rust
  // Prohibited: fn spawn_node(id: String, host: String, port: u16, timeout: u64, is_leader: bool)
  // Compliant:
  pub struct NodeConfig {
      pub host: String,
      pub port: u16,
      pub timeout: u64,
      pub is_leader: bool,
  }
  pub fn spawn_node(id: String, config: NodeConfig) -> Result<Node, NodeError>;
  ```
- Use `&Config`, `&Context`, or builder patterns to bundle operational arguments.

### Rule 3: Low Cyclomatic Complexity & Shallow Depth
- Avoid deep nesting (maximum nesting level $\le 3$).
- Enforce early returns, guard clauses, and pure functional combinators (`map`, `and_then`, `filter`).
- Extract complex inner loop bodies or multi-branch matches into dedicated, testable helper functions.

---

## 3. Tool Calling & Model Context Protocol (MCP) Standards

GenOS exposes capabilities to AI agents through standardized Model Context Protocol (MCP) tool interfaces under the `genos_*` namespace.

### 3.1 Tool Invocation Protocols
- **Schema Validation**: Inspect MCP tool schemas (`<toolName>.json`) before formulating invocations. Ensure all arguments strictly adhere to declared types.
- **Lazy Loading**: Utilize lazy tool resolution when invoking specialized domain tools to conserve context window tokens.
- **Idempotence & State Safety**: Prefer read-only inspection tools (`genos_inspect`, `genos_diff`, `genos_lineage`) before issuing destructive or state-mutating actions.
- **Defensive Error Handling**: Always catch and handle tool errors gracefully. Never let an unexpected tool error trigger cascading agent panics.

### 3.2 Standard Tool Matrix
| Tool Name | Domain / Function | Operational Guardrail |
| :--- | :--- | :--- |
| `genos_create` / `genos_fork` | Capsule & Branch Creation | Ensure unique branch IDs and clean worktree isolation. |
| `genos_snapshot` / `genos_restore` | State Vitrification & Replay | Checkpoint SHA-256 CAS hash before dangerous transitions. |
| `genos_run` / `genos_replay` | Execution & Causal Playback | Enforce budget bounds and deterministic event folding. |
| `genos_merge` | 3-Way Cognitive Merge | Mediate belief graph contradictions without data loss. |
| `genos_resilience_*` | Biological Resilience Hooks | Invoke apoptosis, cryptobiosis, or hypermutation on threshold trips. |
| `genos_biomimicry_*` | Swarm Coordination | Respect BFT quorum thresholds ($f < n/3$) and silence policies. |

---

## 4. Causal Replay & Counterfactual Verification

GenOS is architected around deterministic event-sourcing and counterfactual causality.

### 4.1 Event-Sourcing State Invariant
State reconstruction must always satisfy pure event folding:

$$\mathcal{S}_t = \text{foldl}(\text{apply}, \mathcal{S}_0, [E_1, E_2, \dots, E_t])$$

- Do not introduce non-deterministic host dependencies (e.g., unseeded PRNGs, raw wall-clock time) into state transition functions.
- Replaying identical event streams over $\mathcal{S}_0$ must produce 100% bitwise-identical state.

### 4.2 Counterfactual Branch Isolation
- When evaluating competing hypotheses, spawn isolated child branches via Git worktrees.
- Changes in branch $B_A$ must produce strictly zero filesystem or memory leakage in sibling branch $B_B$ ($\Delta W_A \cap W_B = \emptyset$).
- Use Causal Replay Experiments (`genos_causal_replay_experiment`) to isolate root causes by counterfactually altering historic decisions.

---

## 5. Resilience & Biomimicry Integration

Agents must actively integrate GenOS biological resilience protocols to survive hostile or failing execution conditions:

```
                  +-----------------------------------+
                  |      AGENT HEALTH MONITORING      |
                  +-----------------------------------+
                   /                 |               \
        [Fatal Divergence]    [429 / Depletion]   [Stagnation / Deadlock]
                 /                   |                 \
                v                    v                  v
        +---------------+   +------------------+   +-------------------+
        |   APOPTOSIS   |   |   CRYPTOBIOSIS   |   |  HYPERMUTATION    |
        | Programmed    |   | State Vitrify    |   | Temperature Boost |
        | Suicide & DLQ |   | (.spore Archive) |   | Hypotheses Search |
        +---------------+   +------------------+   +-------------------+
```

### 5.1 Apoptosis (Programmed Termination)
- **Triggers**: Semantic divergence $D_{sem} > \theta_{div}$, 3 consecutive identical failing tool loops, or unrecoverable invariant violations.
- **Protocol**: Immediately halt tool dispatch, perform apoptotic blebbing (distill forensic evidence into post-mortem summary), release file locks, and log to Dead Letter Queue (DLQ).

### 5.2 Cryptobiosis (Metabolic Vitrification)
- **Triggers**: Rate-limiting backpressure (HTTP 429), token budget depletion, downstream API outages, or host network partitions.
- **Protocol**: Dehydrate active working memory and causal graphs into a compressed `.spore` archive; completely release RAM and execution locks; await favorable environmental thaw.

### 5.3 Somatic Hypermutation (Stress-Induced Search)
- **Triggers**: Reasoning deadlocks, stagnant progress metrics ($\Pi(t) < 0.1$), or repeated compiler check failures.
- **Protocol**: Dynamically boost exploration temperature $\tau(t) = \min(\tau_{max}, \tau_0(1 + \alpha S(t)))$, widen nucleus sampling $p(t)$, and explore orthogonal refactoring hypotheses in sandboxed clones.

### 5.4 Swarm Quorum Sensing & Silence Policy
- Quorum networks enforce Byzantine Fault Tolerance: tolerates up to $f < n/3$ faulty or hallucinating agents.
- Commit quorum requires $2f + 1$ distinct cryptographic attestations.
- Enforce **Network Silence**: Never broadcast conversational filler or redundant acknowledgments. Only broadcast autoinducers when evidence concentration crosses threshold $C(h, t) \ge \Theta_{quorum}$.


### 5.5 Morphogenesis & Evolution (Structural Integrity & Adaptation)
- **Embryogenesis & Hox Genes**: When spawning a new agent architecture, always advance it through strict developmental phases (iomimicry_embryo_phase_advance) and verify its structural colinearity (iomimicry_hox_verify) before exposing it to the World. Never boot complex agents atomically.
- **Bet-Hedging**: If the environment exhibits high entropy (e.g., unpredictable API failures, ambiguous user prompts), use iomimicry_bet_hedge_allocate to diversify your fork budget. Do not allocate 100% of forks to a single hypothesis; maintain insurance branches.
- **Speciation**: Before merging two divergent branches (e.g., after prolonged counterfactual exploration), use iomimicry_speciation_check. If they cross the speciation threshold, abort the merge to prevent cognitive corruption.
- **Canalization**: Before promoting an experimental phenotype to production, use iomimicry_canalization_evaluate to verify that it remains robust (canalized) despite noise or prompt perturbations.

---

## 6. Operational Quality & Integrity Mandates

1. **Integrity Mandate**: Never fabricate test passes, create mock facades that bypass real execution, or hardcode expected values. Every implementation must maintain genuine state.
2. **Zero-Stub Policy**: No placeholder comments (`// TODO`, `/* implement later */`), empty function bodies, or mock return values in production paths.
3. **Evidence-Based Changes**: All architectural modifications must be verified with formal invariants, unit/integration tests, and mathematical proofs.
4. **Documentation Coupling**: Whenever APIs, CLI commands, or core structures are modified, update corresponding documentation atomically per `docs/.ai/doc-update-policy.md`.



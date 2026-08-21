# GenOS Canonical Agent Primitives Specification

GenOS formalizes autonomous agent lifecycle and execution through ten atomic, mathematically rigorous primitives. These primitives govern the creation, branching, mutation, execution, diffing, reconciliation, and audit of agent-world capsules.

```text
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                           GenOS Canonical State Transition Machine                       │
└─────────────────────────────────────────────┬────────────────────────────────────────────┘
                                              │ init
                                              ▼
                                    ┌───────────────────┐
                             ┌─────►│  Snapshot State   │◄─────────┐
                             │      │      (σ_k)        │          │
                             │      └─────────┬─────────┘          │
                             │                │ fork               │
                             │                ▼                    │
                             │      ┌───────────────────┐          │
                             │      │  Active Capsule   │          │
                             │      │   (Branch B_i)    │          │
                             │      └─────────┬─────────┘          │
                             │                │                    │
                             │        ┌───────┴───────┐            │
                             │        │ run (step)    │ mutate (G) │
                             │        ▼               ▼            │
                             │ ┌─────────────┐ ┌─────────────┐     │
                             │ │ Executed    │ │ Child       │     │
                             │ │ State S'    │ │ Genome G'   │     │
                             │ └──────┬──────┘ └──────┬──────┘     │
                             │        │               │            │
                 restore     │        └───────┬───────┘            │ merge
               (Rollback)    │ snapshot       │ diff / eval        │ (Reconcile)
                             └────────────────┴────────────────────┘
```

---

## 1. Formal Mathematical Operational Semantics

Let an Agent-World Capsule $\mathcal{C}$ be defined as the 5-tuple:
$$\mathcal{C} = \langle \mathcal{G}, \mathcal{S}, \mathcal{W}, \mathcal{H}, \mathcal{B} \rangle$$
where $\mathcal{G} \in \mathbb{G}$ is the immutable genome, $\mathcal{S} \in \mathbb{S}$ is the ephemeral mental state, $\mathcal{W} \in \mathbb{W}$ is the isolated world substrate, $\mathcal{H} = [E_1, \dots, E_t] \in \mathbb{E}^*$ is the append-only event ledger, and $\mathcal{B} \in \mathbb{B}$ is the resource budget.

$$\begin{array}{rll}
\textbf{1. [INIT]} & \text{path} \xrightarrow{\text{init}} \mathcal{W}_{\text{CAS}} & \text{Bootstrap CAS directory hierarchy \& Merkle storage} \\
\textbf{2. [SNAPSHOT]} & \mathcal{C} \xrightarrow{\text{snapshot}} \sigma = \text{MerkleRoot}(\mathcal{G}, \mathcal{S}, \mathcal{W}, \mathcal{H}, \mathcal{B}) & \text{Freeze active capsule into immutable CAS snapshot } \sigma \\
\textbf{3. [RESTORE]} & (\mathcal{C}, \sigma) \xrightarrow{\text{restore}} \mathcal{C}_\sigma = \langle \mathcal{G}_\sigma, \mathcal{S}_\sigma, \text{worktree}(\mathcal{W}_\sigma), \mathcal{H}_\sigma, \mathcal{B} \rangle & \text{Reconstitute active capsule from historical snapshot } \sigma \\
\textbf{4. [FORK]} & (\mathcal{C}, \{L_1, \dots, L_k\}) \xrightarrow{\text{fork}} \{\mathcal{C}_{B_1}, \dots, \mathcal{C}_{B_k}\} & \text{Spawn } k \text{ isolated branches with CoW worktrees} \\
\textbf{5. [MUTATE]} & (\mathcal{G}, \Delta\mathbf{d}) \xrightarrow{\text{mutate}} \mathcal{G}' = \text{mutate\_cognition}(\mathcal{G}, \Delta\mathbf{d}) & \text{Derive child genome } \mathcal{G}' \text{ with altered drive alleles} \\
\textbf{6. [RUN]} & (\mathcal{C}, \text{cmd}) \xrightarrow{\text{run}} \langle \mathcal{G}, \mathcal{S}', \mathcal{W}', \mathcal{H} \Vert [E_{\text{exec}}], \mathcal{B}-1 \rangle & \text{Execute sandboxed tool step, append event, decrement budget} \\
\textbf{7. [DIFF]} & (\sigma_A, \sigma_B) \xrightarrow{\text{diff}} \Delta = \langle \Delta\mathcal{S}, \Delta\mathcal{W}, \Delta\text{Beliefs}, \Delta\text{Goals} \rangle & \text{Compute structural and semantic divergence delta} \\
\textbf{8. [MERGE]} & (\mathcal{C}_A, \mathcal{C}_B, \mathcal{M}) \xrightarrow{\text{merge}} \mathcal{C}_{\text{synth}} = \text{reconcile}(\mathcal{C}_A, \mathcal{C}_B, \mathcal{M}) & \text{Synthesize multi-branch evidence into unified state} \\
\textbf{9. [LINEAGE]} & \sigma \xrightarrow{\text{lineage}} \text{DAG}(\sigma) = \langle V_{\text{snapshots}}, E_{\text{provenance}} \rangle & \text{Traverse ancestral Merkle DAG and mutation origins} \\
\textbf{10. [REPLAY]} & (\mathcal{S}_0, \mathcal{H}) \xrightarrow{\text{replay}} \mathcal{S}_t = \text{foldl}(\text{apply\_event}, \mathcal{S}_0, \mathcal{H}) & \text{Deterministic offline state reconstruction without LLM calls}
\end{array}$$

---

## 2. Operational Semantics & Primitive Specifications

### 2.1. `init` — Workspace & CAS Initialization
- **Semantics**: Creates `.genos/` Content-Addressable Storage hierarchy including `snapshots/`, `events/`, `capsules/`, and `worlds/`.
- **CLI**: `genos agent init [--root <PATH>]`
- **Guarantees**: Idempotent. Initializes cryptographic Blake3 CAS root and default genome registry.

### 2.2. `snapshot` — State Freezing & Merkle Sealing
- **Semantics**: Atomically seals the running capsule $\mathcal{C}$ into an immutable CAS record $\sigma$. Computes the filesystem Merkle root, flushes working memory, and writes snapshot metadata.
- **CLI**: `genos agent snapshot <CAPSULE_ID> [--out <PATH>]`
- **Guarantees**: Snapshots are strictly immutable ($INV-001$, $INV-003$).

### 2.3. `restore` — Historical State Reconstitution
- **Semantics**: Instantiates an active capsule $\mathcal{C}_\sigma$ pointing to snapshot $\sigma$. Clones a fresh CoW Git worktree from $\sigma$'s world ref.
- **CLI**: `genos agent restore <CAPSULE_ID> --snapshot <SNAPSHOT_ID>`
- **Guarantees**: Restoring does not mutate the historical snapshot record ($INV-006$).

### 2.4. `fork` — Counterfactual Branch Spawning
- **Semantics**: Forks capsule $\mathcal{C}$ into multiple concurrent branches ($B_1, \dots, B_k$). Assigns each branch a unique `BranchId`, a fresh isolated Git worktree, and a partitioned event stream sharing a common `CorrelationId`.
- **CLI**: `genos agent fork <SNAPSHOT_ID> --branch A=HYPOTHESIS_A --branch B=HYPOTHESIS_B`
- **Guarantees**: Zero cross-branch leakage: $I(\mathcal{W}_A; \mathcal{W}_B \mid \mathcal{W}_0) = 0$ ($INV-004$).

### 2.5. `mutate` — Cognitive Allele Adaptation
- **Semantics**: Produces child genome $\mathcal{G}'$ with updated chromosomal loci or cognitive drives ($\Delta\xi_{\text{exploration}}, \Delta\rho_{\text{risk}}, \Delta\theta_{\text{verification}}$).
- **CLI**: `genos agent mutate <GENOME_PATH> --drive exploration=0.15 --risk -0.10`
- **Guarantees**: Immutable lineage: $\mathcal{G}'$ contains `parent_genome` hash and explicit author justification ($INV-008$).

### 2.6. `run` — Bounded Step Execution
- **Semantics**: Executes a single cognitive step or tool command within the sandboxed world $\mathcal{W}$. Decrements `steps_remaining` in budget $\mathcal{B}$, monitors circuit breakers, and appends `AgentEvent::ToolExecuted`.
- **CLI**: `genos agent run <CAPSULE_ID> --command "cargo test"`
- **Guarantees**: Monotonic budget reduction ($INV-005$). Aborts immediately on loop detection ($INV-010$).

### 2.7. `diff` — Multi-Dimensional State Divergence
- **Semantics**: Computes structural and semantic differences between snapshots $\sigma_A$ and $\sigma_B$, evaluating filesystem tree deltas, working memory divergence, and belief shifts.
- **CLI**: `genos agent diff <SNAPSHOT_A> <SNAPSHOT_B>`
- **Output**: Structured delta report detailing files changed, confidence shifts, and goal status.

### 2.8. `merge` — Evidence-Based Cognitive Synthesis
- **Semantics**: Reconciles divergent branches using a 3-way cognitive merge algorithm. Resolves belief contradictions using empirical test evidence, unites non-conflicting memories, and fast-forwards world worktrees.
- **CLI**: `genos agent merge <COGNITIVE_MERGE_MANIFEST>`
- **Guarantees**: Merged capsule satisfies lineage DAG properties ($INV-007$).

### 2.9. `lineage` — DAG Traversal & Provenance Audit
- **Semantics**: Queries the Merkle DAG to produce ancestor chains, mutation histories, and counterfactual branch origins for any genome or snapshot.
- **CLI**: `genos agent lineage --snapshot <SNAPSHOT_ID> [--depth <N>]`
- **Guarantees**: Traversal is strictly acyclic ($INV-007$).

### 2.10. `replay` — Pure Deterministic State Folding
- **Semantics**: Reconstructs state $\mathcal{S}_t$ by folding historical events $[E_1, \dots, E_t]$ over initial state $\mathcal{S}_0$. Does not re-invoke external LLM APIs or side-effect tools.
- **CLI**: `genos agent replay --snapshot <SNAPSHOT_ID> [--target-step <STEP>]`
- **Guarantees**: Bitwise state identity across host platforms ($INV-006$).

---

## 3. Core JSON Schema Declarations

### 3.1. AgentWorldCapsule Schema (`agent_world_capsule.json`)
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "AgentWorldCapsule",
  "type": "object",
  "required": ["capsule_id", "branch_id", "agent_snapshot", "world_snapshot_id", "budget", "lifecycle", "integrity_digest"],
  "properties": {
    "capsule_id": { "type": "string", "pattern": "^cap_[0-9a-zA-Z]+$" },
    "branch_id": { "type": "string", "pattern": "^br_[0-9a-zA-Z_-]+$" },
    "agent_snapshot": { "$ref": "#/$defs/AgentSnapshot" },
    "world_snapshot_id": { "type": "string", "pattern": "^snp_[0-9a-zA-Z]+$" },
    "live_world_id": { "type": ["string", "null"] },
    "event_stream_id": { "type": "string" },
    "budget": {
      "type": "object",
      "required": ["steps_remaining"],
      "properties": {
        "steps_remaining": { "type": "integer", "minimum": 0 },
        "duration_ms_remaining": { "type": ["integer", "null"] },
        "cost_remaining": { "type": ["number", "null"] }
      }
    },
    "lifecycle": { "type": "string", "enum": ["created", "running", "paused", "completed", "failed", "budget_exhausted"] },
    "parent_capsule": { "type": ["string", "null"] },
    "relation": { "type": "string", "enum": ["genesis", "fork", "checkpoint", "restore", "replay", "mutation", "merge"] },
    "integrity_digest": { "type": "string", "pattern": "^sha256:[0-9a-f]{64}$" }
  }
}
```

### 3.2. AgentSnapshot Schema (`agent_snapshot.json`)
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "AgentSnapshot",
  "type": "object",
  "required": ["snapshot_id", "genome", "state", "branch_id", "parent_snapshot_id", "merkle_root"],
  "properties": {
    "snapshot_id": { "type": "string", "pattern": "^snp_[0-9a-zA-Z]+$" },
    "parent_snapshot_id": { "type": ["string", "null"] },
    "branch_id": { "type": "string" },
    "genome": {
      "type": "object",
      "required": ["genome_id", "version", "drives"],
      "properties": {
        "genome_id": { "type": "string" },
        "version": { "type": "string" },
        "drives": {
          "type": "object",
          "properties": {
            "exploration": { "type": "number", "minimum": 0.0, "maximum": 1.0 },
            "risk_tolerance": { "type": "number", "minimum": 0.0, "maximum": 1.0 },
            "verification_threshold": { "type": "number", "minimum": 0.0, "maximum": 1.0 }
          }
        }
      }
    },
    "state": {
      "type": "object",
      "required": ["working_memory", "beliefs", "active_goals", "event_cursor"],
      "properties": {
        "working_memory": { "type": "array" },
        "beliefs": { "type": "array" },
        "active_goals": { "type": "array" },
        "event_cursor": { "type": "object", "required": ["sequence"] }
      }
    },
    "merkle_root": { "type": "string", "pattern": "^sha256:[0-9a-f]{64}$" }
  }
}
```

### 3.3. ForkRequest Schema (`fork_request.json`)
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "ForkRequest",
  "type": "object",
  "required": ["source_snapshot_id", "branches"],
  "properties": {
    "source_snapshot_id": { "type": "string", "pattern": "^snp_[0-9a-zA-Z]+$" },
    "branches": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "required": ["branch_label", "hypothesis"],
        "properties": {
          "branch_label": { "type": "string" },
          "hypothesis": { "type": "string" },
          "budget_allocation": { "type": "integer", "minimum": 1 },
          "drive_overrides": { "type": "object" }
        }
      }
    },
    "correlation_id": { "type": "string" }
  }
}
```

### 3.4. MergeManifest Schema (`cognitive_merge_manifest.json`)
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "CognitiveMergeManifest",
  "type": "object",
  "required": ["base_snapshot_id", "branches", "reconciliation_strategy"],
  "properties": {
    "base_snapshot_id": { "type": "string", "pattern": "^snp_[0-9a-zA-Z]+$" },
    "branches": {
      "type": "array",
      "minItems": 2,
      "items": {
        "type": "object",
        "required": ["branch_id", "snapshot_id", "fitness_score"],
        "properties": {
          "branch_id": { "type": "string" },
          "snapshot_id": { "type": "string" },
          "fitness_score": { "type": "number" },
          "test_pass_rate": { "type": "number", "minimum": 0.0, "maximum": 1.0 }
        }
      }
    },
    "reconciliation_strategy": {
      "type": "string",
      "enum": ["highest_fitness_winner", "evidence_weighted_belief_union", "pareto_synthesis"]
    },
    "conflict_resolutions": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["target_entity", "winning_branch_id", "justification"],
        "properties": {
          "target_entity": { "type": "string" },
          "winning_branch_id": { "type": "string" },
          "justification": { "type": "string" }
        }
      }
    }
  }
}
```

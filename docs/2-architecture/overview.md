# GenOS Master Architecture Overview

GenOS (Genetic Operating System) is a deterministic, counterfactual execution kernel designed for autonomous cognitive agents. Unlike traditional agent orchestrators that treat executions as ephemeral linear chat threads, GenOS formalizes agents as versioned, reproducible computational organisms with immutable genomic blueprints, auditable event-sourced trajectories, and isolated world substrates.

```text
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                                GenOS System Architecture Stack                           │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ 1. Interface Layer      genos-cli (CLI commands: init, fork, run, diff, merge, replay)   │
│                         MCP Server (Model Context Protocol, JSON-RPC 2.0, STDIO/HTTP)    │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ 2. Protocol Layer       genos-protocol (Universal Tool Schema, Typed Beliefless Planning)│
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ 3. Orchestration Layer  genos-eval (Process Reward Models, QTL Fitness, MCTS Search)     │
│                         genos-synaptic (Associative Memory, Hebbian Synaptic Plasticity) │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ 4. Runtime Layer        genos-runtime (Capsule Lifecycle, Causal Engine, Branch Evolution)│
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ 5. Core Domain Layer    genos-core (Genome, State, Snapshot, Events, Action DAG, Revert) │
│                         genos-model (Provider-Neutral LLM Bindings: Local, OpenAI, Claude)│
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ 6. Storage & World      genos-store (Append-Only Event Store, CAS Merkle Trees, Fossils) │
│    Substrates           genos-world (Git Worktree Sandboxes, CoW Trees, Path Safety)     │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 1. The Core Agent-World Capsule Formalism

Every autonomous agent in GenOS is encapsulated within a rigorous 5-tuple mathematical boundary:

$$\mathcal{C} = \langle \mathcal{G}, \mathcal{S}, \mathcal{W}, \mathcal{H}, \mathcal{B} \rangle$$

```text
                     ┌──────────────────────────────────┐
                     │         Agent Genome (G)         │ ◄── Immutable Blueprint
                     │ (Chromosomes, Drives, Perms)     │     (Identity & Heredity)
                     └────────────────┬─────────────────┘
                                      │ instantiates
                                      ▼
     ┌──────────────────────────────────────────────────────────────────┐
     │                      Agent World Capsule (C)                     │
     │                                                                  │
     │  ┌─────────────────────────┐         ┌────────────────────────┐  │
     │  │     Agent State (S)     │ ◄─────► │   World Substrate (W)  │  │
     │  │ (Working Memory, Goals, │         │ (Git Worktree Sandbox, │  │
     │  │  Beliefs, Cursor)       │         │  File Trees, Env Vars) │  │
     │  └────────────┬────────────┘         └────────────┬───────────┘  │
     │               │                                   │              │
     │               │ writes state transitions          │ records IO   │
     │               ▼                                   ▼              │
     │  ┌────────────────────────────────────────────────────────────┐  │
     │  │                  Event History Ledger (H)                  │  │
     │  │     [E0: Init] ──► [E1: ToolExec] ──► [E2: BeliefUpdate]   │  │
     │  └────────────────────────────┬───────────────────────────────┘  │
     │                               │                                  │
     │                  Budget (B): Steps, Tokens, Cost                 │
     └───────────────────────────────┼──────────────────────────────────┘
                                     │ sealed to CAS
                                     ▼
                     ┌──────────────────────────────────┐
                     │       Agent Snapshot (σ)         │ ◄── Content-Addressed
                     │ σ = MerkleRoot(G, S, W, H, B)    │     Immutable Checkpoint
                     └──────────────────────────────────┘
```

### Components of the Formalism:
1. **Agent Genome ($\mathcal{G} \in \mathbb{G}$)**: The declarative, immutable specification of agent identity, chromosomal loci, cognitive drives ($\xi_{\text{exploration}}, \rho_{\text{risk}}, \theta_{\text{verification}}$), objective fitness functions, tool permissions, and memory retention policies. Genomes are strictly immutable once created.
2. **Agent State ($\mathcal{S} \in \mathbb{S}$)**: The ephemeral internal cognitive state containing working memory buffers, semantic memory graph references, episodic indices, active goal hierarchies, and belief confidence vectors.
3. **World Substrate ($\mathcal{W} \in \mathbb{W}$)**: The physical or simulated external operating environment (Git worktrees, isolated directory trees, shell process sandboxes, environment variables, mock network endpoints).
4. **Event History ($\mathcal{H} = [E_1, E_2, \dots, E_t] \in \mathbb{E}^*$)**: The chronologically ordered, append-only causal ledger capturing every atomic state transition, tool invocation, sensory input, and cognitive output.
5. **Execution Budget ($\mathcal{B} \in \mathbb{B}$)**: Bounded constraints specifying maximum step count, wall-clock execution duration, and provider token expenditure.

---

## 2. Core Domain Invariants

GenOS enforces five foundational architectural invariants across all subsystem boundaries:

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                               GenOS Core Domain Invariants                             │
├─────────┬───────────────────────────────┬──────────────────────────────────────────────┤
│ Invariant│ Name                          │ Formal Property                              │
├─────────┼───────────────────────────────┼──────────────────────────────────────────────┤
│ INV-001 │ Genome-State Separation       │ $\mathcal{G} \cap \mathcal{S} = \emptyset, \quad \frac{\partial \mathcal{G}}{\partial t} = 0$                │
│ INV-002 │ Immutable Causal DAG          │ $\mathcal{H}_t \sqsubseteq \mathcal{H}_{t+1}, \quad \text{IsAcyclic}(\text{Lineage}(\sigma)) = \text{true}$ │
│ INV-003 │ Content-Addressable Storage   │ $\text{ID}(O) = \text{Blake3}(\text{Serialize}(O))$                          │
│ INV-004 │ Provider Neutrality           │ $\mathcal{S}_{t+1} = \Phi(\mathcal{S}_t, \text{Intent}(\mathcal{M})) \quad (\mathcal{M} \text{ agnostic})$   │
│ INV-005 │ Zero-Leakage World Sandboxing │ $I(\mathcal{W}_A; \mathcal{W}_B \mid \mathcal{W}_0) = 0$                      │
└─────────┴───────────────────────────────┴──────────────────────────────────────────────┘
```

### Detailed Invariant Definitions:

- **Genome-State Separation (INV-001)**: The genotype $\mathcal{G}$ defines *how* the agent thinks; the state $\mathcal{S}$ records *what* the agent is currently thinking. An agent cannot alter its own genotype in place during a run. Genotype updates occur strictly via explicit out-of-band evolutionary operators (`mutate`, `breed`, `promote`).
- **Immutable Causal DAG (INV-002)**: The historical sequence of events is strictly append-only. Snapshots link to their parent snapshots forming a Directed Acyclic Graph (DAG) with Merkle provenance pointers. No historical node can be modified retroactively.
- **Content-Addressable Storage (INV-003)**: All persisted snapshots, memory blobs, world diffs, and artifacts are addressed by their cryptographic hashes (Blake3 / SHA-256). Duplicate states across counterfactual branches are automatically deduplicated.
- **Provider Neutrality (INV-004)**: Agent logic, memory schemas, tool interfaces, and evaluation harnesses are entirely independent of specific LLM inference backends. Switching between local inference (llama.cpp) and cloud APIs (Anthropic, OpenAI, Gemini) requires zero changes to core domain logic.
- **Zero-Leakage World Sandboxing (INV-005)**: When execution forks into parallel counterfactual branches $A$ and $B$, mutations in world $\mathcal{W}_A$ are mathematically and physically isolated from $\mathcal{W}_B$. Cross-branch mutual information given their common root $\mathcal{W}_0$ is zero.

---

## 3. Event Sourcing Paradigm & Merkle Provenance Verification

In GenOS, the state $\mathcal{S}_t$ of an agent at sequence step $t$ is not an arbitrary mutable variable; it is the deterministic pure fold over its initial state $\mathcal{S}_0$ and the sequence of historical events:

$$\mathcal{S}_t = \text{foldl}\left(\text{apply\_event}, \mathcal{S}_0, [E_1, E_2, \dots, E_t]\right)$$

```text
 ┌──────────────┐     E_1 (ToolCall)      ┌──────────────┐     E_2 (ToolResult)    ┌──────────────┐
 │ State S_0    │ ──────────────────────► │ State S_1    │ ──────────────────────► │ State S_2    │
 └──────────────┘                         └──────────────┘                         └──────────────┘
        │                                        │                                        │
        ▼                                        ▼                                        ▼
   LeafHash(E_0)                            LeafHash(E_1)                            LeafHash(E_2)
        │                                        │                                        │
        └───────────────────┬────────────────────┘                                        │
                            ▼                                                             │
                      NodeHash(0,1)                                                       │
                            │                                                             │
                            └──────────────────────────────┬──────────────────────────────┘
                                                           ▼
                                               Merkle Provenance Root H_t
```

### Merkle Tree Verification Guarantee:
For any event stream $\mathcal{H} = [E_1, \dots, E_t]$, the cryptographic Merkle root hash $\text{Root}_H = \text{Merkle}(\mathcal{H})$ is embedded inside every snapshot $\sigma$. Given an event $E_k$ and its Merkle inclusion proof $\Pi_k = [H_1, \dots, H_d]$:

$$\text{VerifyProof}(\text{Root}_H, E_k, \Pi_k) = \text{true} \iff E_k \in \mathcal{H}$$

This guarantees:
1. **Tamper Detection**: Any retroactive edit to past thoughts or tool inputs alters the Merkle root, immediately invalidating the snapshot signature.
2. **Cryptographic Non-Repudiation**: External auditors can verify that a given tool action was executed strictly at step $k$ within lineage branch $B$.
3. **Deterministic State Replay**: Offline verifiers can re-fold the event stream from $E_1$ to $E_t$ and assert bitwise equality against the recorded state $\mathcal{S}_t$.

---

## 4. Layered Subsystem Architecture

GenOS is structured as a decoupled, modular suite of Rust crates with clear dependency boundaries:

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              GenOS Modular Crate Topology                              │
├────────────────────────────────────────────────────────────────────────────────────────┤
│                                     genos-cli                                          │
│                    (CLI binary, user commands, developer UX)                           │
│                                         │                                              │
│                    ┌────────────────────┴────────────────────┐                         │
│                    ▼                                         ▼                         │
│               genos-runtime                             genos-protocol                 │
│         (Execution, Forks, Replay)                 (Tool & Belief Schemas)             │
│          │            │           │                          │                         │
│          ▼            ▼           ▼                          │                         │
│     genos-eval   genos-synaptic  genos-world                 │                         │
│    (QTL, MCTS)    (Plasticity)   (Sandboxing)                │                         │
│          │            │           │                          │                         │
│          └────────────┼───────────┴───────────────┬──────────┘                         │
│                       ▼                           ▼                                    │
│                   genos-core                  genos-model                              │
│             (Domain Types, Invariants)    (Provider Abstraction)                       │
│                       │                                                                │
│                       ▼                                                                │
│                   genos-store                                                          │
│             (CAS Storage, Event Store)                                                 │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### Subsystem Responsibilities:

1. **`genos-core`**: Defines the foundational domain primitives (`AgentGenome`, `AgentState`, `AgentCapsule`, `AgentSnapshot`, `AgentEvent`, `CausalBoundary`). Contains loop detection algorithms (`CircuitBreaker`), action dependency DAGs (`ActionDependencyGraph`), and the safest revert point solver (`SafestRevertSolver`).
2. **`genos-store`**: Implements content-addressable storage (`LocalSnapshotStore`, `LocalCapsuleStore`, `LocalEventStore`, `CASStorage`). Manages append-only event files and cryptobiosis state freezing.
3. **`genos-world`**: Provides isolated execution environments (`WorldProvider`, `GitWorktreeWorldProvider`, `DirectoryWorldProvider`). Guarantees directory containment and path traversal protection (`resolve_world_relative_path`).
4. **`genos-protocol`**: Normalizes tool specifications, Model Context Protocol (MCP) servers, JSON-RPC endpoints, and universal schema definitions.
5. **`genos-model`**: Bridges LLM inference providers (OpenAI, Anthropic, Gemini, Ollama, LlamaCpp) behind a unified, token-aware streaming interface.
6. **`genos-eval`**: Implements quantitative trait loci (QTL), behavioral divergence tracking, Pareto frontier multi-objective optimization, Process Reward Models (PRM), and Monte Carlo Tree Search (MCTS).
7. **`genos-synaptic`**: Implements Hebbian synaptic learning and associative memory networks for adaptive retrieval.
8. **`genos-runtime`**: Coordinates the 10 canonical agent primitives (`init`, `snapshot`, `restore`, `fork`, `mutate`, `run`, `diff`, `merge`, `lineage`, `replay`), driving execution steps under strict resource budgets.
9. **`genos-cli`**: Exposes developer CLI commands and interactive workflows.

---

## 5. End-to-End Execution Lifecycle

```text
 ┌──────────────┐
 │  agent init  │ ──► Initialize .genos workspace & CAS Merkle storage
 └──────┬───────┘
        ▼
 ┌──────────────┐
 │   snapshot   │ ──► Freeze immutable base snapshot σ0 = <G0, S0, W0, H0, B0>
 └──────┬───────┘
        ├───────────────────────────────┬───────────────────────────────┐
        ▼                               ▼                               ▼
 ┌──────────────┐                ┌──────────────┐                ┌──────────────┐
 │  fork (B_1)  │                │  fork (B_2)  │                │  fork (B_3)  │
 │ Hypothesis 1 │                │ Hypothesis 2 │                │ Hypothesis 3 │
 └──────┬───────┘                └──────┬───────┘                └──────┬───────┘
        ▼                               ▼                               ▼
 ┌──────────────┐                ┌──────────────┐                ┌──────────────┐
 │  run (step)  │                │  run (step)  │                │  run (step)  │
 │ Execute Tool │                │ Execute Tool │                │ Execute Tool │
 └──────┬───────┘                └──────┬───────┘                └──────┬───────┘
        │                               │                               │
        └───────────────────────────────┼───────────────────────────────┘
                                        ▼
                                 ┌──────────────┐
                                 │  agent diff  │ ──► Compare branch state DAGs & world trees
                                 └──────┬───────┘
                                        ▼
                                 ┌──────────────┐
                                 │ agent merge  │ ──► Cognitive synthesis & belief reconciliation
                                 └──────┬───────┘
                                        ▼
                                 ┌──────────────┐
                                 │   lineage    │ ──► Verify Merkle DAG provenance & audit log
                                 └──────────────┘
```

This lifecycle provides the foundational bedrock for counterfactual reasoning, speculative exploration, automated refactoring, and self-healing agent architectures in GenOS.

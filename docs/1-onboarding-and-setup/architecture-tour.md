# GenOS Architecture Tour & Codebase Walkthrough

This document provides a deep, mathematically rigorous architectural tour of GenOS, detailing its theoretical mental model, data flow, event lifecycle, and every crate in the `crates/` workspace.

---

## 1. Core Mental Model: The Biological-State Paradigm

GenOS treats autonomous software agents as stateful, versioned biological entities executing within isolated counterfactual environments.

```text
+---------------------------------------------------------------------------------------------------+
|                                      GenOS Cognitive Onion                                        |
+---------------------------------------------------------------------------------------------------+
| [Genotype G]      Immutable DNA: Prompts, Traits, Drives, Allowed Operons (Tool Capabilities)     |
|         │                                                                                         |
|         ▼                                                                                         |
| [Phenotype Φ]     Expressed State: Dynamic weights, active skills, behavioral manifestations       |
|         │                                                                                         |
|         ▼                                                                                         |
| [Cognitive S]     Epistemic Beliefs B(t), Episodic Memories M(t), Working Scratchpad Σ(t)         |
|         │                                                                                         |
|         ▼                                                                                         |
| [World State W]   Physical Environment: Sandboxed POSIX Filesystem, Git Worktrees, IPC Handles   |
+---------------------------------------------------------------------------------------------------+
```

### 1.1 The Atomic Capsule Formulation

The fundamental unit of versioning in GenOS is the **Capsule** $\mathcal{C}$:
$$\mathcal{C} = \langle \mathcal{G}, \mathcal{S}, \mathcal{W}, \mathcal{P}, \mathcal{B}, \mathcal{L}, \mathcal{H} \rangle$$

- $\mathcal{G}$ (**Genome**): Immutable identity, prompt templates, behavioral drives $\mathbf{d} \in \mathbb{R}^k$.
- $\mathcal{S}$ (**Cognitive State**): Epistemic belief graph $\mathcal{B}$, episodic memory $\mathcal{M}$, SSM recurrent state $\mathbf{h}_t$.
- $\mathcal{W}$ (**World Handle**): Isolated Git worktree reference and environment variables.
- $\mathcal{P}$ (**Capability Mask**): Cryptographically enforced security permissions for syscalls and tools.
- $\mathcal{B}$ (**Budget Vector**): $\mathbf{b} = \langle \text{max\_steps}, \text{max\_tokens}, \text{max\_wallclock\_ms}, \text{cost\_limit\_usd} \rangle$.
- $\mathcal{L}$ (**Lineage Anchor**): Causal DAG pointers $\langle \text{parent\_snapshot\_id}, \text{branch\_id}, \text{generation} \rangle$.
- $\mathcal{H}$ (**Merkle Hash**): $\mathcal{H} = \text{SHA-256}(H(\mathcal{G}) \parallel H(\mathcal{S}) \parallel H(\mathcal{W}) \parallel H(\mathcal{L}))$.

---

## 2. Workspace Layout & Crate Taxonomy

```text
GenOS/crates/
├── genos-core/       # Domain ontology, Capsule primitives, Causal DAG, Beliefs
├── genos-runtime/    # Step execution loop, Capsule lifecycle, Fork manager
├── genos-world/      # POSIX & Git worktree sandboxing, File diff/revert engine
├── genos-store/      # Content-Addressable Storage (CAS), SQLite/Postgres backends
├── genos-model/      # Provider abstractions (OpenAI/Anthropic/Ollama/Mock replay)
├── genos-tools/      # Secure tool registry, capability verification, execution
├── genos-eval/       # Multi-objective Pareto scoring, trajectory divergence metrics
├── genos-api/        # Axum REST & WebSocket telemetry server
├── genos-cli/        # Unified CLI entrypoint and orchestrator dispatch
├── genos-protocol/   # JSON-RPC schemas & Model Context Protocol (MCP) server
├── genos-synaptic/   # STDP synaptic plasticity, knowledge graphs, cognitive merge
├── epsilon_sa/       # Simulated Annealing branch exploration engine
└── epsilon_wgpu/     # WebGPU accelerated lattice tensor & compute shaders
```

---

## 3. Crate Deep Dive & Technical Walkthrough

### 3.1 `genos-core`: Domain Ontology & State Primitives
`genos-core` defines the zero-dependency canonical domain model:
- **`genome.rs` & `phenotype.rs`**: Encodes agent traits, mutation rates, and operon structures.
- **`capsule.rs`**: Houses the `Capsule` struct, checkpointing routines, and serialization codecs.
- **`causality/` & `events.rs`**: Implements append-only event sourcing with cryptographic parent links:
  $$e_t = \langle \text{id}, \text{type}, \text{payload}, \text{timestamp}, \text{prev\_event\_hash} \rangle$$
- **`beliefs/` & `memories.rs`**: Formalized epistemic triples $\langle s, p, o, c \rangle$ where confidence $c \in [0, 1]$, updated via Bayesian inference:
  $$P(B \mid E) = \frac{P(E \mid B) P(B)}{P(E)}$$
- **`operon.rs`, `sos.rs`, `hgt.rs`**: Biomimetic primitives for modular tool clustering, Horizontal Gene Transfer between agents, and apoptosis / SOS emergency resets.

### 3.2 `genos-runtime`: Cognitive Execution & Lifecycles
`genos-runtime` drives agent state machines and counterfactual orchestration:
- **Step Execution Loop**: Implements the atomic cycle $\text{Observe} \to \text{Orient} \to \text{Decide} \to \text{Act} \to \text{Verify}$.
- **Capsule Manager**: Coordinates state hydration from CAS, budget enforcement, and apoptosis when budget constraints $\mathbf{b}$ are violated.
- **Fork Manager**: Spawns isolated execution timelines $T_1, T_2, \dots, T_k$ from a common snapshot root $S_0$.
- **Bug Investigation & Incident Workflows**: Automated hypothesis verification loops.

### 3.3 `genos-world`: Sandboxing & Worktree Virtualization
`genos-world` manages all physical filesystem side effects:
- **`git_worktree.rs`**: Provisions zero-copy Git worktrees linked to the primary repository `.git` storage.
- **`directory.rs`**: Manages ephemeral directory sandboxes with strict path traversal isolation.
- **`files.rs` & `diff/`**: Calculates granular AST/binary diffs between snapshots and enforces rollback invariants.

### 3.4 `genos-store`: Content-Addressable Storage & Event Log
`genos-store` guarantees immutable persistence:
- **Content-Addressable Storage (`CasStore`)**: SHA-256 chunk-based deduplicated blob storage.
- **`SnapshotStore`**: Saves and reassembles `SnapshotComponentManifest` indexes with $O(1)$ deduplication.
- **`EventStore`**: Append-only log supporting SQLite, PostgreSQL, and local JSONL formats.
- **`cryptobiosis.rs`**: Freezes inactive agent states into compressed binary fossils for long-term dormancy.

### 3.5 `genos-model`: Provider Abstraction & Deterministic Replay
`genos-model` abstracts generative model backends:
- **Unified Providers**: Seamless adapters for OpenAI (`gpt-4o`), Anthropic (`claude-3-5-sonnet`), and local Ollama (`llama3`).
- **Deterministic Replay Engine (`fake.rs`)**: Replays recorded token streams keyed by $\text{SHA-256}(\text{Prompt} \parallel \text{Context})$ for zero-cost, perfectly deterministic CI regression testing.
- **SSM Routing (`ssm.rs`)**: Structured State Space model integration for linear-time context persistence.

### 3.6 `genos-tools`: Secure Execution Gateway
`genos-tools` manages tool dispatch and sandboxing:
- **Capability Security**: Validates incoming tool requests against `Capsule.permissions` before dispatch.
- **Built-in Tooling**: Atomic file read/write, bash execution, regex replacement, and Git manipulation.
- **Schema Reflection**: Emits JSON-Schema compliant function signatures for LLM tool calling.

### 3.7 `genos-eval`: Multi-Objective Pareto Evaluation
`genos-eval` provides rigorous mathematical scoring for agent trajectories:
- **Pareto Dominance**: Trajectory $\tau_A$ dominates $\tau_B$ ($\tau_A \succ \tau_B$) iff:
  $$\forall i \in \{C, P, S, L\}, f_i(\tau_A) \ge f_i(\tau_B) \land \exists j, f_j(\tau_A) > f_j(\tau_B)$$
  where $C = \text{Correctness}$, $P = \text{Performance}$, $S = \text{Safety Invariants}$, $L = \text{Resource Cost}$.
- **Trajectory Divergence**: Computes state divergence $\Delta(\tau_A, \tau_B)$ across AST diffs and epistemic belief deltas.

### 3.8 `genos-synaptic`: Cognitive Merge & Memory Plasticity
`genos-synaptic` resolves multi-timeline divergence:
- **Cognitive Merge**: Reconciles divergent epistemic belief graphs from parallel forks into a unified consensus state.
- **STDP Plasticity (`stdp.rs`)**: Spike-Timing-Dependent Plasticity model for updating associative memory edge weights:
  $$\Delta w_{ij} = \begin{cases} A_+ \exp\left(-\frac{\Delta t}{\tau_+}\right) & \text{if } \Delta t > 0 \\ -A_- \exp\left(\frac{\Delta t}{\tau_-}\right) & \text{if } \Delta t < 0 \end{cases}$$
- **AMPK Regulation (`ampk.rs`)**: Cellular energy homeostasis regulating memory pruning under token starvation.

### 3.9 `epsilon_sa` & `epsilon_wgpu`: Thermodynamic Optimization & GPU Acceleration
- **`epsilon_sa`**: Implements Simulated Annealing for exploring large decision spaces:
  $$P(\text{accept } \tau' \mid \tau) = \min\left(1, \exp\left(-\frac{E(\tau') - E(\tau)}{T_k}\right)\right), \quad T_{k+1} = \alpha T_k$$
- **`epsilon_wgpu`**: WebGPU-powered compute pipelines executing parallel Monte Carlo Tree Search (MCTS) rollout simulations across GPU tensor cores.

### 3.10 `genos-protocol`, `genos-api` & `genos-cli`
- **`genos-protocol`**: Implements Model Context Protocol (MCP) servers and JSON-RPC 2.0 endpoints for Anthropic Desktop and IDE integrations.
- **`genos-api`**: High-throughput Axum HTTP/WebSocket server broadcasting real-time agent telemetry and snapshot events.
- **`genos-cli`**: Clap-based developer CLI coordinating orchestration, experiments, and debugging.

---

## 4. End-to-End Request Data Flow & Event Lifecycle

```text
[ Developer CLI / IDE / MCP Client ]
                 │
                 │ 1. Invocation: `genos agent run <CAP_ID> --command "..."`
                 ▼
      +─────────────────────+
      │   genos-runtime     │ ── (Hydrates Capsule C0 from CAS via genos-store)
      +─────────────────────+
                 │
                 │ 2. Formulate Prompt & Retrieve Episodic Memories
                 ▼
      +─────────────────────+
      │    genos-model      │ ── (Calls LLM or Deterministic Replay Mock)
      +─────────────────────+
                 │
                 │ 3. Returns Tool Invocation Intent: `WriteFile("src/lib.rs")`
                 ▼
      +─────────────────────+
      │    genos-tools      │ ── (Checks PermissionsMask in Capsule)
      +─────────────────────+
                 │
                 │ 4. Dispatches isolated execution
                 ▼
      +─────────────────────+
      │    genos-world      │ ── (Mutates dedicated Git worktree sandbox)
      +─────────────────────+
                 │
                 │ 5. Emits `ToolExecuted` Event & State Diff
                 ▼
      +─────────────────────+
      │    genos-core       │ ── (Appends event to Causal DAG & updates Merkle Root)
      +─────────────────────+
                 │
                 │ 6. Persists durable snapshot S1
                 ▼
      +─────────────────────+
      │    genos-store      │ ── (Writes chunks to CAS & appends to SQLite/Postgres)
      +─────────────────────+
```

---

## 5. Event Sourcing Invariants

Every state transition in GenOS adheres to four mathematical invariants:

1. **Immutability**: Once written to the event store, event $e_t$ is cryptographically sealed; no updates or deletions are permitted.
2. **Causal Determinism**: State $\mathcal{S}_T = \bigotimes_{t=0}^T \delta(\mathcal{S}_{t-1}, e_t)$ is fully deterministically reconstructible by folding over the event stream from genesis $e_0$.
3. **Branch Isolation**: Events emitted on Branch $\beta_A$ have no causal edges to Branch $\beta_B$ until an explicit Cognitive Merge event $e_{\text{merge}}$ is committed.
4. **Conservation of Budget**: At step $t+1$, remaining budget $\mathbf{b}_{t+1} = \mathbf{b}_t - \Delta \mathbf{b}_{\text{step}}$. If any component of $\mathbf{b} \le 0$, the runtime triggers immediate suspension.

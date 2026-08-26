# GenOS Master Architecture Overview

> [!NOTE]
> **Mise à jour Architecturale (Audit Lot 1)** :
> L'architecture documentée ci-dessous se concentre historiquement sur le noyau Rust (9 crates). En réalité, GenOS possède aujourd'hui une **architecture bicéphale** :
> 1. **Control Plane Node.js/Express** (ackend/) : Gère l'orchestration, le RBAC, et les espaces de travail via 67 tables SQLite.
> 2. **Kernel Rust étendu** : Le workspace comporte désormais **19 crates** (incluant genos-api, genos-observability, genos-rag, genos-integrations, genos-tools, genos-platform, genos-mycelium, epsilon_sa, epsilon_wgpu, genos-mcp) et intègre 39 modules biomimétiques (genos-core). Note : Les invariants sont numérotés de 1 à 10 dans 	raceability-matrix.md.

GenOS (Genetic Operating System) is a deterministic, counterfactual execution kernel designed for autonomous cognitive agents. Unlike traditional agent orchestrators that treat executions as ephemeral linear chat threads, GenOS formalizes agents as versioned, reproducible computational organisms with immutable genomic blueprints, auditable event-sourced trajectories, and isolated world substrates.

```text
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                                GenOS System Architecture Stack                           â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ 1. Interface Layer      genos-cli (CLI commands: init, fork, run, diff, merge, replay)   â”‚
â”‚                         MCP Server (Model Context Protocol, JSON-RPC 2.0, STDIO/HTTP)    â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ 2. Protocol Layer       genos-protocol (Universal Tool Schema, Typed Beliefless Planning)â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ 3. Orchestration Layer  genos-eval (Process Reward Models, QTL Fitness, MCTS Search)     â”‚
â”‚                         genos-synaptic (Associative Memory, Hebbian Synaptic Plasticity) â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ 4. Runtime Layer        genos-runtime (Capsule Lifecycle, Causal Engine, Branch Evolution)â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ 5. Core Domain Layer    genos-core (Genome, State, Snapshot, Events, Action DAG, Revert) â”‚
â”‚                         genos-model (Provider-Neutral LLM Bindings: Local, OpenAI, Claude)â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ 6. Storage & World      genos-store (Append-Only Event Store, CAS Merkle Trees, Fossils) â”‚
â”‚    Substrates           genos-world (Git Worktree Sandboxes, CoW Trees, Path Safety)     â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

---

## 1. The Core Agent-World Capsule Formalism

Every autonomous agent in GenOS is encapsulated within a rigorous 5-tuple mathematical boundary:

$$\mathcal{C} = \langle \mathcal{G}, \mathcal{S}, \mathcal{W}, \mathcal{H}, \mathcal{B} \rangle$$

```text
                     â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
                     â”‚         Agent Genome (G)         â”‚ â—„â”€â”€ Immutable Blueprint
                     â”‚ (Chromosomes, Drives, Perms)     â”‚     (Identity & Heredity)
                     â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                                      â”‚ instantiates
                                      â–¼
     â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
     â”‚                      Agent World Capsule (C)                     â”‚
     â”‚                                                                  â”‚
     â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”         â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”‚
     â”‚  â”‚     Agent State (S)     â”‚ â—„â”€â”€â”€â”€â”€â–º â”‚   World Substrate (W)  â”‚  â”‚
     â”‚  â”‚ (Working Memory, Goals, â”‚         â”‚ (Git Worktree Sandbox, â”‚  â”‚
     â”‚  â”‚  Beliefs, Cursor)       â”‚         â”‚  File Trees, Env Vars) â”‚  â”‚
     â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜         â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜  â”‚
     â”‚               â”‚                                   â”‚              â”‚
     â”‚               â”‚ writes state transitions          â”‚ records IO   â”‚
     â”‚               â–¼                                   â–¼              â”‚
     â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”‚
     â”‚  â”‚                  Event History Ledger (H)                  â”‚  â”‚
     â”‚  â”‚     [E0: Init] â”€â”€â–º [E1: ToolExec] â”€â”€â–º [E2: BeliefUpdate]   â”‚  â”‚
     â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜  â”‚
     â”‚                               â”‚                                  â”‚
     â”‚                  Budget (B): Steps, Tokens, Cost                 â”‚
     â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                                     â”‚ sealed to CAS
                                     â–¼
                     â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
                     â”‚       Agent Snapshot (Ïƒ)         â”‚ â—„â”€â”€ Content-Addressed
                     â”‚ Ïƒ = MerkleRoot(G, S, W, H, B)    â”‚     Immutable Checkpoint
                     â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
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
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                               GenOS Core Domain Invariants                             â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ Invariantâ”‚ Name                          â”‚ Formal Property                              â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ INV-001 â”‚ Genome-State Separation       â”‚ $\mathcal{G} \cap \mathcal{S} = \emptyset, \quad \frac{\partial \mathcal{G}}{\partial t} = 0$                â”‚
â”‚ INV-002 â”‚ Immutable Causal DAG          â”‚ $\mathcal{H}_t \sqsubseteq \mathcal{H}_{t+1}, \quad \text{IsAcyclic}(\text{Lineage}(\sigma)) = \text{true}$ â”‚
â”‚ INV-003 â”‚ Content-Addressable Storage   â”‚ $\text{ID}(O) = \text{Blake3}(\text{Serialize}(O))$                          â”‚
â”‚ INV-004 â”‚ Provider Neutrality           â”‚ $\mathcal{S}_{t+1} = \Phi(\mathcal{S}_t, \text{Intent}(\mathcal{M})) \quad (\mathcal{M} \text{ agnostic})$   â”‚
â”‚ INV-005 â”‚ Zero-Leakage World Sandboxing â”‚ $I(\mathcal{W}_A; \mathcal{W}_B \mid \mathcal{W}_0) = 0$                      â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
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
 â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”     E_1 (ToolCall)      â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”     E_2 (ToolResult)    â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
 â”‚ State S_0    â”‚ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â–º â”‚ State S_1    â”‚ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â–º â”‚ State S_2    â”‚
 â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜                         â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜                         â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
        â”‚                                        â”‚                                        â”‚
        â–¼                                        â–¼                                        â–¼
   LeafHash(E_0)                            LeafHash(E_1)                            LeafHash(E_2)
        â”‚                                        â”‚                                        â”‚
        â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜                                        â”‚
                            â–¼                                                             â”‚
                      NodeHash(0,1)                                                       â”‚
                            â”‚                                                             â”‚
                            â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                                                           â–¼
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
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                              GenOS Modular Crate Topology                              â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚                                     genos-cli                                          â”‚
â”‚                    (CLI binary, user commands, developer UX)                           â”‚
â”‚                                         â”‚                                              â”‚
â”‚                    â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”                         â”‚
â”‚                    â–¼                                         â–¼                         â”‚
â”‚               genos-runtime                             genos-protocol                 â”‚
â”‚         (Execution, Forks, Replay)                 (Tool & Belief Schemas)             â”‚
â”‚          â”‚            â”‚           â”‚                          â”‚                         â”‚
â”‚          â–¼            â–¼           â–¼                          â”‚                         â”‚
â”‚     genos-eval   genos-synaptic  genos-world                 â”‚                         â”‚
â”‚    (QTL, MCTS)    (Plasticity)   (Sandboxing)                â”‚                         â”‚
â”‚          â”‚            â”‚           â”‚                          â”‚                         â”‚
â”‚          â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜                         â”‚
â”‚                       â–¼                           â–¼                                    â”‚
â”‚                   genos-core                  genos-model                              â”‚
â”‚             (Domain Types, Invariants)    (Provider Abstraction)                       â”‚
â”‚                       â”‚                                                                â”‚
â”‚                       â–¼                                                                â”‚
â”‚                   genos-store                                                          â”‚
â”‚             (CAS Storage, Event Store)                                                 â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
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
 â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
 â”‚  agent init  â”‚ â”€â”€â–º Initialize .genos workspace & CAS Merkle storage
 â””â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”˜
        â–¼
 â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
 â”‚   snapshot   â”‚ â”€â”€â–º Freeze immutable base snapshot Ïƒ0 = <G0, S0, W0, H0, B0>
 â””â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”˜
        â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
        â–¼                               â–¼                               â–¼
 â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”                â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”                â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
 â”‚  fork (B_1)  â”‚                â”‚  fork (B_2)  â”‚                â”‚  fork (B_3)  â”‚
 â”‚ Hypothesis 1 â”‚                â”‚ Hypothesis 2 â”‚                â”‚ Hypothesis 3 â”‚
 â””â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”˜                â””â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”˜                â””â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”˜
        â–¼                               â–¼                               â–¼
 â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”                â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”                â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
 â”‚  run (step)  â”‚                â”‚  run (step)  â”‚                â”‚  run (step)  â”‚
 â”‚ Execute Tool â”‚                â”‚ Execute Tool â”‚                â”‚ Execute Tool â”‚
 â””â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”˜                â””â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”˜                â””â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”˜
        â”‚                               â”‚                               â”‚
        â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                                        â–¼
                                 â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
                                 â”‚  agent diff  â”‚ â”€â”€â–º Compare branch state DAGs & world trees
                                 â””â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”˜
                                        â–¼
                                 â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
                                 â”‚ agent merge  â”‚ â”€â”€â–º Cognitive synthesis & belief reconciliation
                                 â””â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”˜
                                        â–¼
                                 â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
                                 â”‚   lineage    â”‚ â”€â”€â–º Verify Merkle DAG provenance & audit log
                                 â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

This lifecycle provides the foundational bedrock for counterfactual reasoning, speculative exploration, automated refactoring, and self-healing agent architectures in GenOS.

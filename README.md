<p align="center">
  <img src="assets/brand/genos-logo.png" width="160" alt="GenOS official logo">
</p>

<h1 align="center">GenOS V3</h1>

<p align="center">
  <strong>Biomimetic Counterfactual Operating System & Runtime for Multi-Agent AI</strong>
</p>

<p align="center">
  Cellular embryogenesis, epistemic stigmergy, deterministic state branching, and cognitive immunity for resilient AI agent fleets.
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue.svg" alt="Apache-2.0 license"></a>
  <img src="https://img.shields.io/badge/Rust-1.88%2B-orange.svg" alt="Rust 1.88 or newer">
  <img src="https://img.shields.io/badge/Node.js-20%2B-green.svg" alt="Node.js 20 or newer">
  <a href="https://github.com/PISSARAW/GenOS/releases/tag/v3.0.0-alpha.1"><img src="https://img.shields.io/badge/release-v3.0.0--alpha.1-blue.svg" alt="GenOS v3.0.0 alpha 1"></a>
</p>

---

## What is GenOS V3?

Traditional AI agent frameworks force workflows along a single, mutable timeline. When a tool call, belief update, or prompt hallucination occurs, the failure propagates downstream, state becomes difficult to reconstruct, and multi-agent coordination quickly devolves into token-saturating message storms.

**GenOS V3** re-architects agentic computation as a **biomimetic, counterfactual operating system**:
- **Agents as Biological Cells:** Agents are not just prompt loops; they are cellular units (`AgentCell`) with an immutable genome, epigenetic chromatin states, metabolic budgets (ATP/tokens), synaptic dendritic trees, and cognitive conscience monitors.
- **Git-like State Branching & Replay:** Snapshot workspace and agent state, fork competing hypotheses across isolated counterfactual worlds, execute in sandboxes, evaluate outcomes, and merge only verified winners.
- **Epistemic Stigmergy:** Agents collaborate like social insects via digital pheromone trails deposited on shared graphs, eliminating expensive inter-agent natural language chatter.
- **Cellular Division & Evolution:** Controlled replication through 5 biological modes (Mitosis, Binary Fission, Budding, Schizogony, Meiosis) while strictly rejecting non-deterministic amitosis.
- **The Evidence Arbiter:** Promotion is gated by explicit tool results, tests, compiler feedback, provenance, and sandbox checks. Missing evidence is a failure; the runtime does not claim AGI or formal proof.

### Current Scope and Non-Goals

GenOS is an orchestration and verification runtime for multi-agent software work. It provides state branching, model routing, memory retrieval, tool execution, provenance, and experimental search strategies.

It is not currently an AGI system. The repository does not provide autonomous model training, a general sensorimotor loop, a learned predictive world model, demonstrated cross-domain generalization, or machine consciousness. Biological terms such as genome, apoptosis, STDP, pheromone, and eureka describe runtime abstractions and heuristics; they are not claims of biological equivalence.

Experimental primitives must expose missing evidence as an error. A successful result means that the registered operation completed with the supplied inputs, not that an agent learned, reasoned causally, or proved a proposition.

---

## Core Pillars of the V3 Architecture

```
                                  +--------------------------------------------------+
                                  |                THE REALITY ARBITER               |
                                  |    (Compiler, Unit Tests, Thermodynamic Gate)    |
                                  +--------------------------------------------------+
                                                           ^
                                                           | Verifies survival
                                                           v
+-------------------------------------------------------------------------------------------------------------------------+
|                                              GENOS RUNTIME & STRATEGY ENGINE                                            |
|                                                                                                                         |
|  +------------------------------+  +-------------------------------+  +----------------------------------------------+  |
|  |     Strategy Dispatcher      |  |    Swarm & Dynamic Org        |  |          Cognitive Immune System             |  |
|  |  78 Strategies / 97 Primitives|  |  - Shannon Entropy Sentinel   |  |  - Molecular Chaperones (JSON Repair)        |  |
|  |  - Fundamentals   - Safety   |  |  - Digital Pheromones (Stigm) |  |  - Phagocytosis (Exosome digestion)         |  |
|  |  - Memory (STDP)  - Swarm    |  |  - Quorum & Brier Consensus   |  |  - Apoptosis (Caspase cascade)               |  |
|  |  - Evolution      - Causal   |  |  - Contact Inhibition Locks   |  |  - Stem Cell Fallback                        |  |
|  +------------------------------+  +-------------------------------+  +----------------------------------------------+  |
+-------------------------------------------------------------------------------------------------------------------------+
                                                           ^
                                                           | Powered by
                                                           v
+-------------------------------------------------------------------------------------------------------------------------+
|                                              NATIVE RUST BIOLOGICAL CRATES                                              |
|                                                                                                                         |
|  [genos-biology]          [genos-reproduction]         [genos-orchestrator]       [genos-genome]         [genos-cell]   |
|  - Embryology (Zygote)    - Mitosis (Attested Fork)    - Conscience State         - Chromatin Locking    - AgentCell    |
|  - HOX Differentiation    - Binary Fission (Scale-Out) - Dissonance Monitoring    - Loci & Alleles       - Organelles   |
|  - Synaptic Plasticity    - Budding (Hayflick Limit)   - Eureka Illumination      - Epigenetics                         |
|  - Glial Pipeline         - Schizogony (MCTS Burst)    - Apoptotic Triggers                                             |
|  - Tissues & Desmosomes   - Meiosis (Crossover)                                                                         |
+-------------------------------------------------------------------------------------------------------------------------+
```

---

## Detailed Capabilities

### 1. Embryogenesis & HOX Gene Differentiation
Agents do not remain in an undifferentiated "zygote" state. They undergo structured developmental biology:
- **Acte 1 : Cleavage & Mitosis (`cleave_zygote`)**: Starts from a single totipotent zygote root and divides into stem-cell clones with full euchromatin (all tools accessible).
- **Acte 2 : HOX Coordinate System (`differentiate_swarm`)**: A spatial morphogenetic gradient assigns architectural responsibilities:
  - `HOX-1 (Head)`: UI / Frontend interfaces.
  - `HOX-2 (Thorax)`: Business logic, backend APIs, and services.
  - `HOX-3 (Tail)`: Persistence, database schema, and storage.
- **Acte 3 : Epigenetic Locking**: Specialization locks non-essential genes into facultative heterochromatin (`developmentally_locked = true`), stripping unused tools to minimize attack surfaces and token waste.
- **Acte 4 : Sculptural Apoptose (`sculpt_architecture_via_apoptosis`)**: Prunes intermediate and redundant cells to carve the final clean software architecture.

### 2. The 5 Biological Division Modes
GenOS implements 5 rigorous cellular division mechanisms ([`crates/genos-reproduction`](file:///c:/Users/Shadow/Documents/GitHub/GenOS/crates/genos-reproduction)):

| Division Mode | Biological Mechanism | GenOS Technical Function |
| :--- | :--- | :--- |
| **Mitosis** | Symmetric duplication with chromosomal spindle alignment | Attested counterfactual fork. Creates twin clones with identical state and budget to explore parallel hypotheses and neutralize LLM stochasticity. |
| **Binary Fission** | Fast prokaryotic division without heavy nucleus | Lightweight scale-out for Map-Reduce tasks. Divides the remaining parent budget equally among workers without heavy metadata. |
| **Budding** | Asymmetric division leaving a scar on the mother cell | Safe delegation to ephemeral workers. Strictly constrained by the **Hayflick Limit** (max buds per agent) to prevent recursive spawn storms. |
| **Schizogony** | Multiple internal nuclear divisions before synchronous burst release | Atomic speculative fan-out for Monte Carlo Tree Search (MCTS). Multiple hypothesis branches evaluate in memory and commit in a single atomic transaction. |
| **Meiosis** | Two-step reductional division with crossing-over (chiasmata), gametic epigenetic reprogramming, and Mendelian segregation | Cellular gametogenesis via `genos evolution division --mode meiosis` generating 4 recombinant haploid gametes (quarter budget, epigenetic demethylation), and sexual amphimixis via `genos evolution crossover` / primitive `breed` between two agent parents, gated by phylogenetic speciation barriers (`--speciation-threshold`). |

> **Anti-Pattern Banned:** **Amitosis** (uncontrolled, non-attested splitting) is rejected by design because it lacks cryptographic replayability and provenance.

### 3. Neurobiology & Synaptic Growth
- **Structural Plasticity:** Axonal terminals and dendritic spines (`DendriticTree`) physically grow (`spine.receptor_density += 0.05`) when repeatedly exercised by successful problem-solving paths.
- **Synaptic Pruning & Sleep Cycles:** Inactive connections are marked by C3 opsonization ("eat-me" signals) and CD47 markers, then engulfed by microglial processors during automated sleep cycles (`sleepCycle.js`), freeing working memory.
- **3-Factor Spike-Timing-Dependent Plasticity (STDP):** Causal pathways are reinforced or depressed in Rust (`crates/genos-biology/src/neurobiology.rs`) and persisted to the SQLite connectome (`synaptic_receptors`, `synaptic_edges`) based on dopaminergic outcome rewards, LTP (long-term potentiation), and LTD (long-term depression).
- **Time Cells & Ebbinghaus Curve:** Chronological memory ordering with contextual workspace isolation and continuous temporal decay modeled by the Ebbinghaus forgetting curve.
- **Unified 768-D Multi-Model Embeddings:** Hybrid vector/BM25 retrieval engine (`embeddingProvider.js`) supporting local Xenova Transformers (`all-MiniLM-L6-v2`), local Ollama (`nomic-embed-text`), and OpenAI (`text-embedding-3-small`), rejecting degenerate zero-vectors and powering Reciprocal Rank Fusion (RRF) with accent-preserving FTS5 tokenization.

### 4. Epistemic Stigmergy & Swarm Intelligence
- **Digital Pheromones (`pheromoneDeposit`, `trailSelection`):** Agents mark code artifacts with digital scents (recruitment, alert, verified). Pheromones experience temporal evaporation, letting the swarm self-organize on hot paths without conversational overhead.
- **Quorum Sensing & Brier-Weighted Consensus:** Collective decision-making supports 1-agent-1-vote quorums or weighted voting calibrated against each agent's historical predictive reliability (**Brier Score**).
- **Contact Inhibition:** Juxtacrine signaling via extracellular matrix locks files being modified, preventing race conditions and concurrent write collisions without heavy distributed locking.
- **Cognitive Drift Sentinel:** Real-time computation of **Shannon Entropy** $H(A)$ across action distributions to detect confusion spikes (erratic tool thrashing) and low-entropy collapse (infinite repetition deadlocks).

### 5. Cellular Immunity & Resilience
- **Molecular Chaperones:** Intercept malformed LLM outputs and repair JSON structures before parsing.
- **Phagocytosis of Exosomes:** Digest and assimilate compressed binary packages across extracellular boundaries.
- **Caspase Apoptosis Cascade:** Controlled destruction of corrupted or runaway agents, logging terminal post-mortem dossiers.
- **Stem Cell Fallback:** If an essential worker is destroyed by an unrecoverable mutation, a pristine stem cell checkpoint is immediately mobilized to restore mission continuity.
- **Cryptobiosis:** Puts agents into deep stasis under severe resource constraints, preserving state until resources return.

### 6. Strategy Registry & Execution Primitives
GenOS ships with a strategy registry and an execution dispatcher (`backend/src/services/strategyExecutionAdapter.js`) covering documented strategies across 7 core lots. Some strategies are experimental and require concrete evidence in their context; an unknown or under-specified primitive fails explicitly rather than returning a simulated success.
1. **Fundamentals:** `snapshot`, `fork`, `vfs_dry_run`, `safe_revert`, `bisect_agent`, `evaluate`.
2. **Memory:** `compile_memory`, `cherry_pick_golden_path`, `search_failures`, `stdp_update`.
3. **Evolution:** `mutate`, `hypermutation`, `breed`, `select`, `pareto_select`, `speciation`, `plasmid_divergent_fork`.
4. **Safety & Resilience:** `circuit_breaker`, `apoptosis`, `quarantine`, `sandbox`, `permission_check`.
5. **Collective Swarm:** `pheromone_deposit`, `trail_selection`, `brier_scores`, `quorum`, `weighted_quorum`.
6. **Temporal & Causal:** `causal_replay`, `mutated_universes`, `causal_rebase`, `provenance`, 3-way merge.
7. **Deep Search & Budget:** `mcts_select` (UCB1), `prune` (recursive Beam Search), `reallocate`, `budget_limit`, `prm_evaluate`.

---

## Repository Map

```text
GenOS/
├── crates/                    # Core Rust Biomimetic Engine (13 Crates)
│   ├── genos-biology/         # Embryology, HOX differentiation, glial, neurobiology (STDP), tissue
│   ├── genos-cell/            # Cellular agent definitions, metabolism, organelles
│   ├── genos-genome/          # Epigenetics, chromatin states, loci, crossover
│   ├── genos-reproduction/    # Mitosis, binary fission, budding, schizogony, meiosis
│   ├── genos-orchestrator/    # Conscience, cognitive dissonance, eureka, task dispatch
│   ├── genos-immune/          # Macrophage phagocytosis, fever, cellular defense
│   ├── genos-signal/          # Juxtacrine, paracrine, endocrine communication mesh
│   ├── genos-store/           # Merkle snapshots, versioned world capsules
│   ├── genos-common/          # Shared traits, errors, and biological interfaces
│   ├── genos-api/             # Native API endpoints
│   ├── genos-cli/             # Native CLI binary (genos)
│   ├── genos-mcp/             # Native biological Model Context Protocol server
│   └── genos-simple-cli/      # User-friendly quick command CLI (g)
├── backend/                   # Node.js Control Plane & Runtime API
│   ├── bin/                   # Runtime binaries (genos-orchestrate, genos-agent-runtime, etc.)
│   ├── proto/                 # Protocol Buffers definitions (lineage.proto)
│   ├── src/
│   │   ├── controllers/       # HTTP REST controllers (memory, tools, arena, genome, workspaces)
│   │   ├── grpc_services/     # gRPC microservices (lineageService.js)
│   │   ├── db/                # SQLite WAL, sqlite-vec 768-D, FTS5 triggers, 67+ tables
│   │   ├── services/          # Memory, embeddings, STDP connectome, sleep cycles, fleet
│   │   │   ├── primitiveHandlers/      # Concrete handlers for all 7 lots
│   │   │   ├── strategyExecutionAdapter.js # Dispatcher for 78 strategies
│   │   │   ├── embeddingProvider.js    # Unified 768-D multi-backend embeddings
│   │   │   ├── budgetCoherenceService.js # 60/40 budget validation & envelope checks
│   │   │   ├── mcpToolRegistry.js      # 239 tools typed dispatcher
│   │   │   └── sleepCycle.js           # Hippocampal consolidation & microglial pruning
│   │   └── strategies/        # Strategy catalog and classification families
│   └── tests/                 # Comprehensive test suite (unit, integration, budget, human gate)
├── mcp/                       # Model Context Protocol server bridge for IDEs & agents
├── integrations/              # IDE extension contracts and integration schemas
├── examples/                  # Standalone executable scenarios
│   └── safe-debugging-demo/   # Zero-token parallel debugging benchmark
├── scripts/                   # Orchestration, code analysis, and maintenance scripts
├── strategies.md              # Detailed catalog of all 78 implemented & experimental strategies
├── runtime_arbiter.js         # The Thermodynamic Reality Arbiter
└── .genos.md                  # Strict code generation & complexity governance rules
```

---

## Quick Start

### Prerequisites
- **Rust:** 1.88 or newer
- **Node.js:** 20.x or 22.x LTS
- **Git**

### 1. Build and Test the Rust Engine

```bash
# Clone the repository
git clone https://github.com/PISSARAW/GenOS.git
cd GenOS
git checkout v3

# Build and verify the biological workspace crates
cargo build --workspace
cargo test --workspace
```

### 2. Start the Backend Control Plane

```bash
cd backend
npm install
npm start
```
The runtime initializes SQLite in WAL mode with `sqlite-vec`, sets up FTS5 BM25 search with triggers, and exposes both the HTTP REST API (port 4000) and the gRPC Lineage service (port 50051).

The `g.cmd` and `g.ps1` wrappers intentionally target the user-friendly
`genos-simple-cli` binary (`g`). The native `genos-cli` binary (`genos`) is
invoked through the Cargo commands above or directly from `target/debug` after
building the workspace; the two CLIs expose different command surfaces.

### 3. Connect via MCP (Model Context Protocol)

GenOS provides an integrated MCP server and tool dispatcher exposing 239 tools to Claude, Cursor, or external agent runtimes:

```bash
cd mcp
npm install
node index.js
```

Available tool types:
- **Strategy Tools:** `genos_strategy_*` (MCTS pruning, 3-way merge, causal rebase, PRM evaluation).
- **Biomimicry Tools:** `genos_biomimicry_*` (stigmergy pheromones, cryptobiosis stasis, chromatin tool locking).
- **CLI Wrappers:** `genos_*` (native rust execution transport).

### 4. Run an Autonomous Orchestration Mission

```bash
node backend/bin/genos-orchestrate.cjs '{"mission": "Refactor authorization layer with zero-downtime canary fork", "background": true}'
```

### 5. Run the Safe Parallel Debugging Demo (Zero Tokens)

```bash
# On Linux / macOS (Bash)
./examples/safe-debugging-demo/run-demo.sh

# On Windows / Cross-Platform (Node.js)
cargo build -p genos-cli
node examples/safe-debugging-demo/run-demo.mjs target/debug/genos
```

---

## Code Governance: The Evidence Arbiter & Promotion Gates

To ensure that autonomous agents do not produce unmaintainable code or collude in hallucinations, GenOS enforces rules checked by [`runtime_arbiter.js`](runtime_arbiter.js) and the backend security services:

1. **Low Cyclomatic Complexity:** Code must remain readable, direct, and testable.
2. **Strict Parameter Limits:** Maximum 3 parameters per function.
3. **SOLID Principles:** Rigid separation of concerns across cellular modules.
4. **Line Bounds:** Source files must not exceed 400 lines without an explicit exemption.
5. **No Architectural Deviations:** Any fundamental pattern change requires an Architecture Decision Record (ADR).
6. **Costly Signaling (Handicap de Zahavi):** Gated by actual runtime compute and token expenditure (minimum 500 tokens for critical evaluations in [`ecology.rs`](crates/genos-biology/src/ecology.rs)), strictly rejecting zero-cost collusion.
7. **Budget Coherence:** Validates mission envelopes and enforces a 60% worker / 40% orchestrator reserve split via [`budgetCoherenceService.js`](backend/src/services/budgetCoherenceService.js).
8. **Human Approval Promotion Gate:** Autonomous Codex deployments and high-impact mutations require explicit, authenticated human approval before branch promotion.

Any generated patch failing these conditions is rejected by the Evidence Arbiter and discarded by the runtime recovery path.

---

## License

GenOS is licensed under the [Apache License 2.0](LICENSE).

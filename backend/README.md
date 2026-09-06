# GenOS Backend & Orchestration Control Plane

The GenOS backend is the core control plane and runtime engine for GenOS V3. It serves dual roles:
1. **REST & gRPC Runtime:** Exposes the comprehensive REST API (Express) and gRPC microservices consumed by the GenOS Studio, CLI, and external agent runtimes.
2. **Cognitive Memory & Biological Strategy Engine:** Houses the STDP synaptic connectome, hybrid vector/lexical search, autonomous orchestration pipelines, budget coherence validators, and the 7-lot execution primitives.

---

## Architecture & Subsystems

```
                                    +-----------------------------------------+
                                    |        GenOS Studio / CLI / MCP         |
                                    +-----------------------------------------+
                                                         |
                                        +----------------+---------------+
                                        | REST (Express) | gRPC (Lineage)|
                                        +----------------+---------------+
                                                         |
+-------------------------------------------------------------------------------------------------------------------+
|                                                 BACKEND RUNTIME                                                   |
|                                                                                                                   |
|  +--------------------------------+  +--------------------------------+  +-------------------------------------+  |
|  |     Autonomous Orchestrator    |  |     Unified Embeddings (768D)  |  |       STDP Synaptic Connectome      |  |
|  |  - Autonomous Plan Service     |  |  - Local Xenova Transformers   |  |  - 3-Factor STDP (Dopamine/LTP/LTD) |  |
|  |  - Strategy Dispatcher (78 str)|  |  - Ollama (nomic-embed-text)   |  |  - Ebbinghaus Forgetting Curve      |  |
|  |  - Budget Coherence (60/40 split) | - OpenAI text-embedding-3-small|  |  - Hippocampal Sleep Consolidation  |  |
|  |  - Human Approval Promotion Gate  | - Null Vector Rejection        |  |  - C3/CD47 Microglial Pruning       |  |
|  +--------------------------------+  +--------------------------------+  +-------------------------------------+  |
|                                                        |                                                          |
|  +-------------------------------------------------------------------------------------------------------------+  |
|  |                                      MCP Tool Registry (239 Tools)                                          |  |
|  |                      Routes tool calls dynamically: Strategy / Biomimicry / CLI                              |  |
|  +-------------------------------------------------------------------------------------------------------------+  |
|                                                        |                                                          |
|  +-------------------------------------------------------------------------------------------------------------+  |
|  |                                         SQLite High-Performance WAL Engine                                  |  |
|  |       - 67+ Normalized Tables  - sqlite-vec 768-D Indexing  - FTS5 BM25 Hybrid Search Triggers - mmap 30GB  |  |
|  +-------------------------------------------------------------------------------------------------------------+  |
+-------------------------------------------------------------------------------------------------------------------+
```

### 1. Persistence & Hybrid Retrieval Engine
- **SQLite in WAL Mode:** Configured with `PRAGMA journal_mode = WAL`, `PRAGMA synchronous = NORMAL`, and `PRAGMA mmap_size = 30000000000` (up to 30 GB memory-mapped I/O) with in-memory temporary tables.
- **sqlite-vec Integration:** Native fast cosine and L2 vector search over 768-dimensional embeddings.
- **FTS5 Virtual Tables:** Automated full-text indexing triggers on `trajectories_fts` and `genome_decisions_fts` with French/accent-preserving query tokenization.
- **Reciprocal Rank Fusion (RRF):** Decoupled vector and BM25 ranking fused at SQL level for resilient hybrid memory search.

### 2. Unified Embedding Provider (`src/services/embeddingProvider.js`)
Normalizes all vector inputs to **768 dimensions** with automatic detection and graceful fallback:
- **Local Xenova Transformers:** In-process CPU embeddings via `@xenova/transformers` (`Xenova/all-MiniLM-L6-v2` projected to 768-D).
- **Ollama:** Local API endpoint with model autodetection (`nomic-embed-text`, etc.).
- **OpenAI:** Cloud embedding endpoint (`text-embedding-3-small`).
- **Safety Gate:** Filters and rejects degenerate zero-vectors to prevent index corruption.

### 3. Neurobiology & Synaptic Memory
- **3-Factor STDP:** Hebbian synaptic weight adjustment modulated by dopaminergic outcome signals, long-term potentiation (LTP), and long-term depression (LTD).
- **Time Cells:** Chronological event ordering with contextual isolation across workspaces.
- **Sleep Cycle & Consolidation (`src/services/sleepCycle.js`):** Scheduled background consolidation of recent hippocampal experiences into long-term trajectories with microglial C3/CD47 synaptic pruning.
- **Epistemic Shield & Amygdala Filter:** Calibrated credibility scoring and cognitive drift sentinels (Shannon Entropy $H(A)$) preventing adversarial prompt gaslighting.

### 4. Strategy Dispatcher & Autonomous Orchestration
- **78 Strategies / 97 Primitives:** Implemented across 7 core functional lots:
  - *Lot 1 Fundamentals:* `snapshot`, `fork`, `vfs_dry_run`, `safe_revert`, `bisect_agent`, `evaluate`.
  - *Lot 2 Memory:* `compile_memory`, `cherry_pick_golden_path`, `search_failures`, `stdp_update`.
  - *Lot 3 Evolution:* `mutate`, `hypermutation`, `breed`, `select`, `pareto_select`, `speciation`.
  - *Lot 4 Safety & Resilience:* `circuit_breaker`, `apoptosis`, `quarantine`, `sandbox`, `permission_check`.
  - *Lot 5 Swarm:* `pheromone_deposit`, `trail_selection`, `brier_scores`, `quorum`, `weighted_quorum`.
  - *Lot 6 Temporal & Causal:* 3-way merge, causal rebase, mutated universes, counterfactual replay.
  - *Lot 7 Search & Budget:* Recursive MCTS branch pruning, UCB1 selection, PRM step evaluation.
- **Budget Coherence (`src/services/budgetCoherenceService.js`):** Enforces a strict 60% worker pool / 40% orchestrator reserve split, preventing token exhaustion and budget overruns.
- **Human Approval Promotion Gate:** High-impact mutations and autonomous promotions require cryptographically signed human approval before merging.

### 5. Unified MCP Tool Registry (`src/services/mcpToolRegistry.js`)
Exposes 239 tools to AI agent runtimes with typed execution routing:
- `strategy`: Handled by `mcpStrategyTools.js`.
- `bio`: Handled by native biomimicry adapters `mcpBioTools.js`.
- `cli`: Dispatched through the local transport layer to `genos` binaries.

---

## Directory Layout

```text
backend/
├── bin/                          # Agent runtime and orchestration binaries
│   ├── genos-agent-runtime.cjs   # Autonomous worker sandbox runtime
│   ├── genos-orchestrate.cjs     # Mission orchestration entrypoint
│   └── genos-apoptosis.cjs       # Apoptosis autopsy generator
├── proto/                        # Protocol Buffers definitions
│   └── lineage.proto             # Lineage tracking & state synchronization
├── src/
│   ├── app.js                    # Express application mounting and security middleware
│   ├── controllers/              # REST controllers (memory, tools, arena, genome, workspaces)
│   ├── db/                       # Database engine, migrations, and seed tools
│   │   ├── index.js              # SQLite connection pool & PRAGMA configurations
│   │   ├── schema.js             # Table setup & FTS5 triggers
│   │   ├── schema-tables-core.js # Core table definitions
│   │   └── seedTools.js          # Preloaded MCP tools registry (239 tools)
│   ├── grpc_services/            # gRPC service implementations (lineageService.js)
│   ├── middleware/               # RBAC, tenant isolation, and anti-CSRF filters
│   ├── routes/                   # Resource routers
│   ├── services/                 # Domain logic and execution pipelines
│   │   ├── autonomousOrchestrationService.js # Autonomous team coordination
│   │   ├── budgetCoherenceService.js         # Token & compute budget validator
│   │   ├── embeddingProvider.js              # Unified 768-D multi-backend embeddings
│   │   ├── mcpToolRegistry.js                # Dynamic MCP tool dispatcher
│   │   ├── sleepCycle.js                     # Hippocampal replay & microglial pruning
│   │   ├── strategyExecutionAdapter.js       # 7-lot strategy dispatcher
│   │   └── primitiveHandlers/                # Concrete primitive implementations
│   └── strategies/               # Strategy catalog and classification families
├── tests/                        # Verification and regression test suite
└── server.js                     # HTTP & gRPC bootstrap entrypoint
```

---

## Getting Started

### Prerequisites
- **Node.js:** 20.19+ or 22.12+ LTS
- **C/C++ Build Tools** (for compiling native `sqlite3` and `sqlite-vec` bindings)

### Installation
```bash
cd backend
npm install
```

### Running the Server
```bash
# Start in production mode
npm start

# Or with live-reload
npm run dev
```

The server listens by default on:
- **HTTP REST API:** `http://localhost:4000` (override via `PORT`)
- **Health Probe:** `GET http://localhost:4000/api/health`
- **gRPC Service:** `0.0.0.0:50051` (override via `GRPC_PORT`)

### Bootstrap Credentials
On first boot, the backend initializes `genos.db` (67+ tables), applies migrations, and creates a bootstrap administrator token. The one-time token is output to the console:
```text
[GenOS Bootstrap] Generated one-time administrator token:
genos_sk_admin_...
```
- Set `GENOS_ADMIN_TOKEN` to define a static token.
- Set `GENOS_ADMIN_PASSWORD` to configure the default `admin` user password.

---

## Environment Variables

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `PORT` | `4000` | HTTP REST API listening port |
| `GRPC_PORT` | `50051` | gRPC Lineage service listening port |
| `GENOS_DB_PATH` | `backend/genos.db` | Absolute or relative path to SQLite database file |
| `GENOS_ADMIN_TOKEN` | *Generated* | Administrator API token |
| `GENOS_ADMIN_PASSWORD` | `genos-admin` | Default password for local `admin` account |
| `EMBEDDING_PROVIDER` | `auto` | Preferred provider: `auto`, `xenova`, `ollama`, `openai` |
| `OLLAMA_HOST` | `http://127.0.0.1:11434` | Endpoint URL for local Ollama instances |
| `OPENAI_API_KEY` | *None* | API key for OpenAI model & embedding fallbacks |

---

## Verification Test Suite

The test suite validates database integrity, vector search, biological primitives, and orchestration safety:

```bash
# Run the complete backend verification suite (53 assertions)
npm test

# Run specialized safety & coherence tests
node tests/test_runtime_budget_and_influence.js
node tests/test_human_approval_promotion_gate.js
node tests/test_intermediate_state_persistence.js
node tests/test_worker_failure_recovery.js
```

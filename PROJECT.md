# Project: GenOS Studio Autonomous Evolution & Comprehensive Audit

## Architecture Overview
GenOS Studio is the central operational control plane for GenOS autonomous AI agent swarms and multi-agent experiments.
The architecture consists of:
1. **Backend (`backend/`)**: Modular Node.js/Express server in `backend/src/` with SQLite persistence (`database.js`, `genos.db`), REST APIs, WebSocket/SSE real-time telemetry streaming, RBAC auth middleware, MCP tool proxy & safety circuit breakers, and 7 core innovation engines (Arena, MCP Sandbox, Swarm Entropy, Resilience, Genome Crossover, Memory Vector Search, Workspace Causal Bisection). (ALL files <= 350 lines, <= 3 params/func).
2. **Frontend Studio (`studio/`)**: React + TypeScript + Vite SPA. Built strictly with a GitHub-inspired flat design system (dark palette, borders `#30363d`, bg `#0d1117`/`#161b22`, text `#c9d1d9`, flat badges, ZERO emojis, ZERO CSS gradients, ALL files <= 368 lines). Connects to backend REST/SSE endpoints via centralized typed API client, with rich interactive views for all 7 core modules.
3. **Telemetry Observer Agent (`backend/src/services/telemetryObserver.js` & `.agents/telemetry_observer_5/`)**: Dedicated observer stream capturing swarm message passing, state transitions, tool invocations, and health metrics, broadcasting live without impeding operational agents.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Exploration & Architecture Audit | Full audit of backend, database, security, frontend components, aesthetic compliance & 28 R1 innovation blueprints | none | DONE |
| 2 | Telemetry Observer Deployment | Dedicated observer agent stream, backend event bus, telemetry API, live UI telemetry feed | M1 | DONE |
| 3 | Backend & Algorithmic Innovation Implementation | Complete REST endpoints for 7 innovation modules, SQLite WAL mode, security hardening, automated test suite | M1, M2 | DONE |
| 4 | Frontend Co-Evolution & UX Modernization | Unmocking, GitHub flat aesthetic (0 emoji, 0 gradient), 7 rich interactive module views, typed API wiring | M2, M3 | DONE |
| 5 | Verification, Adversarial Testing & Forensic Audit | Multi-tier test suite (180+ tests), static linter, Reviewer approvals (2/2), Challenger stress tests (100%), and Forensic Auditor CLEAN verdict | M3, M4 | DONE |

## Interface Contracts
### Core Innovation Endpoints
- `GET /api/arena/tournament`, `POST /api/arena/run`, `GET /api/arena/pareto` -> Arena multi-solver tournament & Pareto frontier analysis
- `POST /api/tools/dry-run`, `GET /api/tools/:name/schema`, `GET /api/tools/metrics` -> MCP Dynamic JSON schema, VFS dry-run simulation & micro-telemetry
- `GET /api/swarm/metrics`, `GET /api/swarm/topology`, `POST /api/swarm/proposals`, `POST /api/swarm/vote` -> Swarm entropy, cognitive drift, live topology graph & quorum
- `POST /api/resilience/apoptosis`, `POST /api/resilience/cryptobiosis/freeze`, `POST /api/resilience/cryptobiosis/thaw` -> Adaptive apoptosis autopsy & instant cryptobiosis state
- `GET /api/genome/phylogeny`, `GET /api/genome/alleles`, `POST /api/genome/crossover` -> Agent phylogenetic mutation tree & genetic crossover synthesizer
- `POST /api/memory/search`, `POST /api/memory/cherry-pick`, `POST /api/memory/counterfactual` -> Hybrid vector memory search, golden path synthesis & What-If replay
- `GET /api/workspaces/diff`, `POST /api/workspaces/bisect`, `POST /api/workspaces/rollback` -> Multi-branch timeline diff, O(log N) causal bisection & atomic rollback

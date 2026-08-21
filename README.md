# GenOS

GenOS is a research project for autonomous AI agents, but the code in this repository also contains a concrete product: a full-stack GenOS Studio used to observe, deploy, compare, and manage agent swarms in a GitHub-like control plane.

This repository is not only a theoretical runtime. It includes:

- a Rust-based GenOS runtime and core concepts for agent genomes, world isolation, lineage, snapshots, and counterfactual execution
- a Node.js backend with SQLite persistence, auth, telemetry, and REST endpoints
- a React + TypeScript frontend called GenOS Studio that exposes the operational UI

The site in the code is a live dashboard for agent operations, not just a documentation shell.

## What the site actually does

From the current frontend and backend, the application is designed to:

- monitor an active swarm of agents and their status
- stream live telemetry through SSE from the backend
- deploy new agents and multi-agent "Trinity" configurations
- inspect agent lineage, genome graphs, and causal history
- run experiments and solver tournaments
- test MCP tools and sandbox them before execution
- review swarm quorum, consensus, and topology
- manage resilience actions such as apoptosis, freeze, and restore
- search memory, cherry-pick successful trajectories, and replay counterfactual outcomes
- compare workspace timelines, bisect regressions, and restore prior snapshots
- provide a command terminal and emergency kill switches

In other words, the app behaves like a control room for GenOS experiments and agent operations.

## The seven concrete studio modules

The current UI is organized around the following modules, matching the code in the frontend:

1. Arena & Solvers
   - tournament execution, Pareto frontier inspection, solver comparison
2. MCP Sandbox & Tools
   - dry-run tool execution, schema introspection, circuit breaker toggling
3. Swarm Monitor & Quorum
   - topology, consensus, voting, metrics
4. Biology & Resilience
   - apoptosis and cryptobiosis freeze/thaw workflows
5. Genetics & Genome
   - phylogenetic views, allele exploration, crossover synthesis
6. Memory & Experience
   - memory search, golden-path synthesis, counterfactual replay
7. Workspace Timeline & Diff
   - snapshot comparison, causal bisection, rollback planning

The app also includes system-level surfaces like the dashboard, agent deployment workflow, workflow alerts, live neural matrix, and a God Mode terminal.

## Architecture of the repository

The codebase is split between research/runtime code and the operational studio layer.

```text
GenOS/
├── crates/              Rust runtime and core primitives
├── backend/             Express + SQLite API for the studio
├── studio/              React + TypeScript UI for the control plane
├── docs/                design docs, ADRs, technical notes
├── examples/            runnable demos and research scenarios
├── integrations/        MCP and external integrations
├── python/              Python SDK/provider placeholders
├── web/                 console/web-oriented assets
├── spec/                schemas and genome specs
└── README.md
```

The backend exposes REST endpoints such as:

- /api/agents, /api/status, /api/health, /api/telemetry
- /api/experiments, /api/swarm, /api/arena, /api/resilience
- /api/tools, /api/memory, /api/workspaces, /api/lineage
- /api/security and /api/halt for emergency controls

The frontend is configured to call the backend at http://localhost:4000 via the centralized client in the studio app.

## The actual product shape

The repository implements a project with two layers:

- a research/runtime substrate for counterfactual AI agents and branch isolation
- a live observability and experimentation GUI for that substrate

The delivered experience in the code is a GitHub-inspired operational dashboard for agent fleets, not merely a conceptual framework.

## Quick start

### 1) Start the backend

```bash
cd backend
npm install
npm start
```

The backend boots a SQLite database and serves the API on port 4000.

### 2) Start the studio frontend

```bash
cd studio
npm install
npm run dev
```

Then open the Vite app in the browser. The API client is configured to talk to the backend on http://localhost:4000.

### 3) Use the site

The main flows available in code are:

- deploy agents or trinity deployments
- inspect active agents and lineage
- trigger experiments and solver tournaments
- test MCP tools in a sandbox
- freeze or resume resilience states
- review workspace diffs and rollbacks
- access telemetry and terminal actions

## Status

This repo is still in a research/pre-alpha stage, but the site is materially implemented and organized around operational workflows rather than only conceptual architecture.

The code currently reflects a real dashboard application with a backend, live telemetry, workflow modules, agent management, resilience controls, and experiment tooling.

## Related documentation

- [PROJECT.md](PROJECT.md)
- [docs/README.md](docs/README.md)
- [docs/AGENT_PRIMITIVES.md](docs/AGENT_PRIMITIVES.md)
- [docs/COUNTERFACTUAL_OS.md](docs/COUNTERFACTUAL_OS.md)
- [CHANGELOG.md](CHANGELOG.md)
- [CONTRIBUTING.md](CONTRIBUTING.md)

## License

This project is licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE).

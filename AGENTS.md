# AGENTS.md

Guidance for coding agents working in this repository. Read this before making changes.

## What this repository is

GenOS V3 is a counterfactual, biomimetic runtime for multi-agent execution: branches,
snapshots, budgets, evidence gates and recovery. It is a polyglot monorepo:

- `crates/` — Rust workspace (runtime core: cell, biology, orchestrator, store, MCP, CLI).
- `backend/` — Node.js control plane (Express REST + gRPC, SQLite WAL, MCP tool registry).
- `mcp/` — stdio MCP server (JavaScript) bridging MCP clients to the backend/CLI.
- `docs/` — technical documentation, written in French.
- `examples/`, `scripts/`, `integrations/`, `shared/`, `spec/`.

The system's core rule: a successful transport is **not** proof of a valid decision.
Never fake success; respect the evidence/promotion gates.

## Prerequisites

- Rust 1.88+ (stable toolchain)
- Node.js 20.19+ or 22.12+ (with C/C++ build tools for native `sqlite3`/`sqlite-vec`)
- Python 3 (required by the code-quality gate)

## Setup

```bash
npm ci
npm ci --prefix backend
npm ci --prefix mcp
cargo build --workspace
cp .env.example .env
```

Fill `.env` with local values. **Never commit `.env`, secrets, `*.db` or generated artifacts.**

## Definition of done — run before finishing

```bash
python scripts/ci/check_code_quality.py   # or: npm run check:code-quality
npm test
cargo test --workspace
```

Targeted verification:

```bash
cargo test -p <crate>                        # single Rust crate
npm --prefix backend run test:validation     # backend safety/coherence suite
npm --prefix backend run test:mcp            # MCP lease/dispatch enforcement
npm --prefix backend run test:grpc           # gRPC services
npm --prefix backend run test:quality        # quality suite
```

There is no ESLint/Prettier config in this repo. Do not add a new linter/formatter config.

## Code style — enforced by a gate

These rules come from `.genos.md` and are enforced by `scripts/ci/check_code_quality.py`
and the `.githooks/pre-commit` hook (staged code is checked):

- Files: max **400 lines**.
- Functions: max **3 parameters**.
- Cyclomatic complexity: max **10**.
- SOLID boundaries; any architectural change requires an ADR in `docs/adr/`.

Violations are rejected. Do **not** add inline annotations or comments to bypass the gate.
Documentation files are outside its scope.

## How to run

- **Backend:** `npm --prefix backend start` → HTTP `http://localhost:4000`, gRPC `127.0.0.1:50051`.
  Health probes: `/healthz`, `/readyz`, `/livez`. Bootstrap admin token is printed on first boot.
- **Rust CLI:** `cargo run -p genos-cli -- --help`. Operator shim: `.\g.ps1` (PowerShell) / `g.cmd`.
- **MCP server (stdio):** `node mcp/index.js` from the repository root. It reads
  `shared/toolDefinitions.json` and `backend/src/services/*`, so it must run from the repo root.
  Visible tools are controlled by `GENOS_MCP_LEASE` and `GENOS_MCP_DISABLED_TOOLS`
  (see `docs/OUTILS_MCP.md`). A ready-to-use client config is in `.mcp.json`.
- **Orchestration mission:** `node backend/bin/genos-orchestrate.cjs '{"mission":"...","background":true}'`
- **Safe parallel debugging demo:** `node examples/safe-debugging-demo/run-demo.mjs target/debug/genos`

## Conventions

- **Commits:** first line must start with an uppercase bracketed tag, e.g. `[FIX] ...`,
  `[FEAT] ...`, `[REFACTOR] ...`, `[DOC] ...`. Enforced by `.githooks/commit-msg`.
- **Docs:** French, under `docs/`, following the 10-section template in `docs/README.md`.
- **Architecture facts:** keep the README/docs claims aligned with what is actually implemented;
  do not present conceptual or biological metaphors as working features.
- **Security:** paths and MCP arguments are validated at runtime; do not bypass the sandbox,
  path confinement, leases or the circuit breaker.

## Where to look first

- Product overview: `README.md`
- Documentation index: `docs/README.md`
- Backend internals: `backend/README.md`
- MCP tools, leases and enforcement: `docs/OUTILS_MCP.md`
- Agent runtime model: `docs/RUNTIME_AGENTIQUE.md`
- Evidence and promotion gates: `docs/EPISTEMOLOGIE_EVIDENCE.md`

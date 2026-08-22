# GenOS Studio

GenOS Studio is the browser-based control plane for the GenOS project. It is the operational UI that wraps the backend APIs and exposes the live functionality implemented in the codebase.

## What this frontend does

The current app is a GitHub-inspired dashboard for:

- monitoring active agents and swarm status
- viewing live telemetry and event streams
- deploying agents and trinity workflows
- inspecting swarm lineage and agent DNA
- launching experiments and solver tournaments
- testing tool sandboxes and MCP tools
- managing resilience actions and kill switches
- reviewing workspaces, diffs, snapshots, and rollback candidates
- exploring memory, genomes, and trajectories

The app is organized around seven modules visible in the UI:

- Arena & Solvers
- MCP Sandbox & Tools
- Swarm Monitor & Quorum
- Biology & Resilience
- Genetics & Genome
- Memory & Experience
- Workspace Timeline & Diff

## Stack

- React + TypeScript + Vite
- Zustand for UI state
- Live telemetry via SSE
- centralized typed API client against the local backend

## Local run

From the repository root:

```bash
cd backend
npm install
npm start
```

Then in another terminal:

```bash
cd studio
npm install
npm run dev
```

The frontend expects the backend to be available at http://localhost:4000.

## Agent runtime adapter

Deploying an agent registers its mission in Studio and starts the bundled runtime adapter automatically. The default is `backend/bin/genos-agent-runtime.cjs`, which reads one length-prefixed protobuf mission from stdin and emits length-prefixed protobuf events on stdout. The bundled runtime also accepts the legacy JSON mission format.

To use a custom executor, override the default explicitly:

```bash
GENOS_AGENT_EXECUTOR=/absolute/path/to/genos-agent-runtime npm start
```

Events may include `eventType`, `action`, `detail`, `status`, `currentTask`, `severity`, and `payload`. If the custom variable is omitted, Studio uses the bundled runtime and agents no longer remain idle merely because the environment was not configured.

## Important note

This is not a generic starter template; it is the actual GenOS Studio interface implemented for the project. The repository contains both the underlying GenOS runtime concepts and a live operational dashboard for them.

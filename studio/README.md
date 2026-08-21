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

## Important note

This is not a generic starter template; it is the actual GenOS Studio interface implemented for the project. The repository contains both the underlying GenOS runtime concepts and a live operational dashboard for them.

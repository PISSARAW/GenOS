# Changelog

All notable changes to GenOS are documented in this file.

## [Unreleased]

### Added

- Open source project documentation, contribution guidance, governance, security policy, support policy, and GitHub community templates.
- A public documentation index and examples catalogue.
- ADR-0021, defining OpenAI Codex as a native MCP client target while keeping Codex product integration separate from the OpenAI model provider.
- The `genos-protocol` crate, `genos-mcp` server, ten canonical MCP tools, STDIO and HTTP transport tests, and project-scoped Codex configuration.
- A checksummed, four-platform CLI prerelease workflow.
- A local Docker Compose stack for GenOS Studio with persistent storage and health checks.

### Changed

- Reframed the README around reproducible counterfactual agent execution and the project's current pre-alpha boundary.
- Clarified the project's authorship, use of AI assistance, and maintainer responsibility.
- Bound alpha artefacts to a verified tag commit and matching Cargo version before publication.
- Replaced embedded Studio credentials with environment or random one-time bootstrap tokens.
- Limited the local Compose stack to one explicit bind-mounted workspace with safe Codex defaults.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project intends to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html) once public compatibility guarantees begin. During pre-alpha development, breaking changes may occur in any release.

## v0.0.1-alpha.1 - 2026-08-22

First tagged prerelease, published as a
[GitHub release](https://github.com/PISSARAW/GenOS/releases/tag/v0.0.1-alpha.1)
with checksummed CLI archives for four platforms.

## 0.0.1 development milestone - 2026-08-15

### Added

- Typed agent genomes, state, memories, beliefs, evidence, tool outputs, artifacts, snapshots, events, and lineage.
- Snapshot creation, restoration, structural diffing, checkpoints, and event replay.
- Isolated directory and Git worktree world providers.
- Agent-world capsules with fork, checkpoint, pause, resume, and integrity operations.
- Counterfactual experiment workflows for code, temporal simulation, incidents, science, security co-evolution, heredity, reproducibility, causal replay, and bug investigation.
- Multi-objective evaluation, constraints, Pareto selection, cognitive merge, and budgeted branch evolution.
- A Rust CLI, portable JSON Schemas, architecture decision records, tests, and runnable examples.

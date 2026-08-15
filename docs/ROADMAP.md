# GenOS roadmap

This roadmap communicates direction, not a delivery promise. Priorities may change as the architecture is tested against real integrations. Accepted ADRs and research prototypes do not by themselves establish a stable public contract.

## Current: 0.0.1 — executable foundations

The repository currently demonstrates:

- typed genomes, state, beliefs, memories, evidence, snapshots, events, and lineage;
- isolated directory and Git worktree worlds;
- snapshot, restore, fork, diff, replay, and capsule lifecycle operations;
- deterministic counterfactual experiments and multi-objective evaluation;
- cognitive merge, branch evolution, heredity, and causal replay research workflows;
- portable schemas, architecture decisions, and cross-platform isolation demos.

The exact implementation boundary is maintained in [ADR implementation status](adr/IMPLEMENTATION_STATUS.md).

The provider-neutral `v1alpha1` protocol and MCP adapter are available for
OpenAI Codex and other MCP clients over local STDIO or stateless Streamable
HTTP. Their schemas and transport behavior are covered by executable tests.

## Target: 0.1.0 — coherent developer preview

The goal of `0.1.0` is one documented, reliable path from an agent-world checkpoint to evaluated counterfactual branches and a reviewed successor state.

### Runtime

- Make the atomic capsule the default orchestration boundary.
- Harden failure recovery across snapshots, worlds, event streams, and budgets.
- Define cancellation, timeout, expiration, cleanup, and partial-result semantics.
- Validate synthesized knowledge on a fresh branch before parent application.

### Public interfaces

- Stabilize the canonical agent primitives and manifest formats for the `0.1.x` line.
- Expand the HTTP API beyond health checks.
- Exercise the versioned lifecycle tool schemas and MCP server against released Codex clients.
- Define authentication and session semantics before supporting MCP beyond a trusted local environment.
- Define provider contracts and add at least one documented external model integration.
- Publish installation artifacts or a supported source-install workflow.

### Persistence and portability

- Add durable transactional storage for long-running experiments.
- Define compatibility and migration rules for snapshots, events, capsules, and schemas.
- Support explicit restoration modes for filesystems, processes, environments, and services.
- Verify import and export across machines.

### Project quality

- Establish release automation, signed checksums, and dependency auditing.
- Add end-to-end tests for the supported developer-preview workflow.
- Add benchmarks for snapshot, fork, diff, replay, and artifact deduplication.
- Document the security and trust model for command execution and world providers.

### Exit criteria

`0.1.0` is ready when:

1. A new contributor can complete the primary workflow from the README on Linux, macOS, or Windows.
2. The workflow can be repeated from persisted artifacts without a live model call.
3. Branch state, files, events, and budgets remain isolated under success, failure, cancellation, and retry.
4. Public manifests validate against versioned schemas with documented migration behavior.
5. CI covers formatting, linting, tests, and the primary end-to-end scenario.
6. Known production limitations and security boundaries are explicit.

## Beyond 0.1

Potential later work includes remote execution transports, distributed transaction coordination, richer provider integrations, a usable web console, experiment observability, policy-driven tool sandboxes, and scalable artifact backends.

These items are intentionally not assigned to a release until the `0.1.0` developer workflow is stable.

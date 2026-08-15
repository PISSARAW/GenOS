# GenOS documentation

This index separates user-facing concepts, normative specifications, implementation status, and design history.

## Start here

- [Project README](../README.md) — overview, quick start, architecture, and status
- [Agent primitives](AGENT_PRIMITIVES.md) — the ten canonical lifecycle operations
- [Counterfactual OS](COUNTERFACTUAL_OS.md) — integrated branch execution model
- [Protocol interoperability and Codex](adr/ADR-0021-protocol-interoperability-codex.md) — MCP boundary and product/provider separation
- [Examples catalogue](../examples/README.md) — runnable demonstrations by topic

## Concepts and specifications

- [Genome specification](../spec/GENOME_SPEC.md) — normative genome structure and compatibility
- [Phenotype and divergence](phenotype.md) — observed behavior, heredity experiments, and inferred traits
- [JSON Schemas](../spec/) — portable serialized contracts
- [Project primitive matrix](PROJECT_PRIMITIVE_MATRIX.md) — canonical primitives exercised by each project

## Planning and status

- [Roadmap](ROADMAP.md) — planned milestones and release criteria
- [ADR implementation status](adr/IMPLEMENTATION_STATUS.md) — executable coverage and known gaps

## Architecture decisions

The [`adr/`](adr/) directory records accepted design decisions. An accepted ADR describes intended architecture; it is not evidence of implementation unless the implementation status and tests say so.

## Project policies

- [Contributing](../CONTRIBUTING.md)
- [Security](../SECURITY.md)
- [Support](../SUPPORT.md)
- [Governance](../GOVERNANCE.md)
- [Code of Conduct](../CODE_OF_CONDUCT.md)

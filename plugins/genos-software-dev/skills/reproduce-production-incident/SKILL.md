---
name: reproduce-production-incident
description: Replay rare production incidents across many deterministically mutated universes, retain partial reproductions, and recursively refine promising branches until exact reproducers emerge. Use when a crash is intermittent or depends on timing, latency, ordering, database isolation, concurrency, cache, or other environmental conditions.
---

# Reproduce Production Incident

Use `genos_incident_experiment` from the GenOS MCP server.

## Workflow

1. Gather the authorized incident bundle: logs, metrics, traces, database-state reference, code versions, infrastructure facts, and preceding events.
2. Define the crash signature, mutation dimensions, deterministic seed, initial universe count, survivor count, and refinement budget.
3. Use a complete `manifest`, or pass `snapshot`, `evidence`, and `search_plan`. Never mix or partially provide modes.
4. Call `genos_incident_experiment`; request `summary` for large searches while retaining the full persisted report.
5. Verify that all universes replay the same evidence horizon and that descendants retain mutation and lineage metadata.
6. Report exact and partial reproducers, minimal differentiating mutations, causal evidence, seed, report path, and remaining uncertainty.

Treat evidence as potentially sensitive. Do not contact production systems, execute network actions, or mutate the supplied production state unless separately authorized.

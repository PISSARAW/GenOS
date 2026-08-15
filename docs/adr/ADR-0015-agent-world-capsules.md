# ADR-0015: Version agent-world capsules

## Status
Accepted

## Context

Git versions a filesystem tree and its ancestry. A long-lived counterfactual
branch changes more than files: the agent accumulates memories and beliefs,
uses tools, consumes budgets, starts processes, changes environments, and may
interact with services.

Treating the repository as the whole world makes restoration incomplete.
Treating arbitrary live process state as universally portable is also
unrealistic.

## Decision

The versioned unit in Counterfactual OS is an **agent-world capsule**. A capsule
checkpoint atomically references:

- genome and agent-state snapshots;
- filesystem or workspace snapshot;
- event cursor and branch-local tool outputs;
- runtime, dependency, tool, permission, and environment manifests;
- process topology and restoration strategy;
- isolated or simulated service dependencies;
- resource budget, lease, and lifecycle state;
- lineage and integrity digests.

World components declare one of three restoration modes:

- `snapshot`: content-addressed state can be restored directly;
- `reconstruct`: state is recreated deterministically from a manifest and
  recorded inputs;
- `external`: the dependency cannot be captured and must be pinned, simulated,
  forked by its provider, or explicitly accepted as nondeterministic.

Raw process memory, open sockets, credentials, and external databases are not
assumed portable. Runtime-specific opaque checkpoints may be referenced, but
their compatibility constraints must be recorded.

Long-lived branches have explicit lifecycle states: `created`, `running`,
`paused`, `completed`, `failed`, `cancelled`, and `budget_exhausted`. Pausing or
resuming creates auditable events. Checkpointing does not terminate a branch.

## Consequences

- A branch can live for minutes or months and produce multiple checkpoints.
- Restore quality can be assessed component by component instead of claimed
  globally.
- External dependencies remain visible sources of nondeterminism.
- Content-addressed components can be deduplicated across sibling worlds.
- Agent and world snapshots cannot be independently advanced inside one atomic
  capsule checkpoint.


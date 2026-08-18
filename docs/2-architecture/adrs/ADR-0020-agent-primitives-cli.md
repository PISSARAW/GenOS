# ADR-0020: Canonical Agent Primitives CLI

- Status: Accepted and implemented
- Date: 2026-08-15

## Context

GenOS already exposes the required mechanisms, but they are distributed across
agent, snapshot, capsule, experiment, replay, and diff command groups. That
organization reflects implementation domains rather than the process model a
user needs.

The durable abstraction is an agent-world process with versioned state. Its
command surface should therefore resemble Git, Docker, and Unix process
primitives rather than a collection of model-framework operations.

## Decision

The canonical CLI is the following ten-command surface:

```text
agent init       agent snapshot   agent restore
agent fork       agent mutate     agent run
agent diff       agent merge
agent lineage    agent replay
```

The commands delegate to existing domain engines:

| Primitive | Domain operation |
| --- | --- |
| `init` | Initialize local durable stores |
| `snapshot` | Checkpoint an atomic agent-world capsule |
| `restore` | Materialize a paused capsule's world and resume it |
| `fork` | Fork one capsule into isolated agent-world branches |
| `mutate` | Derive a genome through explicit trait deltas |
| `run` | Execute one bounded command in a capsule world |
| `diff` | Compare logical agent snapshots structurally |
| `merge` | Run evidence-aware cognitive merge |
| `lineage` | Walk the persisted lineage DAG |
| `replay` | Reconstruct state from the event stream |

`run` is budgeted. Each attempted execution requires a running capsule with a
live isolated world and at least one remaining step. A completed execution,
including one with a non-zero process exit status, consumes exactly one step,
reseals the capsule, and persists it. Provider failures before execution do not
consume a step.

## Compatibility

The existing top-level command groups remain supported. They are the advanced
and low-level interface; the `agent` primitives are the canonical lifecycle
interface. `agent fork-from-snapshot` remains available for logical state-only
forking, whereas `agent fork` always forks the atomic agent-world capsule.

## Consequences

- Automation can depend on a small stable vocabulary.
- Lifecycle operations preserve the agent-world atomicity invariant.
- New model providers do not require new lifecycle commands.
- Low-level snapshot and world operations remain independently testable.
- A future remote runtime can implement the same primitives without changing
  their semantics.

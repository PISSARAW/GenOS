# ADR-0019: Integrated Agent Genome + Counterfactual OS Cycle

## Status
Accepted

## Context
Genome evolution, agent-world capsules, counterfactual forks, experience
packets, and cognitive merge are insufficient as disconnected facilities. A
generation needs one orchestration boundary that advances the parent from S0 to
S1 without leaking temporary worlds or losing lineage.

## Decision
GenOS executes a generation as one ordered cycle:

1. checkpoint the parent agent and world as S0;
2. create lineaged, isolated agent-world fork capsules from S0;
3. run each fork and collect one branch-bound experience packet;
4. checkpoint and terminate every temporary fork world;
5. reconcile all experiences through the Cognitive Merge Engine;
6. apply the reviewed merge to the S0 agent state;
7. persist the resulting agent-world capsule as S1 with relation `merge`.

Fork lineage identifiers use this stable form:

```text
agent://<agent-name>/generation/<generation>/fork/<generation>-<label>
```

An experience packet is rejected if its branch identifier differs from the
capsule that produced it. Fork labels must be URI-safe and unique within the
generation. Runner failure triggers best-effort termination of every created
fork before the cycle returns an error.

The parent world is not replaced by a branch world during cognitive merge. S1
inherits the checkpointed parent world and the merged agent state; adopting a
complete branch world remains an explicit selection operation.

## Consequences

- S0, every temporary fork, its terminal checkpoint, and S1 are independently
  inspectable.
- Knowledge can cross branches only through typed experience and cognitive
  merge, never through shared mutable state.
- Generation and fork identity remain stable across storage and reporting.
- A failed experimental branch cannot silently contaminate or replace the
  parent world.

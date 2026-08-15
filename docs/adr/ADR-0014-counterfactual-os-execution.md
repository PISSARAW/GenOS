# ADR-0014: Counterfactual branches are isolated agent executions

## Status
Accepted

## Context

Asking one model to describe several alternatives keeps every alternative in a
single context, memory, event stream, and world. This is useful reasoning, but
it is not a counterfactual experiment: one alternative can influence another,
failures are not isolated, and no branch can be independently resumed.

GenOS already has agent-snapshot forks and world forks. Counterfactual OS must
bind them into one atomic execution contract.

## Decision

A counterfactual fork creates a branch capsule containing:

- a cloned agent snapshot with a fresh agent and branch identity;
- an isolated world derived from the same world snapshot;
- a branch-local event stream and causality chain;
- an independent execution budget and cancellation boundary;
- a declared hypothesis and intervention;
- pinned runtime, model, tool, and permission manifests.

All sibling capsules reference the same root snapshot and correlation id.
Creating only an agent fork or only a world fork is not a complete
Counterfactual OS branch.

Branches execute independently and may finish, fail, time out, or be resumed
without mutating siblings or the root. Evaluation uses a shared protocol.

`MERGE` is not a blind union of mutable states. V0 supports:

1. `select`: continue from one winning branch while retaining every sibling;
2. `synthesize_knowledge`: create a provenance-bearing proposal from findings
   across branches, followed by validation on a fresh branch.

A future semantic state merge must define explicit reconciliation rules for
beliefs, memories, policies, artifacts, and world changes before it can be
considered safe.

## Consequences

- Counterfactual branches are inspectable and resumable agents, not prompt
  completions.
- Cross-branch leakage is an invariant violation.
- Partial failure does not invalidate successful siblings.
- Synthesis cannot silently copy contradictory beliefs or incompatible world
  changes into the selected branch.


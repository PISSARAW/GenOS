# ADR-0007: Defer Cognitive Merge in V0 [OBSOLETE - Remplacé par ADR-0016]

## Status
[OBSOLETE - Remplacé par ADR-0016]

## Context
Belief and memory reconciliation is the hardest part of agent branching.

## Decision
V0 used winner-takes-branch selection. ADR-0016 introduces a conservative,
evidence-based cognitive merge while preserving winner selection as an option.

## Consequences
- Faster path to a real reproducible fork workflow.
- Merge complexity postponed to later research milestones.

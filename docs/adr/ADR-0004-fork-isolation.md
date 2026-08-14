# ADR-0004: Fork Isolation Semantics

## Status
Accepted

## Context
Each fork must inherit a common parent snapshot but remain operationally independent.

## Decision
Fork allocates unique branch ID, world ID, budget, and event stream per child.

## Consequences
- Partial failures become observable per branch.
- Deterministic branch-level audit trails.

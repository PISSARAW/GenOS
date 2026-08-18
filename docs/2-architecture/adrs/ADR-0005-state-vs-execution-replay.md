# ADR-0005: Distinguish State Replay and Execution Replay

## Status
Accepted

## Context
External model calls are not always deterministic.

## Decision
Implement two explicit replay modes:

- State replay reconstructs known state from recorded events.
- Execution replay re-runs operations and may diverge.

## Consequences
- Clear user expectations around reproducibility.
- Better debugging and benchmarking semantics.

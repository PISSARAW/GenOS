# ADR-0002: Event Sourcing for Historical Truth

## Status
Accepted

## Context
Forking, replay, and auditing require immutable state transitions.

## Decision
Use append-only events as historical truth and derive materialized views from them.

## Consequences
- Time-travel and replay are first-class.
- Increased schema discipline for events.

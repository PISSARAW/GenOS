# ADR-0001: Separate Genome and State

## Status
Accepted

## Context
Agent identity/policies change less frequently than runtime beliefs and working memory.

## Decision
Represent durable configuration as Genome and mutable execution context as State.

## Consequences
- Better reproducibility and mutation control.
- Clean persistence boundaries and lower accidental coupling.

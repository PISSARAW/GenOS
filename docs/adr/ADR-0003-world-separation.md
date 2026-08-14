# ADR-0003: World Is Separate from Agent

## Status
Accepted

## Context
Counterfactual branches must mutate isolated environments without cross-contamination.

## Decision
Represent World as its own lifecycle entity with independent IDs and providers.

## Consequences
- Pluggable world providers.
- Strong branch isolation invariants.

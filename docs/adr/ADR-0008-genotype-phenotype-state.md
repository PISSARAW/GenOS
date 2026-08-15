# ADR-0008: Distinguish Genotype, Phenotype, and State

## Status
Accepted

## Implementation Status

Implemented. `genos-core::phenotype` provides serializable phenotype records,
observed traits, confidence/provenance, and explicit genome/phenotype
divergence. Genome and mutable state remain separate.

## Context

An agent's durable configuration, its measured behavioral expression, and its
current execution context are different kinds of data. Treating them as one
record makes cloning ambiguous and prevents experiments from separating the
effect of the genome from the effect of the model or environment.

## Decision

GenOS uses three explicit layers:

- **Genotype (Genome):** durable, portable properties inherited by a new
  instantiation. It includes identity, cognition, drives, objectives, and
  policies.
- **Phenotype:** observations and aggregates produced when a genome is run
  with a model, environment, history, and situation. It is measured output,
  not an additional source of truth for genome configuration.
- **State:** mutable execution context such as the current task, plan,
  working memory, beliefs, and event cursor.

Memory is acquired experience and remains distinct from both genome and
phenotype. A mutation may promote a stable learned strategy into a new genome,
but learning alone does not mutate a genome.

## Consequences

- Cloning may retain the genome while resetting phenotype and state.
- The same genome can be compared across model providers and environments.
- Measured behavior can be compared with declared genome traits through an
  explicit divergence report.
- Telemetry and observations must not silently become heritable configuration.

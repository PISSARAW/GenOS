# ADR-0010: Artificial selection preserves the population

## Status
Accepted

## Context

A genome mutation can improve one behavioral metric while degrading another.
Selecting only the highest aggregate score hides trade-offs and makes the
result dependent on undocumented weights.

## Decision

Mutation creates a new immutable child genome and records every changed path,
previous value, new value, parent genome, and version. Parent and child are
evaluated on the same tasks, model configuration, environment, seeds, budgets,
and repetitions.

The canonical metric set is:

- accuracy and task success;
- monetary cost, token usage, latency, and tool-call count;
- operational risk and unsupported-claim rate;
- novelty.

Each metric declares its unit and optimization direction. Hard constraints are
applied before ranking. Selection then reports the Pareto frontier; an optional
weighted winner may be reported only when the weights are stored with the
experiment. Every candidate remains addressable after selection.

## Consequences

- Selection does not delete or overwrite losing genomes.
- Results distinguish measured metrics from declared genome traits.
- Repeated mutation and selection form an auditable evolutionary lineage.
- A selected child may become the parent of another generation.


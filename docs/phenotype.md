# Phenotype and divergence

The genome describes the agent intended by its author. The phenotype records
what is actually observed after instantiation. It is contextual: the same
genome may produce different phenotypes with different model providers or
worlds.

```text
Genome G + Model M + Environment E + History H -> Phenotype P + State S
```

Phenotype records should identify their measurement context and should be
append-only or versioned. Typical measurements include verification frequency,
unsupported-claim rate, task completion rate, and tool failure rate.

A divergence report compares a declared genome expectation with an observed
phenotype measurement:

```yaml
metric: unsupported_claim_rate
expected: 0.05
observed: 0.18
delta: 0.13
status: divergence_detected
```

This is an evaluation result, not a mutation. A mutation is a separate,
reviewable lineage event that records its parent genome, cause, changed paths,
and expected effect.

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

## Heredity experiments

To separate inherited behavior from acquired behavior, create sibling clones
from one ancestor and record their baseline before assigning different
experiences:

```text
                          shared genome G
                                |
                +---------------+---------------+
                |               |               |
               A1              A2              A3
          development       research       management
                |               |               |
               P1              P2              P3
```

Evaluating `P1`, `P2`, and `P3` on the same suite estimates the effect of
experience while the genome is fixed. Estimating a genome effect requires the
inverse experiment: several genomes exposed to the same initial state,
experience, model, environment, and evaluation suite.

The two effects are not always additive. A complete design also measures the
genome-by-experience interaction: the same experience may shape two genomes in
different ways.

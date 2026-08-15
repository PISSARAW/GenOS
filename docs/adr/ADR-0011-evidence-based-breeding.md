# ADR-0011: Breeding targets measured traits, not declared labels

## Status
Accepted

## Context

Combining prompt fragments or averaging self-declared trait values does not
establish inheritance. A declared `creativity: 0.9` may not correspond to
observed behavior and may change with the model or evaluation context.

## Decision

Breeding consumes two immutable parent genomes and comparable phenotype
observations. A phenotype trait is an estimate with an evaluation suite,
sample size, uncertainty, context, and provenance.

Recombination produces a child genome and a set of target hypotheses. The child
is always labelled `untested_candidate`. Its traits are estimated from an
independent evaluation; target values never become phenotype observations by
copying them into the result.

Parent observations must use compatible protocols. Recombination may be
weighted, Pareto-based, or constraint-guided. The complete strategy and parent
contributions are recorded as lineage metadata.

## Consequences

- Genomes encode mechanisms, priors, and constraints rather than certified
  behavioral properties.
- Phenotypic values remain contextual empirical estimates.
- A child may fail to express its target traits or exhibit unexpected traits.
- Heritability can be estimated across many parent-child observations instead
  of assumed from one breeding event.


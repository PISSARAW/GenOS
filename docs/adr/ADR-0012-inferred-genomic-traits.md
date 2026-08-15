# ADR-0012: Store discovered traits as inferred genomic claims

## Status
Accepted

## Context

Repeated phenotype evaluations may reveal stable characteristics that were not
declared by the genome author. Copying an observed value directly into the
genome would confuse contextual behavior with heritable structure and create a
feedback loop in which an evaluation result becomes true by declaration.

## Decision

GenOS distinguishes three representations:

1. **Declared trait:** an authored prior, constraint, or intended tendency in
   the genome.
2. **Observed trait:** a contextual phenotype estimate produced by an
   evaluation suite.
3. **Inferred genomic trait:** an evidence-backed hypothesis that a stable,
   heritable characteristic exists in the genome.

Inferred traits may be attached to a genome as annotations. Each claim records
its estimate, uncertainty or confidence, observation count, evaluation
contexts, provenance, inference method, and status. It does not alter runtime
behavior unless promoted through an explicit mutation.

An inferred claim may be labelled `candidate`, `replicated`, `disputed`, or
`rejected`. `Replicated` requires observations across multiple contexts and
re-instantiations. A claim about heritability additionally requires descendant
evidence; stability within one agent is insufficient.

## Consequences

- A genome can accumulate scientific knowledge about itself without silently
  changing its executable configuration.
- Phenotype measurements remain immutable evidence linked by reference.
- Circular self-confirmation is avoided by independent evaluation.
- Promotion from inferred knowledge to executable genome configuration remains
  an auditable mutation.


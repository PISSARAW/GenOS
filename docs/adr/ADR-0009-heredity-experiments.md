# ADR-0009: Model heredity as controlled cohorts

## Status
Accepted

## Implementation Status

Not implemented. The portable cohort schema exists, but there is no cohort
runner enforcing baselines, treatments, controls, or genome-by-experience
analysis.

## Context

Forking several agents from one snapshot creates a natural experiment. The
agents begin with the same genome and inherited state, then accumulate distinct
experience. Comparing only their final snapshots cannot determine whether a
difference came from the genome, the initial state, the model, the environment,
or the experience assigned after cloning.

## Decision

GenOS represents heredity experiments as cohorts. Every cohort records:

- a common ancestor snapshot;
- a shared genome digest;
- the inherited-state policy used when cloning;
- one treatment describing each clone's experience;
- controlled model and environment variables;
- repeated evaluations using the same task suite;
- phenotype observations linked to their evidence and evaluation run.

The initial clone snapshots form the baseline. A clone is valid only if its
genome digest equals the cohort digest and its baseline differs from its
siblings only in explicitly permitted identity and lineage fields.

Three comparisons are distinguished:

1. **Experience effect:** same genome, controlled model/environment, different
   histories.
2. **Genome effect:** different genomes, controlled initial state,
   model/environment, and evaluation suite.
3. **Interaction effect:** whether a genome responds differently to a given
   experience, requiring multiple genomes and repeated treatments.

## Consequences

- A fork is an ancestry operation; a treatment is an experimental operation.
- Memory and phenotype may diverge without genome mutation.
- Any mutation during a treatment ends membership in the original fixed-genome
  cohort or starts a separately identified descendant cohort.
- Claims about nature versus experience require controlled comparisons and
  uncertainty, not a raw snapshot diff.

# GenOS Genome Specification (v0alpha1)

This specification defines the portable and normative shape of an Agent Genome.

## Normative Concepts

- Genome (genotype): Durable identity and cognitive/policy configuration of an
  agent. It is the inherited layer.
- Phenotype: Measured behavioral and cognitive expression of a genome under a
  particular model, environment, history, and situation.
- State: Runtime and mutable context of an agent.
- Snapshot: Reproducible checkpoint combining genome/state/world/runtime metadata.

## Non-Normative Implementation Details

The following are implementation concerns and are not part of portability guarantees:

- PostgreSQL table layout
- Object storage backend
- Runtime process scheduler internals
- Specific model provider SDK bindings

## Required Genome Sections

- metadata
- identity
- cognition
- objectives
- policies
- capabilities
- memory_policy
- model_policy
- tool_policy
- drives

## Layering rules

- Genome MUST NOT contain current tasks, plans, working memory, beliefs,
  telemetry, or other runtime state.
- Phenotype SHOULD contain observations and aggregates, such as verification
  frequency or unsupported-claim rate, together with the model and environment
  used to measure them.
- State contains the current execution context and may reference a genome and
  phenotype observation set.
- Memory is acquired experience. Learning MUST NOT be treated as a genome
  mutation unless an explicit, recorded mutation is proposed and accepted.

## Drives

Drives are stable behavioral tendencies, distinct from objectives (what the
agent tries to achieve) and policies (what it is allowed or required to do).
Implementations MAY define additional drive names, but values MUST be bounded
between `0.0` and `1.0`.

Recommended names include `curiosity`, `caution`, `completion`, `autonomy`,
`verification`, and `novelty_seeking`.

## Discovered characteristics

A genome MAY reference inferred trait claims discovered through phenotype
evaluation. These claims are annotations about the genome, not executable
configuration and not copies of mutable phenotype state.

An inferred claim MUST include evidence, an inference method, uncertainty or
confidence, and an observation count. Claims of heritability MUST cite
descendant cohorts. Repeated observations from one agent can demonstrate
stability, but cannot by themselves demonstrate inheritance.

The portable claim shape is defined by `spec/genome-trait-claim.schema.json`.

## Serialization

Portable formats:

- YAML
- JSON

Schema source:

- spec/genome.schema.json

## Compatibility

- apiVersion MUST be present in portable files.
- kind MUST equal AgentGenome.
- Unknown fields SHOULD be tolerated in readers and preserved by tooling where possible.

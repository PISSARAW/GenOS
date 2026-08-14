# GenOS Genome Specification (v0alpha1)

This specification defines the portable and normative shape of an Agent Genome.

## Normative Concepts

- Genome: Durable identity and cognitive/policy configuration of an agent.
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

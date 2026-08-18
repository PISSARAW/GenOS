# genos-core

`genos-core` is the foundational library of GenOS, defining the most critical types and abstractions.

## Responsibilities
- **Snapshots**: Defines `AgentSnapshot`, logical state, branch metadata, and identity.
- **Lineage**: Defines the graph structure for tracing the evolution of branches (`LineageDag`, `LineageNode`).
- **Memory**: Defines traits and structures for Semantic and Episodic memories.

This crate is the heart of the system and must remain extremely stable and lightweight.

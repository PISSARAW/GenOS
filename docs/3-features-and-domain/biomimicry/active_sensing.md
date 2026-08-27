# Active Sensing (Echolocation)

## Concept

In nature, bats and dolphins use echolocation to dynamically map their environment by emitting clicks and processing the echoes. In GenOS, **Active Sensing** replaces the standard, rigid "grill-me" interrogation pattern. 

Instead of freezing the agent and overwhelming the user with a monolithic questionnaire before taking action, GenOS emits rapid, focused "clicks" (micro-queries) when encountering ambiguity in the constraint space. 

## Implementation

- **Core Module**: `crates/genos-core/src/biomimicry/active_sensing.rs`
- **CLI Command**: `genos bio-feature active_sensing emit` and `receive`
- **MCP Tool**: `genos_active_sensing`

## Mechanism
1. The agent identifies a gap or ambiguity in the business constraints.
2. It calls `genos_active_sensing` with a `focus` and `ambiguity` level to emit a click.
3. The system maps the returned echo to constraint resolution and recalculates map completeness dynamically.

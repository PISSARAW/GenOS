---
name: replay-causal-history
description: Restore a historical agent decision point, fork alternative realities, replay the same known future events, and explain which decisions caused later effects. Use for counterfactual architecture reviews, revisiting past product decisions, temporal simulation, and causal debugging across a persisted history.
---

# Replay Causal History

Use `genos_causal_replay_experiment` from the GenOS MCP server.

## Workflow

1. Confirm the historical snapshot, original decision, counterfactual choices, shared event stream, and evaluation horizon.
2. Require a causal replay manifest. Keep observed events distinct from assumptions introduced by each universe.
3. Call `genos_causal_replay_experiment` with the manifest and optional experiment root.
4. Check that every universe starts from the same restored point and replays the same eligible events.
5. Compare final state, decision effects, causal chains, and divergence points. Label inferences; do not claim that a simulation proves what would have happened in production.
6. Return the original reality, counterfactual outcomes, causal explanations, lineage, and report path.

Preserve every universe for later inspection. Replaying from the past must not rewrite or delete the recorded original history.

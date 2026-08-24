# Four agents DP comparison

Pilot comparing four agent configurations on the expert partition-DP fixture
from `benchmarks/expert-dp-comparison`: a plain agent, a plain agent with an
expert prompt, a GenOS worker executing inside a capsule, and a GenOS
orchestrator running the ADR-0019 counterfactual cycle (three rival forks,
sibling-world grading, evidence-based selection).

Because no Codex CLI was available on this machine, all four arms shared one
underlying conversational model and arms 3-4 used the native `genos` CLI
instead of the MCP server. The committed pilot is an integration proof only:
`publication_gate.publishable` is false. See the run's `report.json`.

Key measured outcomes: the expert prompt moved 3/4 to 4/4; the GenOS worker
added traceability (S0 -> events -> budget -> S1) at zero model tokens; the
orchestrator rejected the quadratic candidate on timeout and a greedy
candidate on oracle mismatch, then promoted the optimized winner.

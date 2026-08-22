<p align="center">
  <img src="../../assets/brand/genos-logo.png" width="112" alt="GenOS official logo">
</p>

# GenOS Software Dev plugin

This Codex plugin exposes GenOS trajectory-engineering primitives over MCP.
It launches the repository's `genos-mcp` server and stores durable development
objects under the target project's `.genos/dev` directory.

The plugin adds tools for:

- falsification-oriented diagnosis and native hypothesis trees;
- concurrent solve trajectories, branch pruning, adaptive budgets, model escalation,
  blind review, and minimal-patch search;
- causal blame, living decisions/ADRs, assumption and spec-to-code/test lineage;
- branch experience transfer, negative knowledge, and failed-approach search;
- adversarial/counterfactual review and future-world CI/migration planning;
- assumption invalidation, agent bisect, stuck/loop detection, automatic revert
  points, repository genomes, architecture invariants, and compiled context.

It also ships seven task-oriented skills backed by six first-class MCP tools:

- `compare-code-fixes` and `evolve-critical-refactor` use
  `genos_workspace_experiment`;
- `replay-causal-history` uses `genos_causal_replay_experiment`;
- `reproduce-production-incident` uses `genos_incident_experiment`;
- `run-scientific-research` uses `genos_scientific_experiment`;
- `coevolve-security-strategies` uses `genos_security_coevolution`;
- `investigate-unknown-cause-bug` uses `genos_bug_investigation`.

Each project tool accepts a complete manifest. Where the CLI supports direct
inputs, the MCP tool also accepts those inputs plus a reusable plan and rejects
mixed or partial modes before execution.

Build once before first use:

```powershell
cargo build -p genos-cli -p genos-mcp
```

All state-changing tools are advertised to MCP clients as writes. Read-only
search, blame, and bisect tools are annotated as read-only.

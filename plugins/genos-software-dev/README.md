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

Build once before first use:

```powershell
cargo build -p genos-cli -p genos-mcp
```

All state-changing tools are advertised to MCP clients as writes. Read-only
search, blame, and bisect tools are annotated as read-only.

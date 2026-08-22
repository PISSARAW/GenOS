# Codex: GenOS MCP vs standard agent

This smoke benchmark runs the same read-only root-cause task with every model
visible in the local Codex model catalog. Each model is invoked twice at medium
reasoning effort:

- `standard`: user configuration ignored, no MCP server;
- `genos`: identical invocation with only the local GenOS MCP server added.

Run it from the repository root:

```bash
node benchmarks/codex-genos-comparison/run.mjs
```

Pass model slugs to run a subset. The latest aggregate report is written to
`results/latest.json`; raw responses, JSONL events, and stderr logs are retained
under a timestamped directory in `results/runs/`.

After changing only the deterministic rubric, recompute scores without making
new model calls:

```bash
node benchmarks/codex-genos-comparison/run.mjs --rescore-latest
```

The benchmark deliberately makes a narrow claim. A single deterministic task
can detect regressions, MCP overhead, and obvious correctness differences, but
cannot establish that one agent architecture is generally superior.

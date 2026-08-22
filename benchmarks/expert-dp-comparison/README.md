# Expert DP comparison

This benchmark asks the same model to implement an optimized partition DP in a
fresh Rust fixture. `standard` has no MCP server; `genos` receives the local
GenOS MCP catalog. Correctness is graded only by `cargo test`; time and token
figures are recorded from the Codex event stream.

The default raw-MCP comparison measures the marginal cost of exposing the tool
catalog. It is not an orchestrator benchmark. Run it with:

```bash
node benchmarks/expert-dp-comparison/run.mjs gpt-5.6-sol
```

The additional, token-spending orchestrator condition runs with:

```bash
node benchmarks/expert-dp-comparison/run.mjs gpt-5.6-sol --orchestrator
```

It executes through `backend/bin/genos-agent-runtime.cjs`, records
worker/strategy telemetry in `orchestrator.json`, then grades the resulting
fixture. Do not compare raw-MCP and orchestrator timings as if they were the
same intervention: the first measures tool availability; the second measures
an autonomous control loop.

The task is deliberately one expert problem and one run per condition. It is a
controlled experiment, not a general capability ranking.

# Agent architecture comparison

This benchmark compares three architectures on the same hidden-test tasks:

- `simple`: one Codex agent at medium reasoning effort;
- `boosted`: one Codex agent at high effort with an explicit hypothesis and verification protocol;
- `genos`: one GenOS orchestrator started through the public `genos_orchestrate` MCP tool, with bounded workers and leased internal tools.

The pilot uses `gpt-5.6-terra`, the three stateful GenOS AgentBench tasks, and
one repetition (nine agent runs):

```bash
node benchmarks/agent-architecture-comparison/run.mjs \
  --model gpt-5.6-terra --repetitions 1
```

Validate fixtures and hidden graders without spending model tokens:

```bash
node benchmarks/agent-architecture-comparison/test-harness.mjs
```

Functional hidden-test score is primary. Tokens, billable tokens, latency,
protected-file integrity, worker failures, and MCP completion are secondary.
GenOS token totals include both Codex runtimes and metered local-model planning.
The report refuses a superiority claim before at least three repetitions.

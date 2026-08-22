# Safe-debugging execution benchmark

Run ten repetitions from the repository root:

```bash
node benchmarks/safe-debugging/run-benchmark.mjs 10
```

The harness compares three execution shapes over the same deterministic
fixture: one known-bad attempt, sequential retries in a declared order, and the
GenOS snapshot/fork/test/replay/promotion workflow. It writes the aggregate
report to [`results/latest.json`](results/latest.json) and every raw sample to
[`results/samples.jsonl`](results/samples.jsonl).

This is an execution-mechanics benchmark, not an agent or model leaderboard.
The candidate order is fixed, GenOS performs more safety operations than the
two baselines, and no language model is invoked. Durations, zero token use, and
zero model cost are retained to make those boundaries auditable.

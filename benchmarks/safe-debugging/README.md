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

## Latest published run

Revision under test: `322c3eef23c5b98ed7caebca2c015755cb79685b`,
Apple M5 arm64, 10 repetitions.

| Mode | Successful runs | Median wall time | Trace and replay |
| --- | ---: | ---: | --- |
| One fixed attempt | 0 / 10 | 42.02 ms | No |
| Fixed sequential retry | 10 / 10 | 122.20 ms | No |
| GenOS branches | 10 / 10 | 1,004.71 ms | 10 / 10 verified |

GenOS is slower in this tiny fixture because it performs 15 safety and
evidence operations rather than only invoking the test process. The publishable
result is the verified isolation/replay behavior, not a speed advantage.

Measured GenOS usage across all runs: **0 model calls, 0 input tokens, 0 output
tokens, and $0.00**, because this fixture tests runtime mechanics without an
agent model. See [`results/latest.json`](results/latest.json) for the aggregate,
environment, and limitations; see [`results/samples.jsonl`](results/samples.jsonl)
for all raw samples.

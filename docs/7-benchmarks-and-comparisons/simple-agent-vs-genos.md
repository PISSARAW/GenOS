# Linear attempts and GenOS branching

This page defines the comparison GenOS can defend today. It does not claim
that GenOS improves model intelligence, task success, latency, or token cost
without an executed, versioned benchmark.

## The operational difference

| Mode | State handling | Failed attempts | Selection evidence | Replay |
| --- | --- | --- | --- | --- |
| One attempt | Mutates one working directory | Remains in that directory | Pass/fail only | Not captured |
| Sequential retry | Restores or repairs state between attempts | Depends on the harness | Ordered test results | Optional |
| GenOS branches | Forks candidates from one snapshot | Kept in sibling worlds | Per-branch events, exit codes, diffs, and tests | Winner restored and checked |

This is a comparison of execution mechanics, not a comparison of language
models. A well-built conventional harness can implement restoration, tracing,
and replay too. GenOS packages those operations as explicit state primitives.

## Runnable safe-debugging proof

From the repository root:

```bash
./examples/safe-debugging-demo/run-demo.sh
```

The fixture contains a discount boundary bug and three candidate mutations.
The command:

1. reproduces the failure;
2. snapshots the failing filesystem world;
3. forks three isolated candidate worlds;
4. executes the same five tests in every world;
5. rejects the two candidates that fail;
6. restores the original snapshot and reapplies the winner;
7. requires the replay and selected world to have zero differing files;
8. snapshots the verified result for conditional promotion.

Raw evidence is retained in
[`examples/safe-debugging-demo/artifacts/`](../../examples/safe-debugging-demo/artifacts/).
The deterministic fixture makes no model call, so measured model tokens and
cost are both zero. That is not a claim that real agent workloads are free.

## Claims this proof supports

- sibling directory worlds do not share relative file writes;
- each candidate receives the same starting fixture and test command;
- a failing candidate cannot pass the explicit test gate;
- the selected mutation can be replayed from the original snapshot;
- the replayed filesystem matches the selected filesystem for this fixture;
- operations, exit codes, durations, model-call count, tokens, and cost are
  recorded in machine-readable evidence.

## Claims this proof does not support

- better reasoning or higher success rates than another agent framework;
- OS-level sandboxing, network isolation, or protection from hostile commands;
- deterministic language-model inference;
- production-safe automatic merging;
- lower latency or cost on real coding-agent tasks;
- generalization beyond the included fixture.

Those claims require the shared protocol in
[`reproducible-benchmark-protocol.md`](reproducible-benchmark-protocol.md),
the success-rate protocol in
[`agent-success-benchmark-protocol.md`](agent-success-benchmark-protocol.md),
versioned external-runtime adapters, repeated samples, raw provider usage, and
independent reproduction.

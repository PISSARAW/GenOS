# Proof and benchmark status

GenOS is centered on one testable proposition: **Git-like branching and
deterministic replay for AI-agent state**. This page separates what can be
reproduced today from what has not yet been measured.

## Evidence levels

| Level | Meaning | Acceptable evidence |
| --- | --- | --- |
| Implemented | Code exists in the repository | Source link and focused test |
| Reproduced | A documented command passes on a named revision | Command, environment, and raw output |
| Measured | A quantitative result was collected | Harness, warmups, repetitions, raw JSON, and machine metadata |
| Compared | The same protocol ran against another system | Versioned adapters and equivalent inputs |
| Externally validated | A third party reproduced the result | Independent public report or artifact |

Passing a correctness test is not a latency benchmark. An architecture document
is not evidence that a feature is implemented.

## Reproducible product proofs

Run these commands from the repository root:

| Claim under test | Command | Expected evidence |
| --- | --- | --- |
| Safe parallel debugging with conditional promotion | `./examples/safe-debugging-demo/run-demo.sh` | JSON report and JSONL operations under `examples/safe-debugging-demo/artifacts/` |
| Snapshot, fork, isolated identity, and diff | `./run-demo.sh` | Ends with `Demo OK` |
| Event reducer replay is stable for its supported inputs | `cargo test -p genos-store --test replay_tests` | Test process exits successfully |
| Relative file changes remain isolated between directory worlds | `cargo test -p genos-world --test file_isolation` | Test process exits successfully |
| Documented world-boundary limitations remain explicit | `cargo test -p genos-world --test isolation_boundaries` | Test process exits successfully |

These checks support only their named invariants. They do not establish
deterministic model inference, network replay, OS-level sandboxing, enterprise
readiness, or superiority over another framework.

## Published measurements

The [safe-debugging execution benchmark](../../benchmarks/safe-debugging/)
publishes repeated raw samples for the deterministic product fixture. It
measures success under a declared candidate order, GenOS replay verification,
merge-gate decisions, wall time, model calls, tokens, and model cost. Because
the fixture invokes no model, its measured model usage is zero.

This is not a validated cross-framework or model-quality result. There is
still no maintained comparison of external agent runtimes, blast radius,
MTTR, throughput, or real provider token cost.

### GenOS AgentBench pilot

[`benchmarks/genos-agentbench`](../../benchmarks/genos-agentbench/) adds an
active, model-backed comparison between standard Codex and the same model with
the GenOS MCP server. Three stateful repair tasks are graded after agent exit by
eight task-specific checks. The publication profile requires every visible
Codex model, all tasks, at least three repetitions, paired bootstrap confidence
intervals, raw traces, and a clean revision. Hypotheses, sampling, statistics,
and gates are fixed by the
[agent success benchmark protocol](agent-success-benchmark-protocol.md).

The committed pilot is intentionally not a published superiority result: one
GPT-5.4 Mini pair on `lease-ledger` passed 8/8 checks in both conditions. The
GenOS arm made four MCP calls, proving active integration, while the paired
quality delta remained zero. Its `publication_gate.publishable` value is false.

The benchmark executables can produce local measurements, but a result becomes
publishable only when its raw JSON and environment metadata are reviewed and
committed. Use the [reproducible benchmark protocol](reproducible-benchmark-protocol.md)
for replay and world measurements and the
[agent success benchmark protocol](agent-success-benchmark-protocol.md)
for model-backed comparisons rather than copying numbers from design or
research documents.

## Measurement protocol

```bash
cargo run --release -p genos-store --bin replay_benchmark -- \
  --iterations 500 --events 100 --warmups 20 > replay.json

cargo run --release -p genos-world --bin world_benchmark -- \
  --iterations 500 --warmups 20 > world.json
```

Before publication, retain:

- the exact Git revision and dirty-worktree state;
- OS, architecture, CPU, memory, Rust version, and power mode;
- the complete command and configuration;
- all raw samples, not only averages;
- failures and unsupported fields;
- the reviewer and reproduction date.

## Evidence still missing

- versioned adapters for external agent runtimes;
- same-machine comparative runs using equivalent state and fault profiles;
- token and provider-cost accounting across branch strategies;
- model, network, clock, and external-tool replay boundaries;
- OS-enforced filesystem, process, and network isolation measurements;
- independent reproduction by a contributor outside the core project;
- a reviewed public result bundle tied to a release.

Until those exist, use qualitative language and label design targets as
targets. Contributions that close one evidence gap are listed in the
[good first issue backlog](../5-development-workflows/good-first-issues.md).

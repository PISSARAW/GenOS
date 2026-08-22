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
| Snapshot, fork, isolated identity, and diff | `./run-demo.sh` | Ends with `Demo OK` |
| Event reducer replay is stable for its supported inputs | `cargo test -p genos-store --test replay_tests` | Test process exits successfully |
| Relative file changes remain isolated between directory worlds | `cargo test -p genos-world --test file_isolation` | Test process exits successfully |
| Documented world-boundary limitations remain explicit | `cargo test -p genos-world --test isolation_boundaries` | Test process exits successfully |

These checks support only their named invariants. They do not establish
deterministic model inference, network replay, OS-level sandboxing, enterprise
readiness, or superiority over another framework.

## Published measurements

No maintained quantitative result set is currently published in this
repository. In particular, there is no validated cross-framework latency,
token-cost, blast-radius, MTTR, or throughput table.

The benchmark executables can produce local measurements, but a result becomes
publishable only when its raw JSON and environment metadata are reviewed and
committed. Use the [reproducible benchmark protocol](reproducible-benchmark-protocol.md)
rather than copying numbers from design or research documents.

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

# Competitive evaluation matrix

This document is a test plan, not a leaderboard. GenOS has not yet published a
reviewed, same-machine comparison against external agent runtimes. Earlier
unvalidated latency, blast-radius, replay, and scorecard values were removed so
that repository claims cannot be mistaken for measurements.

## Product focus

GenOS is being evaluated around one proposition: **Git-like branching and
deterministic replay for AI-agent state**. A useful comparison must therefore
test a complete state lifecycle rather than count features:

```text
snapshot -> fork -> mutate -> isolated run -> event/cost/token capture
         -> diff -> replay -> audit -> conditional merge
```

## Candidate comparison axes

| Axis | Required observation | GenOS evidence | External evidence |
| --- | --- | --- | --- |
| Logical-state fork | Two children share a declared baseline and receive distinct identities | Runnable demo; quantitative result missing | Adapter missing |
| Filesystem isolation | A sibling cannot observe another sibling's relative write | Focused tests; OS sandbox not claimed | Adapter missing |
| Event provenance | Branch events retain parentage and ordering needed by the reducer | Focused replay tests | Adapter missing |
| Structural diff | Changed state is reported without comparing prose only | Runnable demo | Adapter missing |
| Replay scope | Replayed fields and nondeterministic boundaries are explicit | Reducer-level proof | Adapter missing |
| Cost accounting | Model, tool, token, wall-time, and storage costs use a shared schema | Missing | Adapter missing |
| Conditional merge | Promotion is blocked when declared checks fail | Example-level evidence; common harness missing | Adapter missing |
| Audit bundle | Revision, environment, commands, events, and results are exportable | Partial metadata in benchmark binaries | Adapter missing |

“Missing” and “unsupported” are valid results. They must never be represented
as zero, false, or a perfect score.

## Systems to evaluate

External systems should be selected only after a versioned adapter exists.
Likely candidates include graph-based agent runtimes, durable workflow engines,
observability platforms, and plain Git worktrees. Their current capabilities
must be established from the version under test, not from memory or historical
marketing pages.

No statement in this document implies that an external system lacks a feature
or that GenOS performs better.

## Fair comparison rules

1. Pin every runtime, adapter, model, and container image.
2. Use equivalent initial state, branch mutation, tool policy, and fault input.
3. Run on the same machine and power profile, or disclose the difference.
4. Separate setup time, warmups, execution, persistence, and cleanup.
5. Preserve raw samples, failures, and unsupported metrics.
6. Distinguish logical isolation from process, filesystem, and network sandboxing.
7. Report token and provider costs alongside latency where an LLM is involved.
8. Have a reviewer reproduce the commands from a clean checkout.

## Publication gate

A row may receive a quantitative value only when the repository contains:

- a versioned adapter and scenario input;
- the exact command and success criteria;
- raw machine-readable results;
- environment and revision metadata;
- a limitations section;
- evidence of a second run or independent review.

Until then, consult the [proof and benchmark status](proof-and-benchmark-status.md),
the [reproducible protocol](reproducible-benchmark-protocol.md), and the
[agent success benchmark protocol](agent-success-benchmark-protocol.md).

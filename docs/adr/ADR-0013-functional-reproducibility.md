# ADR-0013: Define agent restoration by functional reproducibility

## Status
Accepted

## Implementation Status

Partially implemented. `genos-eval` computes conservative equivalence verdicts
from metric confidence intervals. The paired replay runner and behavioral
similarity metric extractors are not implemented.

## Context

Exact output replay is generally unavailable when models, tools, schedulers, or
external services are probabilistic. Text equality is also a poor proxy for
agent identity: two valid plans may use different wording, while two similar
texts may lead to materially different actions.

## Decision

GenOS defines a restored agent as functionally reproducible when its behavior
is statistically equivalent to the source agent across a declared behavioral
contract.

The source and restored agents receive paired event streams under pinned model,
tool, environment, policy, and budget manifests. The experiment is repeated
across declared seeds or sampling draws. Metrics may include decision
similarity, tool selection, belief consistency, planning similarity, risk
behavior, task success, cost, and latency.

Each metric records a similarity estimate, confidence interval, equivalence
threshold, paired-trial count, method, and criticality. A critical metric passes
only when the lower confidence bound reaches its threshold. A confidence
interval crossing the threshold is `inconclusive`; an interval entirely below
it is `not_equivalent`.

The report also records all known sources of nondeterminism. Exact replay may be
reported separately when every dependency supports deterministic execution.

## Consequences

- Reproducibility is a graded, protocol-relative claim rather than byte
  equality.
- More trials can turn an inconclusive result into an equivalence or rejection.
- Safety-critical behavior cannot be hidden by a high aggregate average.
- A snapshot format is insufficient unless runtime and environmental manifests
  are also capturable.
